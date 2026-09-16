import { describe, it, expect } from 'vitest';
import {
  STATUS_DESCONFORMIDADE,
  TIPOS_DESCONFORMIDADE,
  type DesconformidadeDTO,
} from '@/components/features/estoque/dtos';
import {
  NOTA_CADASTRO,
  NOTA_MAX,
  ROTULO_STATUS_DESCONFORMIDADE,
  ROTULO_TIPO_DESCONFORMIDADE,
  VAZIO_POR_STATUS,
  acoesDisponiveis,
  classeBadgeStatusDesconformidade,
  indiceDeFoco,
  mudarFiltro,
  paginaDeRecuo,
  type FiltroLista,
  localCorrespondente,
  localizacaoPlanilha,
  termoBuscaDe,
  validarCadastroItem,
  validarNota,
  valoresIniciaisCadastro,
} from '@/components/features/estoque/desconformidades/desconformidades-ui';

function item(parcial: Partial<DesconformidadeDTO>): DesconformidadeDTO {
  return {
    id: 'd1',
    tipo: 'item_sem_descricao',
    origem: 'inventario.xlsx',
    aba: 'GERAL PENHA',
    linha: 12,
    detalhe: '',
    dados: {},
    status: 'aberta',
    nota: null,
    unidadeId: null,
    resolvidaPor: null,
    resolvidaEm: null,
    detectadaEm: '2026-09-16T10:00:00.000Z',
    ultimaDeteccaoEm: '2026-09-16T10:00:00.000Z',
    ...parcial,
  };
}

describe('rótulos de desconformidade', () => {
  it('todo tipo e todo status tem rótulo humano, nunca o enum cru', () => {
    for (const t of TIPOS_DESCONFORMIDADE) {
      const r = ROTULO_TIPO_DESCONFORMIDADE[t];
      expect(r, t).toBeTruthy();
      expect(r).not.toContain('_');
      expect(r).not.toBe(t);
    }
    for (const s of STATUS_DESCONFORMIDADE) {
      expect(ROTULO_STATUS_DESCONFORMIDADE[s]).toMatch(/^[A-Z]/);
      expect(VAZIO_POR_STATUS[s]).toMatch(/^Nenhuma desconformidade /);
      expect(classeBadgeStatusDesconformidade(s)).toMatch(/border-/);
    }
  });

  it('usa acentuação correta nos rótulos', () => {
    expect(ROTULO_TIPO_DESCONFORMIDADE.item_sem_descricao).toBe('Item sem descrição');
    expect(ROTULO_TIPO_DESCONFORMIDADE.coluna_sem_cabecalho).toBe('Coluna sem cabeçalho');
    expect(ROTULO_TIPO_DESCONFORMIDADE.identificador_repetido).toBe('Patrimônio repetido');
  });
});

describe('localizacaoPlanilha', () => {
  it('combina aba e linha, ou mostra só o que existe', () => {
    expect(localizacaoPlanilha('GERAL PENHA', 12)).toBe('GERAL PENHA, linha 12');
    expect(localizacaoPlanilha('MODENS', null)).toBe('MODENS');
    expect(localizacaoPlanilha(null, 3)).toBe('Linha 3');
    expect(localizacaoPlanilha('  ', null)).toBe('—');
    expect(localizacaoPlanilha(null, null)).toBe('—');
  });
});

describe('validarNota (espelha o PATCH: 3 a 500 após trim)', () => {
  it('reprova vazia, só espaço e curta demais', () => {
    expect(validarNota('')).not.toBeNull();
    expect(validarNota('     ')).not.toBeNull();
    expect(validarNota(' ok ')).toMatch(/ao menos 3/);
  });

  it('reprova acima de 500 caracteres', () => {
    expect(validarNota('a'.repeat(NOTA_MAX + 1))).toMatch(/máximo 500/);
  });

  it('aprova nos limites exatos', () => {
    expect(validarNota('abc')).toBeNull();
    expect(validarNota('a'.repeat(NOTA_MAX))).toBeNull();
    expect(validarNota(`  ${'a'.repeat(NOTA_MAX)}  `)).toBeNull();
  });

  it('a nota automática do cadastro passa na própria régua', () => {
    expect(validarNota(NOTA_CADASTRO)).toBeNull();
  });
});

describe('valoresIniciaisCadastro', () => {
  it('pré-preenche os identificadores e deixa a descrição vazia', () => {
    const v = valoresIniciaisCadastro({
      codigo: ' 12SPA26PENHA ',
      marca: 'Campbell',
      modelo: 'CR1000',
      numeroSerie: 12345,
      patDaee: '00991',
      descricao: 'não deveria vir',
      sala: 'A',
    });
    expect(v).toEqual({
      codigo: '12SPA26PENHA',
      descricao: '',
      marca: 'Campbell',
      modelo: 'CR1000',
      numeroSerie: '12345',
      patDaee: '00991',
    });
  });

  it('ignora campo ausente, nulo ou de tipo inesperado', () => {
    const v = valoresIniciaisCadastro({ marca: null, modelo: { x: 1 }, numeroSerie: Number.NaN });
    expect(v.marca).toBe('');
    expect(v.modelo).toBe('');
    expect(v.numeroSerie).toBe('');
    expect(v.codigo).toBe('');
  });
});

describe('validarCadastroItem', () => {
  const base = valoresIniciaisCadastro({ codigo: '1SPA26PENHA' });

  it('exige a descrição, que é o que a planilha não trouxe', () => {
    expect(validarCadastroItem(base)).toMatch(/descrição/);
    expect(validarCadastroItem({ ...base, descricao: '   ' })).toMatch(/descrição/);
  });

  it('respeita os limites do POST de unidade', () => {
    expect(validarCadastroItem({ ...base, descricao: 'x'.repeat(301) })).toMatch(/300/);
    expect(validarCadastroItem({ ...base, descricao: 'Datalogger', marca: 'm'.repeat(121) })).toMatch(/marca/);
    expect(validarCadastroItem({ ...base, descricao: 'Datalogger' })).toBeNull();
  });
});

describe('localCorrespondente', () => {
  const locais = [
    { id: 'l1', unidade: 'PENHA' as const, sala: 'ALMOXARIFADO', prateleira: '2', armario: null },
    { id: 'l2', unidade: 'PENHA' as const, sala: 'ALMOXARIFADO', prateleira: '3', armario: null },
    { id: 'l3', unidade: 'ARARAQUARA' as const, sala: 'ALMOXARIFADO', prateleira: '2', armario: null },
  ];

  it('acha o local único ignorando caixa, acento e marcador vazio', () => {
    expect(
      localCorrespondente({ unidade: 'penha', sala: 'Almoxarifado', prateleira: 2, armario: '-' }, locais),
    ).toBe('l1');
  });

  it('não chuta quando falta unidade, localização ou há ambiguidade', () => {
    expect(localCorrespondente({ sala: 'ALMOXARIFADO', prateleira: '2' }, locais)).toBe('');
    expect(localCorrespondente({ unidade: 'PENHA' }, locais)).toBe('');
    expect(localCorrespondente({ unidade: 'PENHA', sala: 'ALMOXARIFADO' }, locais)).toBe('');
    const duplicados = [...locais, { ...locais[0]!, id: 'l9' }];
    expect(
      localCorrespondente({ unidade: 'PENHA', sala: 'ALMOXARIFADO', prateleira: '2' }, duplicados),
    ).toBe('');
  });
});

describe('termoBuscaDe', () => {
  it('prefere o valor em dados', () => {
    expect(
      termoBuscaDe(item({ tipo: 'identificador_repetido', detalhe: 'X em 2 unidades', dados: { valor: '00991' } })),
    ).toBe('00991');
  });

  it('usa o identificador da chave repetida quando o item não tem código (formato gravado pelo importador)', () => {
    expect(
      termoBuscaDe(
        item({
          tipo: 'chave_repetida',
          detalhe: 'PENHA:359911030501121 já usada em "MODENS" linha 61; esta linha sobrescreve aquela',
          dados: { codigo: null, identificador: '359911030501121' },
        }),
      ),
    ).toBe('359911030501121');
  });

  it('tira o nome do campo do detalhe quando falta o valor em dados', () => {
    expect(
      termoBuscaDe(
        item({
          tipo: 'identificador_repetido',
          detalhe: 'PAT DAEE 17264/40786 em 2 unidades: "GERAL PENHA" linha 2, "GERAL PENHA" linha 479',
          dados: { campo: 'PAT DAEE' },
        }),
      ),
    ).toBe('17264/40786');
  });

  it('extrai o patrimônio do detalhe do identificador repetido', () => {
    expect(
      termoBuscaDe(
        item({
          tipo: 'identificador_repetido',
          detalhe: '00991 em 2 unidades: "GERAL PENHA" linha 4, "GERAL PENHA" linha 9',
        }),
      ),
    ).toBe('00991');
  });

  it('extrai o código da chave repetida e recusa chave por hash', () => {
    expect(
      termoBuscaDe(
        item({
          tipo: 'chave_repetida',
          detalhe: 'PENHA:1SPA26PENHA já usada em "GERAL PENHA" linha 3; esta linha sobrescreve aquela',
        }),
      ),
    ).toBe('1SPA26PENHA');
    expect(
      termoBuscaDe(
        item({ tipo: 'chave_repetida', detalhe: 'PENHA:H:ab12cd34ef56ab78 já usada em "X" linha 3' }),
      ),
    ).toBeNull();
  });

  it('não oferece busca para os outros tipos, mesmo com código em dados', () => {
    expect(termoBuscaDe(item({ tipo: 'item_sem_descricao', dados: { codigo: '1SPA26PENHA' } }))).toBeNull();
    expect(termoBuscaDe(item({ tipo: 'quantidade_vazia', detalhe: 'Luva: entra com saldo 0' }))).toBeNull();
  });
});

describe('acoesDisponiveis', () => {
  it('quem só lê não recebe ação de escrita', () => {
    expect(acoesDisponiveis(item({ tipo: 'item_sem_descricao' }), false)).toEqual([]);
    expect(acoesDisponiveis(item({ status: 'resolvida' }), false)).toEqual([]);
    expect(
      acoesDisponiveis(item({ tipo: 'identificador_repetido', detalhe: '00991 em 2 unidades: x' }), false),
    ).toEqual(['verItens']);
  });

  it('item sem descrição aberto tem cadastrar como ação principal', () => {
    expect(acoesDisponiveis(item({ tipo: 'item_sem_descricao' }), true)).toEqual([
      'cadastrar',
      'resolver',
      'ignorar',
    ]);
  });

  it('fechada só reabre; outros tipos abertos não cadastram', () => {
    expect(acoesDisponiveis(item({ status: 'ignorada' }), true)).toEqual(['reabrir']);
    expect(acoesDisponiveis(item({ tipo: 'descricao_suspeita' }), true)).toEqual(['resolver', 'ignorar']);
  });
});

describe('mudarFiltro (B5: filtro e página mudam juntos)', () => {
  const pagina2: FiltroLista = { status: 'aberta', tipo: '', pagina: 2 };

  it('trocar situação ou tipo volta para a página 1 no mesmo estado', () => {
    expect(mudarFiltro(pagina2, { campo: 'status', valor: 'resolvida' })).toEqual({
      status: 'resolvida',
      tipo: '',
      pagina: 1,
    });
    expect(mudarFiltro(pagina2, { campo: 'tipo', valor: 'chave_repetida' })).toEqual({
      status: 'aberta',
      tipo: 'chave_repetida',
      pagina: 1,
    });
  });

  it('paginar preserva o filtro; valor repetido devolve o mesmo objeto (sem nova busca)', () => {
    expect(mudarFiltro(pagina2, { campo: 'pagina', valor: 3 })).toEqual({ ...pagina2, pagina: 3 });
    expect(mudarFiltro(pagina2, { campo: 'pagina', valor: 0 }).pagina).toBe(1);
    expect(mudarFiltro(pagina2, { campo: 'status', valor: 'aberta' })).toBe(pagina2);
    expect(mudarFiltro(pagina2, { campo: 'pagina', valor: 2 })).toBe(pagina2);
  });
});

describe('paginaDeRecuo (A2: página vazia com registros restantes)', () => {
  it('resolveu o último item da página 3 com 40 registros por 20: volta para a 2', () => {
    expect(paginaDeRecuo(3, 40, 20, 0)).toBe(2);
    expect(paginaDeRecuo(5, 41, 20, 0)).toBe(3);
  });

  it('não mexe quando a página tem itens, quando não há registros ou já está na 1', () => {
    expect(paginaDeRecuo(3, 40, 20, 1)).toBeNull();
    expect(paginaDeRecuo(3, 0, 20, 0)).toBeNull();
    expect(paginaDeRecuo(1, 40, 20, 0)).toBeNull();
  });

  it('página ainda existente e vazia (corrida) não entra em laço', () => {
    expect(paginaDeRecuo(2, 40, 20, 0)).toBeNull();
  });
});

describe('indiceDeFoco (M2: foco depois da ação)', () => {
  it('mantém a posição, cai para a última quando a lista encolheu e some sem itens', () => {
    expect(indiceDeFoco(1, 5)).toBe(1);
    expect(indiceDeFoco(4, 4)).toBe(3);
    expect(indiceDeFoco(-1, 3)).toBe(0);
    expect(indiceDeFoco(0, 0)).toBeNull();
  });
});
