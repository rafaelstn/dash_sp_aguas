import { describe, expect, it, vi } from 'vitest';
import {
  RETENCAO_MINIMA_DIAS,
  RETENCAO_PADRAO_DIAS,
  anonimizarTrilhaAuditoria,
} from '@/application/use-cases/manutencao/anonimizar-trilha-auditoria';
import { DadosInvalidos } from '@/domain/errors';
import type { AuditoriaRepository } from '@/application/ports/auditoria-repository';

function repoFake(
  retorno = [
    { tabela: 'acesso_ficha', linhasAnonimizadas: 12 },
    { tabela: 'triagem_eventos', linhasAnonimizadas: 3 },
    { tabela: 'postos_evento', linhasAnonimizadas: 0 },
  ],
) {
  const anonimizarPiiRetida = vi.fn(async () => retorno);
  const repo = {
    registrarAcesso: vi.fn(),
    listarRecentesDoUsuario: vi.fn(),
    anonimizarPiiRetida,
  } as unknown as AuditoriaRepository;
  return { repo, anonimizarPiiRetida };
}

describe('use-case/anonimizarTrilhaAuditoria', () => {
  it('soma as linhas de todas as tabelas da trilha', async () => {
    const { repo } = repoFake();
    const r = await anonimizarTrilhaAuditoria(repo, 180);
    expect(r.total).toBe(15);
    expect(r.porTabela).toHaveLength(3);
    expect(r.diasRetencao).toBe(180);
  });

  it('usa o prazo padrao de 180 dias quando nao informado', async () => {
    const { repo, anonimizarPiiRetida } = repoFake();
    const r = await anonimizarTrilhaAuditoria(repo);
    expect(anonimizarPiiRetida).toHaveBeenCalledWith(RETENCAO_PADRAO_DIAS);
    expect(r.diasRetencao).toBe(RETENCAO_PADRAO_DIAS);
  });

  // A anonimizacao e irreversivel: prazo curto demais apaga metadado de rede
  // que ainda pode ser necessario para apurar incidente.
  it('recusa prazo abaixo do piso, sem tocar no repositorio', async () => {
    const { repo, anonimizarPiiRetida } = repoFake();
    await expect(anonimizarTrilhaAuditoria(repo, RETENCAO_MINIMA_DIAS - 1)).rejects.toBeInstanceOf(
      DadosInvalidos,
    );
    await expect(anonimizarTrilhaAuditoria(repo, 0)).rejects.toBeInstanceOf(DadosInvalidos);
    await expect(anonimizarTrilhaAuditoria(repo, -30)).rejects.toBeInstanceOf(DadosInvalidos);
    expect(anonimizarPiiRetida).not.toHaveBeenCalled();
  });

  it('recusa prazo nao inteiro', async () => {
    const { repo } = repoFake();
    await expect(anonimizarTrilhaAuditoria(repo, 90.5)).rejects.toBeInstanceOf(DadosInvalidos);
    await expect(anonimizarTrilhaAuditoria(repo, Number.NaN)).rejects.toBeInstanceOf(DadosInvalidos);
  });

  it('execucao sem nada a anonimizar e sucesso com zero, nao erro', async () => {
    const { repo } = repoFake([{ tabela: 'acesso_ficha', linhasAnonimizadas: 0 }]);
    const r = await anonimizarTrilhaAuditoria(repo, 365);
    expect(r.total).toBe(0);
    expect(r.duracaoMs).toBeGreaterThanOrEqual(0);
  });
});

describe('adapter mock de auditoria (paridade com a funcao SQL)', () => {
  it('preserva o evento e zera so os metadados de rede dos vencidos', async () => {
    const { auditoriaRepository, trilhaAuditoriaDemo } = await import(
      '@/infrastructure/mock/auditoria-repository.mock'
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await auditoriaRepository.registrarAcesso({
      prefixo: 'ANTIGO',
      acao: 'visualizou_ficha',
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
      usuarioId: 'u-1',
    });

    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
    await auditoriaRepository.registrarAcesso({
      prefixo: 'RECENTE',
      acao: 'visualizou_ficha',
      ip: '203.0.113.20',
      userAgent: 'Mozilla/5.0',
      usuarioId: 'u-1',
    });

    const r = await anonimizarTrilhaAuditoria(auditoriaRepository, 30);
    vi.useRealTimers();

    expect(r.total).toBe(1);
    const trilha = trilhaAuditoriaDemo();
    const antigo = trilha.find((e) => e.prefixo === 'ANTIGO')!;
    const recente = trilha.find((e) => e.prefixo === 'RECENTE')!;
    // O evento continua auditavel; so a PII de rede saiu.
    expect(antigo.acao).toBe('visualizou_ficha');
    expect(antigo.usuarioId).toBe('u-1');
    expect(antigo.ip).toBeNull();
    expect(antigo.userAgent).toBeNull();
    expect(recente.ip).toBe('203.0.113.20');
  });
});
