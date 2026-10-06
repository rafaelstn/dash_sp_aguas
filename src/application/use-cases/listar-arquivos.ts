import type { ArquivosRepository } from '@/application/ports/arquivos-repository';
import type { AuditoriaRepository } from '@/application/ports/auditoria-repository';
import type { ArquivoIndexado } from '@/domain/arquivo-indexado';

export interface EntradaListarArquivos {
  prefixo: string;
  ip: string | null;
  userAgent: string | null;
  /**
   * Quem pediu a listagem, NUNCA nulo. Era `string | null`, e foi assim que a
   * rota chegou a producao gravando `usuarioId: usuario?.id ?? null` na trilha
   * de acesso: o tipo permitia a linha de auditoria anonima, e a rota nem
   * recusava o nao autenticado (achado do Andre, PO de Seguranca, em
   * 06/10/2026). Estreitado para o `tsc` nomear quem tentar gravar acesso sem
   * ator, em vez de a trilha aceitar calada.
   *
   * O repositorio de auditoria continua aceitando `null` de proposito: linha
   * JA gravada assim e evidencia historica e a tabela e append-only.
   */
  usuarioId: string;
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
