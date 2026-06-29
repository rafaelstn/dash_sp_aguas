import { describe, expect, it } from 'vitest';
import { sincronizarEstacoesPluviometricas } from '@/application/use-cases/monitor/sincronizar-estacoes-pluviometricas';
import type {
  EstacaoSibh,
  LeituraSibh,
  MedicaoSibh,
  SibhGateway,
} from '@/application/ports/sibh-gateway';
import type { EstacoesPluviometricasRepository } from '@/application/ports/estacoes-pluviometricas-repository';
import type {
  EstacaoPluviometrica,
  UpsertEstacaoPluviometrica,
} from '@/domain/monitor/estacao-pluviometrica';
import type { PostosRepository } from '@/application/ports/postos-repository';
import type { Posto } from '@/domain/posto';

// ── Fakes minimais das portas (DI torna o use-case testável sem infra) ──────

function fakeSibh(estacoes: EstacaoSibh[]): SibhGateway {
  return {
    async listarEstacoes() {
      return estacoes;
    },
    async medicoesPorPrefixo(): Promise<MedicaoSibh[]> {
      return [];
    },
    async valorAtualPorPrefixo(): Promise<LeituraSibh | null> {
      return null;
    },
  };
}

interface FakeEstacoesRepo extends EstacoesPluviometricasRepository {
  upserts: UpsertEstacaoPluviometrica[];
}

function fakeEstacoesRepo(): FakeEstacoesRepo {
  const upserts: UpsertEstacaoPluviometrica[] = [];
  return {
    upserts,
    async listar() {
      return [];
    },
    async obterPorId() {
      return null;
    },
    async upsertPorPrefixo(estacao) {
      upserts.push(estacao);
      const resultado: EstacaoPluviometrica = {
        id: `id-${estacao.prefixo}`,
        prefixo: estacao.prefixo,
        nome: estacao.nome,
        lat: estacao.lat,
        lng: estacao.lng,
        tipo: estacao.tipo,
        bacia: estacao.bacia ?? null,
        owner: estacao.owner ?? null,
        postoId: estacao.postoId ?? null,
        sibhId: estacao.sibhId ?? null,
        criadoEm: new Date('2026-01-01T00:00:00Z'),
      };
      return resultado;
    },
  };
}

function fakePostosRepo(prefixosComPosto: Record<string, string>): PostosRepository {
  return {
    async buscarPorPrefixo(prefixo) {
      const id = prefixosComPosto[prefixo];
      if (!id) return null;
      return { id, prefixo } as Posto;
    },
    async pesquisar() {
      return { total: 0, itens: [] };
    },
    async autocompletar() {
      return [];
    },
    async atualizar() {
      throw new Error('nao usado');
    },
    async criar() {
      throw new Error('nao usado');
    },
    async remover() {
      throw new Error('nao usado');
    },
    async restaurar() {
      throw new Error('nao usado');
    },
    async listarEventos() {
      return [];
    },
  };
}

function estacao(over: Partial<EstacaoSibh>): EstacaoSibh {
  return {
    prefixo: 'P001',
    nome: 'Estação Teste',
    id: '1',
    tipo: 'pluviometrico',
    lat: -23.5,
    lng: -46.6,
    bacia: 'Alto Tietê',
    owner: 'SP ÁGUAS',
    ...over,
  };
}

describe('use-case/sincronizarEstacoesPluviometricas', () => {
  it('filtra só pluviométricas e faz upsert com tipo automatico', async () => {
    const sibh = fakeSibh([
      estacao({ prefixo: 'P001', id: '1', tipo: 'pluviometrico' }),
      estacao({ prefixo: 'F002', id: '2', tipo: 'fluviometrico' }),
      estacao({ prefixo: 'Q003', id: '3', tipo: 'qualidade' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({});

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    expect(resumo.totalSibh).toBe(1);
    expect(resumo.upsertadas).toBe(1);
    expect(estacoesRepo.upserts).toHaveLength(1);
    expect(estacoesRepo.upserts[0]!.tipo).toBe('automatico');
    expect(estacoesRepo.upserts[0]!.sibhId).toBe('1');
    expect(estacoesRepo.upserts[0]!.bacia).toBe('Alto Tietê');
    // A entidade responsável (owner) é repassada do SIBH ao upsert.
    expect(estacoesRepo.upserts[0]!.owner).toBe('SP ÁGUAS');
  });

  it('repassa owner null quando o SIBH não informa a entidade', async () => {
    const sibh = fakeSibh([estacao({ prefixo: 'P001', owner: null })]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({});

    await sincronizarEstacoesPluviometricas(sibh, estacoesRepo, postosRepo);

    expect(estacoesRepo.upserts).toHaveLength(1);
    expect(estacoesRepo.upserts[0]!.owner).toBeNull();
  });

  it('pula estação sem coordenada e contabiliza', async () => {
    const sibh = fakeSibh([
      estacao({ prefixo: 'P001', lat: null }),
      estacao({ prefixo: 'P002', lng: null }),
      estacao({ prefixo: 'P003', lat: -23.1, lng: -46.1 }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({});

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    expect(resumo.totalSibh).toBe(3);
    expect(resumo.puladasSemCoordenada).toBe(2);
    expect(resumo.upsertadas).toBe(1);
    expect(estacoesRepo.upserts).toHaveLength(1);
    expect(estacoesRepo.upserts[0]!.prefixo).toBe('P003');
  });

  it('vincula posto_id quando existe posto com o mesmo prefixo', async () => {
    const sibh = fakeSibh([
      estacao({ prefixo: 'P001' }),
      estacao({ prefixo: 'P002' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({ P001: 'posto-uuid-001' });

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    expect(resumo.vinculadasAposto).toBe(1);
    const p001 = estacoesRepo.upserts.find((u) => u.prefixo === 'P001');
    const p002 = estacoesRepo.upserts.find((u) => u.prefixo === 'P002');
    expect(p001!.postoId).toBe('posto-uuid-001');
    expect(p002!.postoId).toBeNull();
  });

  it('tolera falha por estação sem derrubar o lote', async () => {
    const sibh = fakeSibh([
      estacao({ prefixo: 'BOM1' }),
      estacao({ prefixo: 'RUIM' }),
      estacao({ prefixo: 'BOM2' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const original = estacoesRepo.upsertPorPrefixo.bind(estacoesRepo);
    estacoesRepo.upsertPorPrefixo = async (e) => {
      if (e.prefixo === 'RUIM') throw new Error('falha simulada de banco');
      return original(e);
    };
    const postosRepo = fakePostosRepo({});

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    expect(resumo.upsertadas).toBe(2);
    expect(resumo.erros).toHaveLength(1);
    expect(resumo.erros[0]!.prefixo).toBe('RUIM');
    expect(resumo.erros[0]!.motivo).toContain('falha simulada');
  });
});
