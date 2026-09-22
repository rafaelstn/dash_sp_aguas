import { describe, expect, it } from 'vitest';
import { atendeFiltros, contarFacetas, type PontoMapaPosto } from '@/domain/mapa-postos';
import {
  ESTADO_PADRAO,
  casaBusca,
  contarFiltrosAtivos,
  filtrosDoEstado,
  lerEstado,
  normalizarBusca,
  parametrosDaApi,
  serializarEstado,
} from '@/components/features/postos/mapa/estado-url';

/**
 * Estado da tela Postos na URL. Cada caso existe por um link que alguém cola no
 * chat e precisa abrir a mesma tela, ou por um link velho da busca antiga que
 * não pode abrir a tela errada.
 */

const ler = (query: string) => lerEstado(new URLSearchParams(query));

function ponto(parcial: Partial<PontoMapaPosto>): PontoMapaPosto {
  return {
    prefixo: 'X-001',
    nome: 'POSTO',
    lat: -23,
    lon: -46,
    tipo: 'plu',
    situacao: 'em_operacao',
    transmissao: [],
    vazao: [],
    ugrhi: 6,
    municipio: null,
    uf: 'SP',
    coordenadaSuspeita: false,
    ...parcial,
  };
}

describe('abertura sem parâmetro', () => {
  it('abre com meteorológico desligado e só postos em operação', () => {
    const e = ler('');
    expect(e.tipos).toEqual(['plu', 'flu', 'piezo']);
    expect(e.situacoes).toEqual(['em_operacao']);
    expect(serializarEstado(e)).toBe('');
    expect(contarFiltrosAtivos(e)).toBe(0);
  });
});

describe('ida e volta pela URL', () => {
  it('o link colado reabre o mesmo posto, UGRHI e filtros', () => {
    const query =
      'q=ribeir%C3%A3o&tipo=flu&situacao=em_operacao%2Cextinto&transmissao=telemetrico&vazao=curva&ugrhi=6&posto=6B-009';
    const e = ler(query);
    expect(e.q).toBe('ribeirão');
    expect(e.tipos).toEqual(['flu']);
    expect(e.situacoes).toEqual(['em_operacao', 'extinto']);
    expect(e.transmissoes).toEqual(['telemetrico']);
    expect(e.vazao).toBe('curva');
    expect(e.ugrhi).toBe(6);
    expect(e.posto).toBe('6B-009');
    expect(lerEstado(new URLSearchParams(serializarEstado(e)))).toEqual(e);
  });

  it('tipo sem nada marcado sobrevive ao link, em vez de voltar ao padrão', () => {
    const e = { ...ESTADO_PADRAO, tipos: [] };
    const volta = ler(serializarEstado(e));
    expect(volta.tipos).toEqual([]);
  });

  it('"sem UGRHI" é um valor próprio, e UGRHI fora de 1 a 22 é ignorada', () => {
    expect(ler('ugrhi=sem').ugrhi).toBe('sem');
    expect(ler('ugrhi=23').ugrhi).toBeNull();
    expect(ler('ugrhi=abc').ugrhi).toBeNull();
  });

  it('valor desconhecido numa lista é descartado sem derrubar os válidos', () => {
    expect(ler('transmissao=telemetrico,satelite').transmissoes).toEqual(['telemetrico']);
    expect(ler('vazao=muita').vazao).toBeNull();
  });
});

describe('links da busca antiga', () => {
  it('status=desativado abre os extintos, e tem_telem abre os telemétricos', () => {
    const e = ler('status=desativado&tem_telem=1&ugrhi=5&pagina=3&lat=-23&lng=-46');
    expect(e.situacoes).toEqual(['extinto']);
    expect(e.transmissoes).toEqual(['telemetrico']);
    expect(e.ugrhi).toBe(5);
  });

  it('tipo por descrição livre vira o código do mapa', () => {
    expect(ler('tipo=PLUVIOM%C3%89TRICO').tipos).toEqual(['plu']);
    // Descrição que não se reconhece não esvazia o mapa.
    expect(ler('tipo=QUALIDADE').tipos).toEqual(['plu', 'flu', 'piezo']);
  });

  it('município, bacia, mantenedor e favoritos seguem para a API', () => {
    const e = ler('municipio=Campinas&bacia=Tiet%C3%AA&favoritos=1');
    expect(parametrosDaApi(e.escopo)).toBe('municipio=Campinas&bacia=Tiet%C3%AA&favoritos=1');
  });
});

describe('filtros entregues ao domínio', () => {
  it('dimensão sem nada marcado esconde tudo, e zera a contagem das outras', () => {
    const e = { ...ESTADO_PADRAO, situacoes: [] };
    const filtros = filtrosDoEstado(e);
    const p = ponto({});
    expect(atendeFiltros(p, filtros)).toBe(false);
    const facetas = contarFacetas([p], filtros);
    expect(facetas.tipo.plu).toBe(0);
    // A própria dimensão continua contando, para a pessoa ver o que ganharia.
    expect(facetas.situacao.em_operacao).toBe(1);
  });

  it('todos os tipos marcados não escondem posto de tipo não reconhecido', () => {
    const e = { ...ESTADO_PADRAO, tipos: ['plu', 'flu', 'piezo', 'meteo'] as const };
    expect(atendeFiltros(ponto({ tipo: null }), filtrosDoEstado(e))).toBe(true);
    expect(atendeFiltros(ponto({ tipo: null }), filtrosDoEstado(ESTADO_PADRAO))).toBe(false);
  });

  it('transmissão vazia é "não informada": o posto aparece sem filtro e sai com filtro', () => {
    const semTransmissao = ponto({ transmissao: [] });
    expect(atendeFiltros(semTransmissao, filtrosDoEstado(ESTADO_PADRAO))).toBe(true);
    const comFiltro = { ...ESTADO_PADRAO, transmissoes: ['convencional'] as const };
    expect(atendeFiltros(semTransmissao, filtrosDoEstado(comFiltro))).toBe(false);
  });
});

describe('busca por texto', () => {
  it('ignora acento e caixa, no prefixo e no nome', () => {
    const termo = normalizarBusca('  São José ');
    expect(casaBusca(ponto({ nome: 'SAO JOSE DOS CAMPOS' }), termo)).toBe(true);
    expect(casaBusca(ponto({ prefixo: '2D-008', nome: null }), normalizarBusca('2d-0'))).toBe(true);
    expect(casaBusca(ponto({ nome: null }), termo)).toBe(false);
  });

  it('acha o posto pelo município do cadastro, sem acento e em caixa alta', () => {
    const p = ponto({ nome: 'FAZENDA BOA VISTA', municipio: 'SAO JOSE DO RIO PRETO' });
    expect(casaBusca(p, normalizarBusca('São José do Rio'))).toBe(true);
    expect(casaBusca(ponto({ municipio: null }), normalizarBusca('rio preto'))).toBe(false);
  });
});

describe('UF', () => {
  it('link sem uf abre em SP, e SP não entra na URL nem conta como filtro', () => {
    const e = ler('');
    expect(e.uf).toBe('SP');
    expect(filtrosDoEstado(e).uf).toEqual(['SP']);
    expect(serializarEstado(e)).toBe('');
    expect(contarFiltrosAtivos(e)).toBe(0);
    expect(atendeFiltros(ponto({ uf: 'PR', ugrhi: null }), filtrosDoEstado(e))).toBe(false);
  });

  it('outro estado, todos e "sem UF" vão e voltam pelo link', () => {
    for (const [query, uf, filtro] of [
      ['uf=pr', 'PR', ['PR']],
      ['uf=todas', null, undefined],
      ['uf=sem', 'sem', [null]],
    ] as const) {
      const e = ler(query);
      expect(e.uf).toBe(uf);
      expect(filtrosDoEstado(e).uf).toEqual(filtro);
      expect(contarFiltrosAtivos(e)).toBe(1);
      expect(lerEstado(new URLSearchParams(serializarEstado(e)))).toEqual(e);
    }
  });

  it('uf inválida volta para SP em vez de esconder tudo', () => {
    expect(ler('uf=xyz').uf).toBe('SP');
    expect(ler('uf=').uf).toBe('SP');
  });

  it('"sem UF" e "sem UGRHI" selecionam o posto sem valor, que nunca some', () => {
    const semNada = ponto({ uf: null, ugrhi: null, coordenadaSuspeita: true });
    const e = ler('uf=sem&ugrhi=sem');
    expect(filtrosDoEstado(e).ugrhi).toEqual([null]);
    expect(atendeFiltros(semNada, filtrosDoEstado(e))).toBe(true);
    expect(atendeFiltros(ponto({}), filtrosDoEstado(e))).toBe(false);
    const facetas = contarFacetas([semNada, ponto({}), ponto({ uf: 'MG', ugrhi: null })], filtrosDoEstado(ler('uf=todas')));
    expect(facetas.uf).toEqual([
      { uf: 'SP', total: 1 },
      { uf: 'MG', total: 1 },
      { uf: null, total: 1 },
    ]);
  });
});
