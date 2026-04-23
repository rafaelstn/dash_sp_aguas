import type { RevisoesRepository } from '@/application/ports/revisoes-repository';
import type {
  ParametrosNovaRevisao,
  RevisaoDesconformidade,
} from '@/domain/revisao-desconformidade';

export type EntradaMarcarRevisao = ParametrosNovaRevisao;

/**
 * Grava (ou atualiza) um registro em `revisoes_desconformidade` com status
 * `revisado`. No MVP, `usuario_id` é nulo e a identificação ocorre pelo IP
 * (ADR-0003). Este caso de uso NÃO altera dado cadastral em `postos` nem
 * remove linhas de `arquivos_orfaos`.
 */
export async function marcarRevisaoDesconformidade(
  revisoesRepo: RevisoesRepository,
  entrada: EntradaMarcarRevisao,
): Promise<RevisaoDesconformidade> {
  if (!entrada.idEntidade || entrada.idEntidade.trim() === '') {
    throw new Error('idEntidade é obrigatório');
  }
  return revisoesRepo.marcarRevisado(entrada);
}
