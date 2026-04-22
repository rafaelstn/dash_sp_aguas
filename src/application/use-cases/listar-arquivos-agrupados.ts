import type {
  ArquivosRepository,
  GrupoArquivosPorTipo,
} from '@/application/ports/arquivos-repository';
import type { AuditoriaRepository } from '@/application/ports/auditoria-repository';

export interface EntradaListarAgrupados {
  prefixo: string;
  ip: string | null;
  userAgent: string | null;
  usuarioId: string | null;
}

export interface SaidaListarAgrupados {
  prefixoJaIndexado: boolean;
  grupos: GrupoArquivosPorTipo[];
  total: number;
}

/**
 * Caso de uso da US-010 — lista arquivos agrupados pelos 7 tipos oficiais de
 * documento, cada grupo ordenado por `data_documento` decrescente.
 * Gera registro de auditoria (LGPD) como o caso de uso anterior.
 */
export async function listarArquivosAgrupados(
  arquivosRepo: ArquivosRepository,
  auditoriaRepo: AuditoriaRepository,
  entrada: EntradaListarAgrupados,
): Promise<SaidaListarAgrupados> {
  const [grupos, prefixoJaIndexado] = await Promise.all([
    arquivosRepo.listarAgrupadosPorTipo(entrada.prefixo),
    arquivosRepo.foiIndexadoAlgumaVez(entrada.prefixo),
  ]);

  await auditoriaRepo.registrarAcesso({
    prefixo: entrada.prefixo,
    acao: 'listou_arquivos',
    ip: entrada.ip,
    userAgent: entrada.userAgent,
    usuarioId: entrada.usuarioId,
  });

  const total = grupos.reduce((acc, g) => acc + g.arquivos.length, 0);
  return { prefixoJaIndexado, grupos, total };
}
