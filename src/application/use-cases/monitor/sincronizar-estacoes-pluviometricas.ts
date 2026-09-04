/**
 * Use-case: sincronizar estações do SIBH para o banco local.
 *
 * O Monitor PERSISTE o cadastro de estações (decisão de arquitetura). Esta
 * sincronização puxa as estações do SIBH, filtra os três tipos hidrológicos
 * suportados (pluviométrico, fluviométrico, piezométrico; descarta qualidade e
 * desconhecido), e faz upsert idempotente por `sibhId` (chave natural estável)
 * em `estacoes_pluviometricas` com o canal 'automatico' (estação vinda do
 * logger do SIBH) e o `tipoEstacao` correspondente. Conflitar por sibhId (e não
 * por prefixo) permite que o mesmo prefixo coexista em tipos diferentes.
 *
 * VÍNCULO AO CATÁLOGO DE POSTOS, e por que ele é um booleano
 *
 * Depois do ADR-0023 o catálogo de postos vive no SQL Server do órgão, e
 * `postosRepo.mapaIdsPorPrefixo()` devolve o `Postos.Id` DELES. Até a migration
 * 0067 esse id era gravado em `estacoes_pluviometricas.posto_id`, que era chave
 * estrangeira para a nossa tabela `postos` (vazia por desenho): toda estação que
 * CASAVA com um posto era recusada pelo banco, 2.714 das 5.415, e a sincronização
 * respondia HTTP 200 com os erros no corpo.
 *
 * Agora o que atravessa é só o fato de ter casado. O mapa continua sendo
 * carregado numa consulta por lote, que é o que o ADR-0023 prescreve para
 * composição entre os dois armazenamentos; o que mudou é que o identificador do
 * outro banco morre aqui, dentro deste arquivo, e não vira coluna nossa.
 *
 * Camada fina e testável: recebe as portas por injeção, não conhece banco nem
 * HTTP. Degrada por estação (uma estação ruim não derruba o lote inteiro).
 */

import type {
  SibhGateway,
  EstacaoSibh,
} from '@/application/ports/sibh-gateway';
import type { EstacoesPluviometricasRepository } from '@/application/ports/estacoes-pluviometricas-repository';
import type { PostosRepository } from '@/application/ports/postos-repository';
import type { TipoHidrologico } from '@/domain/monitor/estacao-pluviometrica';

/**
 * Tipos hidrológicos do SIBH que o Monitor persiste. 'qualidade' e
 * 'desconhecido' ficam de fora (não têm tratamento de leitura no Monitor).
 * O tipo é `TipoHidrologico`, então o filtro serve também de narrow.
 */
const TIPOS_HIDROLOGICOS: ReadonlySet<TipoHidrologico> = new Set<TipoHidrologico>([
  'pluviometrico',
  'fluviometrico',
  'piezometrico',
]);

function ehTipoHidrologico(tipo: EstacaoSibh['tipo']): tipo is TipoHidrologico {
  return TIPOS_HIDROLOGICOS.has(tipo as TipoHidrologico);
}

/**
 * Quantas estações são gravadas em paralelo.
 *
 * Casado com o `max` do cliente de banco (`src/infrastructure/db/client.ts`),
 * que hoje é 5. O pooler do Supabase aceita 15 sessões no total, e elas são
 * compartilhadas com quem está usando o sistema: passar disso derruba o banco
 * de produção com `max clients reached in session mode`, medido em 18/08/2026.
 *
 * Ao mexer no `max` do cliente, revisar este número junto.
 */
const CONCORRENCIA_UPSERT = 5;

export interface ResumoSyncEstacoes {
  /**
   * Total de estações recebidas do SIBH após o filtro (os três tipos
   * hidrológicos: pluviométrico, fluviométrico e piezométrico).
   */
  totalSibh: number;
  /** Quantas estações foram inseridas ou atualizadas no banco. */
  upsertadas: number;
  /**
   * Quantas estações casaram com um posto do catálogo do órgão, pelo prefixo.
   *
   * Contado no CASAMENTO, e não na gravação: antes ele era incrementado depois
   * do upsert, e como o upsert falhava justamente para quem casava, o número
   * saía `0` e se lia como "nenhuma estação tem posto" quando o fato era
   * "todas as que têm posto falharam". Falha de escrita aparece em `erros`, que
   * é onde ela pertence; este campo responde à cobertura SIBH x catálogo.
   */
  vinculadasAposto: number;
  /** Estações puladas por não terem coordenada válida (lat/lng obrigatórios). */
  puladasSemCoordenada: number;
  /**
   * Estações puladas por não terem `id` no SIBH (não deveria ocorrer: o id é a
   * chave natural do upsert). Contabilizado por robustez, sem derrubar o lote.
   */
  puladasSemId: number;
  /** Estações que falharam individualmente (com motivo para diagnóstico). */
  erros: Array<{ prefixo: string; motivo: string }>;
}

/**
 * Sincroniza o cadastro de estações pluviométricas.
 *
 * @param sibh        Gateway do SIBH (fonte das estações automáticas).
 * @param estacoesRepo Repositório de estações do Monitor (upsert por sibhId).
 * @param postosRepo  Catálogo de postos do órgão (só para saber se o prefixo da
 *                    estação existe lá; o id dele não sai deste arquivo).
 */
export async function sincronizarEstacoesPluviometricas(
  sibh: SibhGateway,
  estacoesRepo: EstacoesPluviometricasRepository,
  postosRepo: PostosRepository,
): Promise<ResumoSyncEstacoes> {
  const todas = await sibh.listarEstacoes();
  const hidrologicas = todas.filter((e) => ehTipoHidrologico(e.tipo));

  const resumo: ResumoSyncEstacoes = {
    totalSibh: hidrologicas.length,
    upsertadas: 0,
    vinculadasAposto: 0,
    puladasSemCoordenada: 0,
    puladasSemId: 0,
    erros: [],
  };

  // Vínculo ao catálogo em UMA consulta, e não uma por estação. Antes eram
  // cerca de 5.400 idas ao banco só para descobrir o posto de cada prefixo, e
  // isso sozinho já estourava a janela de execução.
  const idsPorPrefixo = await postosRepo.mapaIdsPorPrefixo();

  // Concorrência limitada: o cliente abre no máximo CONCORRENCIA_UPSERT
  // conexões (`max` em db/client.ts) e o pooler do Supabase aceita 15 sessões
  // no total, compartilhadas com quem está usando o sistema. Disparar tudo de
  // uma vez derrubaria o banco de produção; manter estritamente em série não
  // cabe no tempo. O meio é processar em ondas do tamanho do pool.
  for (let i = 0; i < hidrologicas.length; i += CONCORRENCIA_UPSERT) {
    const onda = hidrologicas.slice(i, i + CONCORRENCIA_UPSERT);
    await Promise.all(
      onda.map(async (estacao) => {
        try {
          await sincronizarUma(estacao, estacoesRepo, idsPorPrefixo, resumo);
        } catch (e) {
          // Tolera falha por estação: registra o motivo e segue o lote.
          resumo.erros.push({
            prefixo: estacao.prefixo,
            motivo: e instanceof Error ? e.message : String(e),
          });
        }
      }),
    );
  }

  return resumo;
}

async function sincronizarUma(
  estacao: EstacaoSibh,
  estacoesRepo: EstacoesPluviometricasRepository,
  idsPorPrefixo: ReadonlyMap<string, string>,
  resumo: ResumoSyncEstacoes,
): Promise<void> {
  // Estação sem coordenada válida não pode ser persistida (lat/lng NOT NULL).
  // Pula e contabiliza, sem inventar coordenada.
  if (estacao.lat === null || estacao.lng === null) {
    resumo.puladasSemCoordenada += 1;
    return;
  }

  // Sem id do SIBH não há chave natural para o upsert (conflita em sibh_id).
  // Não deveria ocorrer; pula e contabiliza sem inventar chave.
  if (!estacao.id) {
    resumo.puladasSemId += 1;
    return;
  }

  // Guarda defensiva: o lote já foi filtrado, mas re-checamos o tipo para
  // narrow (o tipo do SIBH é um union mais amplo) e para nunca gravar um
  // tipo_estacao fora do CHECK do banco.
  if (!ehTipoHidrologico(estacao.tipo)) {
    throw new Error(`tipo hidrológico não suportado: ${estacao.tipo}`);
  }

  // Vínculo ao catálogo: consulta em memória, o mapa já veio pronto. O id do
  // posto é lido e DESCARTADO aqui: o que interessa (e o que pode ser gravado
  // sem acoplar os dois armazenamentos) é apenas se houve casamento.
  const vinculadoAPosto = idsPorPrefixo.has(estacao.prefixo);

  // Contado antes da escrita, de propósito: ver o comentário do campo em
  // `ResumoSyncEstacoes`. Casar é fato do SIBH contra o catálogo, e não
  // consequência de a gravação ter dado certo.
  if (vinculadoAPosto) resumo.vinculadasAposto += 1;

  await estacoesRepo.upsertPorSibhId({
    // Chave natural do upsert: o id estável do SIBH.
    sibhId: estacao.id,
    prefixo: estacao.prefixo,
    nome: estacao.nome,
    lat: estacao.lat,
    lng: estacao.lng,
    // Estação vinda do SIBH é sempre o canal automático (logger).
    tipo: 'automatico',
    // Tipo hidrológico da estação (pluvio/fluvio/piezo), do SIBH.
    tipoEstacao: estacao.tipo,
    bacia: estacao.bacia,
    owner: estacao.owner,
    // Status de transmissão para derivar "online" (persistido, migration 0053).
    transmissionStatus: estacao.transmissionStatus,
    ultimaTransmissao: estacao.ultimaTransmissao,
    vinculadoAPosto,
  });

  resumo.upsertadas += 1;
}
