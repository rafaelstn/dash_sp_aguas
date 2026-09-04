import { describe, expect, it } from 'vitest';
import { sincronizarEstacoesPluviometricas } from '@/application/use-cases/monitor/sincronizar-estacoes-pluviometricas';
import type {
  EstacaoSibh,
  LeituraSibh,
  MedicaoSibh,
  PontoNivelSibh,
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
    async serieNivelPorPrefixo(): Promise<PontoNivelSibh[]> {
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
    async upsertPorSibhId(estacao) {
      upserts.push(estacao);
      const resultado: EstacaoPluviometrica = {
        id: `id-${estacao.sibhId}`,
        prefixo: estacao.prefixo,
        nome: estacao.nome,
        lat: estacao.lat,
        lng: estacao.lng,
        tipo: estacao.tipo,
        tipoEstacao: estacao.tipoEstacao,
        bacia: estacao.bacia ?? null,
        owner: estacao.owner ?? null,
        transmissionStatus: estacao.transmissionStatus ?? null,
        ultimaTransmissao: estacao.ultimaTransmissao ?? null,
        vinculadoAPosto: estacao.vinculadoAPosto ?? false,
        sibhId: estacao.sibhId,
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
    // O use case passou a carregar o vínculo de uma vez, em vez de consultar
    // por estação: eram cerca de 5.400 idas ao banco em série, e isso sozinho
    // já estourava a janela de execução.
    async mapaIdsPorPrefixo() {
      return new Map(Object.entries(prefixosComPosto));
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
    transmissionStatus: 'ok',
    ultimaTransmissao: 'Wed Jul 15 2026 12:10:00 GMT+0000 (Coordinated Universal Time)',
    ...over,
  };
}

describe('use-case/sincronizarEstacoesPluviometricas', () => {
  it('importa os três tipos hidrológicos e faz upsert com tipo automatico', async () => {
    const sibh = fakeSibh([
      estacao({ prefixo: 'P001', id: '1', tipo: 'pluviometrico' }),
      estacao({ prefixo: 'F002', id: '2', tipo: 'fluviometrico' }),
      estacao({ prefixo: 'Z003', id: '3', tipo: 'piezometrico' }),
      estacao({ prefixo: 'Q004', id: '4', tipo: 'qualidade' }),
      estacao({ prefixo: 'X005', id: '5', tipo: 'desconhecido' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({});

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    // Só os três tipos hidrológicos entram; qualidade e desconhecido saem.
    expect(resumo.totalSibh).toBe(3);
    expect(resumo.upsertadas).toBe(3);
    expect(estacoesRepo.upserts).toHaveLength(3);

    const prefixos = estacoesRepo.upserts.map((u) => u.prefixo).sort();
    expect(prefixos).toEqual(['F002', 'P001', 'Z003']);

    // Todas gravam o canal automático e o tipo hidrológico correto vindo do SIBH.
    for (const u of estacoesRepo.upserts) {
      expect(u.tipo).toBe('automatico');
    }
    const porPrefixo = new Map(estacoesRepo.upserts.map((u) => [u.prefixo, u]));
    expect(porPrefixo.get('P001')!.tipoEstacao).toBe('pluviometrico');
    expect(porPrefixo.get('F002')!.tipoEstacao).toBe('fluviometrico');
    expect(porPrefixo.get('Z003')!.tipoEstacao).toBe('piezometrico');

    // Demais campos repassados corretamente na pluviométrica.
    const p001 = porPrefixo.get('P001')!;
    expect(p001.sibhId).toBe('1');
    expect(p001.bacia).toBe('Alto Tietê');
    // A entidade responsável (owner) é repassada do SIBH ao upsert.
    expect(p001.owner).toBe('SP ÁGUAS');
  });

  it('descarta qualidade e desconhecido sem upsert', async () => {
    const sibh = fakeSibh([
      estacao({ prefixo: 'Q001', tipo: 'qualidade' }),
      estacao({ prefixo: 'X002', tipo: 'desconhecido' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({});

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    expect(resumo.totalSibh).toBe(0);
    expect(resumo.upsertadas).toBe(0);
    expect(estacoesRepo.upserts).toHaveLength(0);
  });

  it('mesmo prefixo em tipos diferentes vira dois upserts com sibhId distinto', async () => {
    // Caso central da correção de chave: prefixo colide entre plu e flu, mas o
    // sync conflita por sibhId (estacao.id), então as duas coexistem em vez de
    // uma sobrescrever a outra.
    const sibh = fakeSibh([
      estacao({ prefixo: '1001855', id: '933', tipo: 'pluviometrico' }),
      estacao({ prefixo: '1001855', id: '35331', tipo: 'fluviometrico' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({});

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    expect(resumo.upsertadas).toBe(2);
    expect(estacoesRepo.upserts).toHaveLength(2);
    // Chave do upsert é o sibhId, não o prefixo (que é o mesmo nas duas).
    const porSibh = new Map(estacoesRepo.upserts.map((u) => [u.sibhId, u]));
    expect(porSibh.get('933')!.tipoEstacao).toBe('pluviometrico');
    expect(porSibh.get('35331')!.tipoEstacao).toBe('fluviometrico');
    expect(porSibh.get('933')!.prefixo).toBe('1001855');
    expect(porSibh.get('35331')!.prefixo).toBe('1001855');
  });

  it('pula estação sem id do SIBH e contabiliza em puladasSemId', async () => {
    const sibh = fakeSibh([
      estacao({ prefixo: 'P001', id: '' }),
      estacao({ prefixo: 'P002', id: '7' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({});

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    expect(resumo.puladasSemId).toBe(1);
    expect(resumo.upsertadas).toBe(1);
    expect(estacoesRepo.upserts).toHaveLength(1);
    expect(estacoesRepo.upserts[0]!.sibhId).toBe('7');
  });

  it('repassa transmissionStatus e ultimaTransmissao (crus) do SIBH ao upsert', async () => {
    // O status de transmissao vem do SIBH e desce ate o upsert sem
    // interpretacao aqui (a normalizacao pra ISO/timestamptz e do repo). Isso
    // alimenta a derivacao de "online" (migration 0053).
    const sibh = fakeSibh([
      estacao({
        prefixo: 'P001',
        transmissionStatus: 'pendente',
        ultimaTransmissao: 'Mon May 04 2026 11:00:00 GMT+0000 (Coordinated Universal Time)',
      }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({});

    await sincronizarEstacoesPluviometricas(sibh, estacoesRepo, postosRepo);

    expect(estacoesRepo.upserts).toHaveLength(1);
    expect(estacoesRepo.upserts[0]!.transmissionStatus).toBe('pendente');
    expect(estacoesRepo.upserts[0]!.ultimaTransmissao).toBe(
      'Mon May 04 2026 11:00:00 GMT+0000 (Coordinated Universal Time)',
    );
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

  it('marca vinculadoAPosto quando existe posto com o mesmo prefixo', async () => {
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
    // O que atravessa é o FATO, não o identificador do catálogo do órgão.
    expect(p001!.vinculadoAPosto).toBe(true);
    expect(p002!.vinculadoAPosto).toBe(false);
  });

  it('REGRESSÃO: casar com posto do órgão não impede mais a gravação', async () => {
    // Incidente de produção de 04/09/2026. `estacoes_pluviometricas.posto_id`
    // era chave estrangeira para a NOSSA tabela `postos`, que ficou vazia
    // depois do ADR-0023, enquanto `mapaIdsPorPrefixo()` passou a devolver o
    // `Postos.Id` do SQL Server do órgão. Toda estação que CASAVA com um posto
    // era recusada pelo banco: 2.714 das 5.415, e a sincronização respondia
    // HTTP 200 com os erros no corpo.
    //
    // Este caso trava o efeito, e não a implementação: todas casam, e todas
    // precisam ser gravadas, com zero erro.
    const prefixos = ['A1', 'A2', 'A3', 'A4', 'A5'];
    const sibh = fakeSibh(
      prefixos.map((p, i) => estacao({ prefixo: p, id: String(i + 1) })),
    );
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo(
      Object.fromEntries(prefixos.map((p) => [p, `id-do-orgao-${p}`])),
    );

    const resumo = await sincronizarEstacoesPluviometricas(
      sibh,
      estacoesRepo,
      postosRepo,
    );

    expect(resumo.erros).toEqual([]);
    expect(resumo.upsertadas).toBe(prefixos.length);
    expect(resumo.totalSibh).toBe(prefixos.length);
    // E `vinculadasAposto` reflete a realidade: antes ele era incrementado
    // DEPOIS do upsert, então saía 0 justamente no cenário em que todas
    // casavam, e se lia como "nenhuma estação tem posto".
    expect(resumo.vinculadasAposto).toBe(prefixos.length);
    expect(estacoesRepo.upserts).toHaveLength(prefixos.length);
  });

  it('GUARDA: nenhum identificador do banco do órgão atravessa para o upsert', async () => {
    // Mede o DADO, não o nome do campo, e é essa a razão de ele existir: o
    // TypeScript já barra o campo NOVO (o tipo do upsert não tem onde pôr um
    // id, e literal fresco reprova propriedade desconhecida). O que ele NÃO
    // barra é o id entrando num campo de texto que já existe.
    //
    // Provado que denuncia, com a fuga rodada: trocando o use-case para
    // `prefixo: idsPorPrefixo.get(estacao.prefixo) ?? estacao.prefixo`, o
    // `tsc --noEmit` sai 0 e este caso reprova nomeando o valor vazado.
    const SENTINELA = 'ID-DO-ORGAO-QUE-NAO-PODE-ATRAVESSAR-0001';
    const sibh = fakeSibh([
      estacao({ prefixo: 'P001', id: '1' }),
      estacao({ prefixo: 'P002', id: '2' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const postosRepo = fakePostosRepo({ P001: SENTINELA, P002: SENTINELA });

    await sincronizarEstacoesPluviometricas(sibh, estacoesRepo, postosRepo);

    expect(estacoesRepo.upserts).toHaveLength(2);
    for (const u of estacoesRepo.upserts) {
      expect(JSON.stringify(u)).not.toContain(SENTINELA);
    }
    // E o fato continua sendo gravado, senão a guarda passaria com o vínculo
    // simplesmente removido do produto.
    expect(estacoesRepo.upserts.every((u) => u.vinculadoAPosto === true)).toBe(true);
  });

  it('tolera falha por estação sem derrubar o lote', async () => {
    const sibh = fakeSibh([
      estacao({ prefixo: 'BOM1' }),
      estacao({ prefixo: 'RUIM' }),
      estacao({ prefixo: 'BOM2' }),
    ]);
    const estacoesRepo = fakeEstacoesRepo();
    const original = estacoesRepo.upsertPorSibhId.bind(estacoesRepo);
    estacoesRepo.upsertPorSibhId = async (e) => {
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
