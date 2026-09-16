/**
 * Cadastrar item a partir de desconformidade: uma pendência nunca gera duas
 * unidades (achado A1 do QA). O servidor é um dublê em memória com a MESMA regra
 * de unicidade do POST real (código repetido, sem diferenciar caixa, é 409
 * `codigo_duplicado`), e a prova é pelo efeito: quantas unidades existem e com
 * qual `unidadeId` a pendência foi marcada.
 */
import { describe, expect, it } from 'vitest';
import type { UpsertUnidade } from '@/domain/estoque/unidade';
import type { AtualizarDesconformidadeUI } from '@/components/features/estoque/dtos';
import { ErroEstoque } from '@/components/features/estoque/erros';
import {
  CHAVE_VINCULOS,
  MENSAGEM_ALTERADA,
  cadastrarEResolver,
  gravarVinculos,
  lerVinculos,
  mesmoCodigo,
  type DepsCadastro,
  type UnidadeVinculada,
} from '@/components/features/estoque/desconformidades/cadastro-item-fluxo';
import {
  NOTA_CADASTRO,
  valoresIniciaisCadastro,
  type ValoresCadastroItem,
} from '@/components/features/estoque/desconformidades/desconformidades-ui';

interface Servidor {
  unidades: { id: string; descricao: string; codigo: string | null }[];
  marcacoes: { id: string; dados: AtualizarDesconformidadeUI }[];
  /** Quantas próximas chamadas do PATCH falham, e com qual erro. */
  falhasPatch: ErroEstoque[];
  falhaPost: ErroEstoque | null;
  buscas: string[];
}

function servidor(): Servidor {
  return { unidades: [], marcacoes: [], falhasPatch: [], falhaPost: null, buscas: [] };
}

/** Memória da seção: o que sobrevive a fechar e reabrir o diálogo. */
function deps(s: Servidor, memoria: Map<string, UnidadeVinculada>, desconformidadeId = 'd1'): DepsCadastro {
  return {
    async criarUnidade(dados: UpsertUnidade) {
      if (s.falhaPost) throw s.falhaPost;
      const codigo = dados.codigo ?? null;
      if (codigo && s.unidades.some((u) => mesmoCodigo(u.codigo, codigo))) {
        throw new ErroEstoque('Já existe unidade com este código.', 'codigo_duplicado', 409);
      }
      const nova = { id: `u${s.unidades.length + 1}`, descricao: dados.descricao, codigo };
      s.unidades.push(nova);
      return nova;
    },
    async buscarPorCodigo(codigo) {
      s.buscas.push(codigo);
      return s.unidades.filter((u) => mesmoCodigo(u.codigo, codigo));
    },
    async atualizarDesconformidade(id, dados) {
      const falha = s.falhasPatch.shift();
      if (falha) throw falha;
      // Mesma checagem do PATCH real: unidadeId que não existe é 404.
      if (dados.unidadeId && !s.unidades.some((u) => u.id === dados.unidadeId)) {
        throw new ErroEstoque('Unidade não encontrada.', 'unidade_nao_encontrada', 404);
      }
      s.marcacoes.push({ id, dados });
      return {};
    },
    aoCriar: (u) => memoria.set(desconformidadeId, u),
    aoPerderVinculo: () => memoria.delete(desconformidadeId),
  };
}

const ABERTA = { id: 'd1', status: 'aberta' as const };

function valores(parcial: Partial<ValoresCadastroItem> = {}): ValoresCadastroItem {
  return { ...valoresIniciaisCadastro({ codigo: 'ET-0042' }), descricao: 'Datalogger', ...parcial };
}

const falhaRede = () => new ErroEstoque('Falha ao processar a solicitação.', 'erro_interno', 500, 'c0ffee-1');

describe('cadastrarEResolver: caminho feliz', () => {
  it('cria uma unidade e marca a pendência com ela, enviando o status que a tela mostrava', async () => {
    const s = servidor();
    const mem = new Map<string, UnidadeVinculada>();
    const r = await cadastrarEResolver({ desconformidade: ABERTA, valores: valores(), localId: '', vinculo: null }, deps(s, mem));

    expect(r.tipo).toBe('resolvida');
    expect(s.unidades).toHaveLength(1);
    expect(s.marcacoes).toEqual([
      {
        id: 'd1',
        dados: { status: 'resolvida', nota: NOTA_CADASTRO, unidadeId: 'u1', statusEsperado: 'aberta' },
      },
    ]);
    expect(r.mensagem).toBe('Item "Datalogger" cadastrado e desconformidade resolvida.');
  });

  it('não chama o servidor quando a descrição está vazia', async () => {
    const s = servidor();
    const r = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores({ descricao: '  ' }), localId: '', vinculo: null },
      deps(s, new Map()),
    );
    expect(r).toEqual({ tipo: 'invalido', campo: 'descricao', mensagem: 'Informe a descrição do item.' });
    expect(s.unidades).toHaveLength(0);
    expect(s.marcacoes).toHaveLength(0);
  });
});

describe('A1: item criado e marcação falhou', () => {
  it('entrega a unidade à memória ANTES de marcar, e a nova tentativa só repete a marcação', async () => {
    const s = servidor();
    const mem = new Map<string, UnidadeVinculada>();
    s.falhasPatch.push(falhaRede());

    const primeira = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: mem.get('d1') ?? null },
      deps(s, mem),
    );
    expect(primeira.tipo).toBe('falhaMarcacao');
    expect(mem.get('d1')).toMatchObject({ id: 'u1', origem: 'criada' });

    // Fechou e reabriu: o diálogo remonta sem estado, a seção devolve o vínculo.
    const segunda = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: mem.get('d1') ?? null },
      deps(s, mem),
    );
    expect(segunda.tipo).toBe('resolvida');
    expect(s.unidades).toHaveLength(1);
    expect(s.marcacoes.map((m) => m.dados.unidadeId)).toEqual(['u1']);
  });

  it('mensagem da falha sem parêntese com ponto dobrado e com o código para o suporte', async () => {
    const s = servidor();
    s.falhasPatch.push(falhaRede());
    const r = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: null },
      deps(s, new Map()),
    );
    expect(r.mensagem).toBe(
      'O item "Datalogger" foi cadastrado, mas a desconformidade continua aberta. Motivo: Falha ao processar a solicitação. Código para o suporte: c0ffee-1. Salve de novo para marcar como resolvida.',
    );
    expect(r.mensagem).not.toMatch(/\.\)|\)\./);
  });

  it('página recarregada (memória perdida): 409 oferece o item existente e vincular não cria outro', async () => {
    const s = servidor();
    s.falhasPatch.push(falhaRede());
    await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: null },
      deps(s, new Map()),
    );
    expect(s.unidades).toHaveLength(1);

    const memoriaNova = new Map<string, UnidadeVinculada>();
    const tentativa = await cadastrarEResolver(
      // caixa diferente: o servidor compara sem caixa, a oferta também
      { desconformidade: ABERTA, valores: valores({ codigo: 'et-0042' }), localId: '', vinculo: null },
      deps(s, memoriaNova),
    );
    expect(tentativa.tipo).toBe('codigoDuplicado');
    if (tentativa.tipo !== 'codigoDuplicado') return;
    expect(tentativa.existente).toEqual({ id: 'u1', descricao: 'Datalogger', codigo: 'ET-0042', origem: 'existente' });
    expect(tentativa.mensagem).toBe(
      'Já existe um item com o código et-0042: "Datalogger". Vincule esta desconformidade a ele ou corrija o código da etiqueta.',
    );

    const vinculada = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: tentativa.existente },
      deps(s, memoriaNova),
    );
    expect(vinculada.tipo).toBe('resolvida');
    expect(vinculada.mensagem).toBe('Desconformidade vinculada ao item "Datalogger" e resolvida.');
    expect(s.unidades).toHaveLength(1);
    expect(s.marcacoes.map((m) => m.dados.unidadeId)).toEqual(['u1']);
  });

  it('409 sem item único achado não oferece vínculo nem cria nada', async () => {
    const s = servidor();
    s.unidades.push({ id: 'uA', descricao: 'A', codigo: 'X1' }, { id: 'uB', descricao: 'B', codigo: 'x1' });
    const r = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores({ codigo: 'X1' }), localId: '', vinculo: null },
      deps(s, new Map()),
    );
    expect(r).toMatchObject({ tipo: 'codigoDuplicado', existente: null });
    expect(r.mensagem).toBe('Já existe unidade com este código. Corrija o código da etiqueta.');
    expect(s.unidades).toHaveLength(2);
    expect(s.marcacoes).toHaveLength(0);
  });

  it('falha ao buscar o item existente não vira oferta errada', async () => {
    const s = servidor();
    s.unidades.push({ id: 'uA', descricao: 'A', codigo: 'X1' });
    const d = deps(s, new Map());
    d.buscarPorCodigo = async () => {
      throw new Error('rede');
    };
    const r = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores({ codigo: 'X1' }), localId: '', vinculo: null },
      d,
    );
    expect(r).toMatchObject({ tipo: 'codigoDuplicado', existente: null });
  });
});

describe('A1-e: vínculo guardado aponta para unidade excluída', () => {
  function armazenamento() {
    const dados = new Map<string, string>();
    return {
      dados,
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
    };
  }

  it('404 unidade_nao_encontrada esquece o vínculo (memória e aba), e o envio seguinte cadastra em vez de repetir o 404', async () => {
    const s = servidor();
    const mem = new Map<string, UnidadeVinculada>();
    const aba = armazenamento();
    // A seção grava a memória na aba a cada mudança.
    const sincronizar = () => gravarVinculos(aba, Object.fromEntries(mem));

    s.falhasPatch.push(falhaRede());
    const primeira = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: null },
      deps(s, mem),
    );
    sincronizar();
    expect(primeira.tipo).toBe('falhaMarcacao');
    expect(lerVinculos(aba).d1?.id).toBe('u1');

    // Alguém exclui a unidade criada; a página recarrega e relê a aba.
    s.unidades = [];
    const relida = new Map(Object.entries(lerVinculos(aba)));

    const segunda = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: relida.get('d1') ?? null },
      deps(s, relida),
    );
    gravarVinculos(aba, Object.fromEntries(relida));
    expect(segunda).toEqual({
      tipo: 'vinculoPerdido',
      mensagem:
        'O item "Datalogger" ligado a esta desconformidade não existe mais, então confira os dados e cadastre de novo.',
    });
    expect(relida.has('d1')).toBe(false);
    expect(aba.dados.has(CHAVE_VINCULOS)).toBe(false);
    expect(s.marcacoes).toHaveLength(0);

    // Sem laço: o próximo envio parte sem vínculo, cria a unidade e resolve.
    const terceira = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: relida.get('d1') ?? null },
      deps(s, relida),
    );
    expect(terceira.tipo).toBe('resolvida');
    expect(s.unidades).toHaveLength(1);
    expect(s.marcacoes.map((m) => m.dados.unidadeId)).toEqual([s.unidades[0]!.id]);
  });

  it('vínculo com item existente que foi excluído também é esquecido', async () => {
    const s = servidor();
    const mem = new Map<string, UnidadeVinculada>();
    const vinculo: UnidadeVinculada = { id: 'u9', descricao: 'Sonda', codigo: 'X9', origem: 'existente' };
    mem.set('d1', vinculo);
    const r = await cadastrarEResolver({ desconformidade: ABERTA, valores: valores(), localId: '', vinculo }, deps(s, mem));
    expect(r.tipo).toBe('vinculoPerdido');
    expect(mem.has('d1')).toBe(false);
  });

  it('outra falha da marcação mantém o vínculo (só o 404 da unidade esquece)', async () => {
    const s = servidor();
    s.unidades.push({ id: 'u1', descricao: 'Datalogger', codigo: 'ET-0042' });
    const vinculo: UnidadeVinculada = { id: 'u1', descricao: 'Datalogger', codigo: 'ET-0042', origem: 'criada' };
    const mem = new Map([['d1', vinculo]]);
    s.falhasPatch.push(new ErroEstoque('Não achou.', 'desconformidade_nao_encontrada', 404));
    const r = await cadastrarEResolver({ desconformidade: ABERTA, valores: valores(), localId: '', vinculo }, deps(s, mem));
    expect(r.tipo).toBe('falhaMarcacao');
    expect(mem.get('d1')).toEqual(vinculo);
  });
});

describe('M3: desconformidade alterada por outra pessoa', () => {
  it('devolve `alterada` sem transformar em falha genérica e mantém a unidade criada na memória', async () => {
    const s = servidor();
    const mem = new Map<string, UnidadeVinculada>();
    s.falhasPatch.push(new ErroEstoque('Mudou.', 'desconformidade_alterada', 409));
    const r = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores(), localId: '', vinculo: null },
      deps(s, mem),
    );
    expect(r.tipo).toBe('alterada');
    expect(r.mensagem).toBe(
      'O item "Datalogger" (código ET-0042) foi cadastrado, mas outra pessoa alterou esta desconformidade antes de você salvar e ele ficou sem vínculo com ela. A lista foi atualizada; confira a situação atual e localize o item em Serializados.',
    );
    expect(mem.get('d1')?.id).toBe('u1');
    // Não apaga a unidade criada: ela continua no servidor para o gestor achar.
    expect(s.unidades).toEqual([{ id: 'u1', descricao: 'Datalogger', codigo: 'ET-0042' }]);
  });

  it('POST 201 seguido de 409 com item sem código diz que ele não tem código', async () => {
    const s = servidor();
    s.falhasPatch.push(new ErroEstoque('Mudou.', 'desconformidade_alterada', 409));
    const r = await cadastrarEResolver(
      { desconformidade: ABERTA, valores: valores({ codigo: '' }), localId: '', vinculo: null },
      deps(s, new Map()),
    );
    expect(r.tipo).toBe('alterada');
    expect(r.mensagem).toMatch(/^O item "Datalogger" \(sem código\) foi cadastrado, mas outra pessoa/);
  });

  it('sem unidade criada nesta tentativa usa a mensagem padrão', async () => {
    const s = servidor();
    s.falhasPatch.push(new ErroEstoque('Mudou.', 'desconformidade_alterada', 409));
    const vinculo: UnidadeVinculada = { id: 'u9', descricao: 'X', codigo: null, origem: 'existente' };
    const r = await cadastrarEResolver({ desconformidade: ABERTA, valores: valores(), localId: '', vinculo }, deps(s, new Map()));
    expect(r).toMatchObject({ tipo: 'alterada', mensagem: MENSAGEM_ALTERADA });
  });
});

describe('vínculos na aba do navegador', () => {
  function armazenamento() {
    const dados = new Map<string, string>();
    return {
      dados,
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
    };
  }

  it('grava e relê o vínculo (sobrevive a recarregar a página)', () => {
    const a = armazenamento();
    const v: UnidadeVinculada = { id: 'u1', descricao: 'Datalogger', codigo: null, origem: 'criada' };
    gravarVinculos(a, { d1: v });
    expect(lerVinculos(a)).toEqual({ d1: v });
  });

  it('mapa vazio apaga a chave; conteúdo corrompido ou de outro formato é descartado', () => {
    const a = armazenamento();
    gravarVinculos(a, { d1: { id: 'u1', descricao: 'x', codigo: 'c', origem: 'criada' } });
    gravarVinculos(a, {});
    expect(a.dados.has(CHAVE_VINCULOS)).toBe(false);

    a.setItem(CHAVE_VINCULOS, '{nao e json');
    expect(lerVinculos(a)).toEqual({});
    a.setItem(CHAVE_VINCULOS, JSON.stringify({ d1: { id: '', descricao: 'x' }, d2: 'lixo' }));
    expect(lerVinculos(a)).toEqual({});
    expect(lerVinculos(null)).toEqual({});
  });
});
