import type { ArquivosRepository } from '@/application/ports/arquivos-repository';
import type { AuditoriaRepository } from '@/application/ports/auditoria-repository';
import type { ArquivoIndexado } from '@/domain/arquivo-indexado';

export interface EntradaListarArquivos {
  prefixo: string;
  ip: string | null;
  userAgent: string | null;
  usuarioId: string | null;
}

export interface SaidaListarArquivos {
  prefixoJaIndexado: boolean;
  arquivos: ArquivoIndexado[];
}

export async function listarArquivos(
  arquivosRepo: ArquivosRepository,
  auditoriaRepo: AuditoriaRepository,
  entrada: EntradaListarArquivos,
): Promise<SaidaListarArquivos> {
  const [arquivos, prefixoJaIndexado] = await Promise.all([
    arquivosRepo.listarPorPrefixo(entrada.prefixo),
    arquivosRepo.foiIndexadoAlgumaVez(entrada.prefixo),
  ]);

  await auditoriaRepo.registrarAcesso({
    prefixo: entrada.prefixo,
    acao: 'listou_arquivos',
    ip: entrada.ip,
    userAgent: entrada.userAgent,
    usuarioId: entrada.usuarioId,
  });

  return { prefixoJaIndexado, arquivos };
}
