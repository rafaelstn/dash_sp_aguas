import 'server-only';
import type { Paginacao } from '@/application/ports/series-medicao-repository';
import type {
  CurvaChave,
  MedicaoVazao,
  PaginaMedicoesVazao,
  VazaoPostoRepository,
} from '@/application/ports/vazao-posto-repository';
import { POSTOS_FIXTURES } from './fixtures';
import { POSTOS_DEMO_COM_CURVA, POSTOS_DEMO_COM_MEDICAO } from './mapa-postos-repository.mock';

/**
 * Medições de vazão e curvas-chave em memória, para o MODO DEMO.
 *
 * Determinístico, sem relógio. Reproduz os estados que a tela precisa tratar:
 * posto inexistente (`null`), posto sem nada (lista vazia), medição com campo
 * opcional vazio e curva sem equação gravada.
 */

const MS_DIA = 24 * 60 * 60 * 1000;
const INICIO = Date.UTC(2010, 0, 15, 13, 0);
const QUANTIDADE_MEDICOES = 30;

function existe(prefixo: string): string | null {
  const alvo = prefixo.trim().toUpperCase();
  return POSTOS_FIXTURES.find((p) => p.prefixo.toUpperCase() === alvo)?.prefixo ?? null;
}

function medicao(i: number): MedicaoVazao {
  const inicio = INICIO + i * 45 * MS_DIA;
  const cota = Math.round((1.1 + ((i * 7) % 20) / 10) * 100) / 100;
  return {
    dataInicial: new Date(inicio).toISOString(),
    dataFinal: new Date(inicio + 90 * 60 * 1000).toISOString(),
    cotaInicial: cota,
    cotaFinal: Math.round((cota + 0.02) * 100) / 100,
    vazaoLiquida: Math.round((12.5 + ((i * 13) % 50)) * 1000) / 1000,
    // A cada cinco medições a seção não foi gravada, como acontece na origem.
    areaSeccao: i % 5 === 0 ? null : 40 + i,
    larguraSeccao: i % 5 === 0 ? null : 22.5,
    profundidadeMedia: i % 5 === 0 ? null : 1.8,
    velocidadeMedia: i % 5 === 0 ? null : 0.412,
    qualidade: i % 4 === 0 ? 'R' : 'B',
    entidadeMedidora: 'DAEE',
  };
}

const CURVAS_DEMO: readonly CurvaChave[] = [
  {
    dataInicio: '2018-01-01T00:00:00.000Z',
    dataFinal: '2024-12-31T00:00:00.000Z',
    vigente: false,
    indiceQualidade: 'REG',
    consistencia: 'C',
    trechos: [
      { k: 14.5, h: 0.2, n: 1.59, i: 1.2 },
      { k: 33.5, h: 0.45, n: 1.29, i: 10 },
    ],
  },
  {
    dataInicio: '2009-01-01T00:00:00.000Z',
    dataFinal: '2017-12-31T00:00:00.000Z',
    vigente: false,
    indiceQualidade: 'REG',
    consistencia: 'I',
    // Curva sem equação gravada: 135 curvas reais estão assim.
    trechos: [],
  },
];

export const vazaoPostoRepositoryMock: VazaoPostoRepository = {
  async listarMedicoes(
    prefixo: string,
    paginacao: Paginacao,
  ): Promise<PaginaMedicoesVazao | null> {
    const posto = existe(prefixo);
    if (posto === null) return null;
    if (!POSTOS_DEMO_COM_MEDICAO.has(posto)) return { total: 0, itens: [] };

    // Mais recente primeiro, como na origem.
    const todas = Array.from({ length: QUANTIDADE_MEDICOES }, (_, i) =>
      medicao(QUANTIDADE_MEDICOES - 1 - i),
    );
    const inicio = (paginacao.pagina - 1) * paginacao.porPagina;
    return {
      total: todas.length,
      itens: todas.slice(inicio, inicio + paginacao.porPagina),
    };
  },

  async listarCurvasChave(prefixo: string): Promise<readonly CurvaChave[] | null> {
    const posto = existe(prefixo);
    if (posto === null) return null;
    return POSTOS_DEMO_COM_CURVA.has(posto) ? CURVAS_DEMO : [];
  },
};
