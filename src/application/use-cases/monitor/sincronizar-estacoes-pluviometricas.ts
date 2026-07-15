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
 * Quando existe um posto do catálogo com o mesmo prefixo, grava o vínculo
 * `posto_id`.
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

export interface ResumoSyncEstacoes {
  /**
   * Total de estações recebidas do SIBH após o filtro (os três tipos
   * hidrológicos: pluviométrico, fluviométrico e piezométrico).
   */
  totalSibh: number;
  /** Quantas estações foram inseridas ou atualizadas no banco. */
  upsertadas: number;
  /** Dentre as upsertadas, quantas casaram com um posto do catálogo. */
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
 * @param postosRepo  Catálogo interno de postos (para o vínculo posto_id).
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

  for (const estacao of hidrologicas) {
    try {
      await sincronizarUma(estacao, estacoesRepo, postosRepo, resumo);
    } catch (e) {
      // Tolera falha por estação: registra o motivo e segue o lote.
      resumo.erros.push({
        prefixo: estacao.prefixo,
        motivo: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return resumo;
}

async function sincronizarUma(
  estacao: EstacaoSibh,
  estacoesRepo: EstacoesPluviometricasRepository,
  postosRepo: PostosRepository,
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

  // Vínculo ao catálogo: se há posto com o mesmo prefixo, guarda o id dele.
  const posto = await postosRepo.buscarPorPrefixo(estacao.prefixo);
  const postoId = posto?.id ?? null;

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
    postoId,
  });

  resumo.upsertadas += 1;
  if (postoId) resumo.vinculadasAposto += 1;
}
