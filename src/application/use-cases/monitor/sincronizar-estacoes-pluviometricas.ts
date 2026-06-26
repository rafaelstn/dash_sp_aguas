/**
 * Use-case: sincronizar estações pluviométricas do SIBH para o banco local.
 *
 * O Monitor PERSISTE o cadastro de estações (decisão de arquitetura). Esta
 * sincronização puxa as estações do SIBH, filtra as pluviométricas, e faz
 * upsert idempotente por prefixo em `estacoes_pluviometricas` com tipo
 * 'automatico' (estação vinda do logger do SIBH). Quando existe um posto do
 * catálogo com o mesmo prefixo, grava o vínculo `posto_id`.
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

export interface ResumoSyncEstacoes {
  /** Total de estações pluviométricas recebidas do SIBH (após o filtro). */
  totalSibh: number;
  /** Quantas estações foram inseridas ou atualizadas no banco. */
  upsertadas: number;
  /** Dentre as upsertadas, quantas casaram com um posto do catálogo. */
  vinculadasAposto: number;
  /** Estações puladas por não terem coordenada válida (lat/lng obrigatórios). */
  puladasSemCoordenada: number;
  /** Estações que falharam individualmente (com motivo para diagnóstico). */
  erros: Array<{ prefixo: string; motivo: string }>;
}

/**
 * Sincroniza o cadastro de estações pluviométricas.
 *
 * @param sibh        Gateway do SIBH (fonte das estações automáticas).
 * @param estacoesRepo Repositório de estações do Monitor (upsert por prefixo).
 * @param postosRepo  Catálogo interno de postos (para o vínculo posto_id).
 */
export async function sincronizarEstacoesPluviometricas(
  sibh: SibhGateway,
  estacoesRepo: EstacoesPluviometricasRepository,
  postosRepo: PostosRepository,
): Promise<ResumoSyncEstacoes> {
  const todas = await sibh.listarEstacoes();
  const pluviometricas = todas.filter((e) => e.tipo === 'pluviometrico');

  const resumo: ResumoSyncEstacoes = {
    totalSibh: pluviometricas.length,
    upsertadas: 0,
    vinculadasAposto: 0,
    puladasSemCoordenada: 0,
    erros: [],
  };

  for (const estacao of pluviometricas) {
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

  // Vínculo ao catálogo: se há posto com o mesmo prefixo, guarda o id dele.
  const posto = await postosRepo.buscarPorPrefixo(estacao.prefixo);
  const postoId = posto?.id ?? null;

  await estacoesRepo.upsertPorPrefixo({
    prefixo: estacao.prefixo,
    nome: estacao.nome,
    lat: estacao.lat,
    lng: estacao.lng,
    // Estação vinda do SIBH é sempre o canal automático (logger).
    tipo: 'automatico',
    bacia: estacao.bacia,
    postoId,
    sibhId: estacao.id,
  });

  resumo.upsertadas += 1;
  if (postoId) resumo.vinculadasAposto += 1;
}
