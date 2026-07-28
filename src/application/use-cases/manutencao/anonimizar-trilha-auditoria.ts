import type {
  AnonimizacaoTrilha,
  AuditoriaRepository,
} from '@/application/ports/auditoria-repository';
import { DadosInvalidos } from '@/domain/errors';

/**
 * Prazo padrao de retencao da PII de rede na trilha (LGPD-4). Espelha o default
 * da funcao SQL da migration 0048 e o do script administrativo.
 */
export const RETENCAO_PADRAO_DIAS = 180;

/**
 * Piso do prazo. Encurtar demais a retencao apaga metadado de rede que ainda
 * pode ser necessario para apurar incidente, e a anonimizacao e IRREVERSIVEL.
 * O piso existe para que uma configuracao errada de ambiente nao destrua
 * evidencia de uma vez.
 */
export const RETENCAO_MINIMA_DIAS = 30;

export interface ResultadoAnonimizacao {
  diasRetencao: number;
  porTabela: AnonimizacaoTrilha[];
  /** Soma das linhas anonimizadas em todas as tabelas da trilha. */
  total: number;
  duracaoMs: number;
}

/**
 * Executa a anonimizacao periodica da PII de rede na trilha de auditoria.
 *
 * O evento (quem, quando, o que) permanece intacto: a rastreabilidade exigida
 * pela rule de governo continua, e o que sai e apenas `ip`/`user_agent` depois
 * do prazo, atendendo minimizacao e prazo de retencao (LGPD, art. 6 III e V,
 * art. 15 e 16).
 *
 * Idempotente: reexecutar so alcanca linhas que ainda tenham PII vencida.
 */
export async function anonimizarTrilhaAuditoria(
  repo: AuditoriaRepository,
  diasRetencao: number = RETENCAO_PADRAO_DIAS,
): Promise<ResultadoAnonimizacao> {
  if (!Number.isInteger(diasRetencao) || diasRetencao < RETENCAO_MINIMA_DIAS) {
    throw new DadosInvalidos(
      `O prazo de retencao deve ser um inteiro de pelo menos ${RETENCAO_MINIMA_DIAS} dias.`,
    );
  }

  const inicio = Date.now();
  const porTabela = await repo.anonimizarPiiRetida(diasRetencao);
  return {
    diasRetencao,
    porTabela,
    total: porTabela.reduce((soma, t) => soma + t.linhasAnonimizadas, 0),
    duracaoMs: Date.now() - inicio,
  };
}
