/**
 * "Não há autoria" e "você não vê a autoria" são estados DIFERENTES, no painel
 * de divergências da conferência física (06/10/2026).
 *
 * Desde a mesma data, `GET /api/estoque/conferencias/[id]/itens` devolve os
 * quatro campos de autoria como `null` para quem não gerencia o estoque, com
 * `autoriaVisivel: false` no envelope. Antes desta régua, `autoriaDoItem` só
 * sabia ler os campos nulos, então a recusa por escopo aparecia na tela como
 * "Contado (autoria não registrada)" num item que TEM autor registrado, que é a
 * mesma frase do item contado antes da migration 0065, onde a ausência é
 * verdadeira.
 *
 * Esta régua afirma os TRÊS estados e, de propósito, afirma também o que cada
 * frase NÃO pode dizer: com os campos de autoria nulos o estado de partida é o
 * mesmo em dois deles, e asserção de presença sozinha deixaria os opostos
 * passarem. O terceiro estado (autoria presente) é a âncora de presença.
 *
 * A cadeia é medida INTEIRA, do corpo HTTP até o texto na tela: o `fetch` é o
 * único dublê, e `carregarItensCompleto`, o `DivergenciasPanel` e o
 * `autoriaDoItem` são os reais. É isso que faz o booleano invertido na camada
 * que propaga reprovar aqui, e não só no teste da função pura.
 *
 * A data formatada vem do MESMO `formatarDataHora` que a tela usa, porque esta
 * régua mede qual das três frases aparece e não o formato da data (que não tem
 * fuso fixado nesta suíte). Quem mede o formato é `erros-rotulos.test.ts`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DivergenciasPanel } from '@/components/features/estoque/conferencia/DivergenciasPanel';
import type { Resolvedores } from '@/components/features/estoque/conferencia/resolvedores';
import { carregarItensCompleto } from '@/components/features/estoque/conferencia-api';
import { autoriaDoItem } from '@/components/features/estoque/conferencia-ui';
import { formatarDataHora } from '@/components/features/estoque/rotulos';
import type {
  ConferenciaDTO,
  ConferenciaItemDTO,
  ListaItensConferenciaDTO,
  ResumoDivergenciasDTO,
} from '@/components/features/estoque/conferencia-dtos';

const CONFERENCIA_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LOCAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MATERIAL = '22222222-2222-2222-2222-222222222222';
const OPERADOR_ID = '33333333-3333-3333-3333-333333333333';
const RECONCILIADOR_ID = '44444444-4444-4444-4444-444444444444';
const CONTADO_EM = '2026-07-15T14:30:00.000Z';

const FRASE_RECUSA = 'Autoria restrita à gestão do estoque';
const FRASE_AUSENCIA = 'Contado (autoria não registrada)';

const CONFERENCIA: ConferenciaDTO = {
  id: CONFERENCIA_ID,
  unidade: 'PENHA',
  natureza: 'quantificavel',
  localId: LOCAL_A,
  status: 'concluida',
  observacao: null,
  criadaPor: OPERADOR_ID,
  criadaEm: '2026-07-15T10:00:00.000Z',
  concluidaPor: OPERADOR_ID,
  concluidaEm: '2026-07-15T18:00:00.000Z',
  atualizadaEm: '2026-07-15T18:00:00.000Z',
};

const RESUMO: ResumoDivergenciasDTO = {
  totalItens: 1,
  contados: 1,
  naoContados: 0,
  divergentes: 1,
  reconciliados: 0,
  pendentesReconciliacao: 1,
  porSituacao: {
    pendente: 0,
    conferido: 0,
    nao_encontrado: 0,
    encontrado_em_outro_local: 0,
  },
};

const RESOLVEDORES: Resolvedores = {
  carregando: false,
  nomeLocal: (id) => (id === LOCAL_A ? 'Almoxarifado Penha' : '—'),
  rotuloItem: () => 'Luva isolante classe 2',
  detalheItem: () => null,
  locais: [],
};

/** Item quantificável DIVERGENTE (sobra de 2), que é o que o painel lista. */
function item(over: Partial<ConferenciaItemDTO> = {}): ConferenciaItemDTO {
  return {
    id: 'item-1',
    conferenciaId: CONFERENCIA_ID,
    unidadeId: null,
    materialId: MATERIAL,
    localEsperadoId: LOCAL_A,
    tamanho: null,
    origem: 'snapshot',
    situacao: null,
    localEncontradoId: null,
    quantidadeSistema: 8,
    quantidadeContada: 10,
    diferenca: 2,
    observacao: null,
    contadoPor: null,
    contadoEm: CONTADO_EM,
    contadoPorRotulo: null,
    movimentacaoId: null,
    reconciliadoPor: null,
    reconciliadoPorRotulo: null,
    reconciliadoEm: null,
    criadoEm: '2026-07-15T10:00:00.000Z',
    atualizadoEm: CONTADO_EM,
    ...over,
  };
}

/** Como a rota serve para GESTOR: os quatro campos de autoria preenchidos. */
const ITEM_COM_AUTORIA = item({
  contadoPor: OPERADOR_ID,
  contadoPorRotulo: 'Maria Souza',
  reconciliadoPor: RECONCILIADOR_ID,
  reconciliadoPorRotulo: 'João Lima',
  reconciliadoEm: '2026-07-16T09:00:00.000Z',
});

/**
 * Como a rota serve para quem NÃO gerencia: os mesmos quatro campos nulos, o
 * carimbo de tempo mantido. Byte a byte igual ao item sem autoria no banco,
 * que é a razão de o envelope ter de dizer qual dos dois é.
 */
const ITEM_SEM_AUTORIA_NO_CORPO = item();

/** Uma página de resposta da rota, no formato real do envelope. */
function pagina(over: Partial<ListaItensConferenciaDTO>): ListaItensConferenciaDTO {
  return {
    itens: [ITEM_COM_AUTORIA],
    total: 1,
    pagina: 1,
    porPagina: 200,
    autoriaVisivel: true,
    ...over,
  };
}

/**
 * Dubla o `fetch` servindo as páginas na ordem, pelo parâmetro `pagina` da URL
 * (e não pela ordem das chamadas): é o servidor que está sendo imitado, e a
 * paginação é do cliente sob teste.
 */
function servirPaginas(paginas: readonly ListaItensConferenciaDTO[]): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: string | URL) => {
      const url = String(entrada);
      urls.push(url);
      const numero = Number(
        new URL(url, 'http://localhost').searchParams.get('pagina') ?? '1',
      );
      const corpo = paginas[numero - 1] ?? paginas[paginas.length - 1];
      return new Response(JSON.stringify(corpo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return urls;
}

/**
 * O painel é montado SEMPRE com `podeGerenciar={false}`, de propósito: é o único
 * valor que separa "a tela leu a resposta do servidor" de "a tela leu o papel
 * que chegou por prop". Medido com mutante em 06/10/2026: trocar
 * `carga.autoriaVisivel` por `podeGerenciar` mantém verde o caso da recusa (lá
 * os dois valem `false`) e só reprova nos dois casos em que o servidor ENTREGOU
 * a autoria, que é a situação real da janela sem identidade do ADR-0024.
 */
function montarPainel() {
  return render(
    <DivergenciasPanel
      conferencia={CONFERENCIA}
      resumo={RESUMO}
      podeGerenciar={false}
      resolvedores={RESOLVEDORES}
      aoMudar={() => {}}
      aoNotificar={() => {}}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('autoriaDoItem distingue os três estados da autoria', () => {
  const comAutoria = autoriaDoItem(ITEM_COM_AUTORIA, true);
  const ausenteNoBanco = autoriaDoItem(ITEM_SEM_AUTORIA_NO_CORPO, true);
  const recusadaPorEscopo = autoriaDoItem(ITEM_SEM_AUTORIA_NO_CORPO, false);

  it('autoria entregue: nomeia quem contou e quem reconciliou (âncora de presença)', () => {
    expect(comAutoria).toBe(
      `Contado por Maria Souza em ${formatarDataHora(CONTADO_EM)}` +
        ` · Reconciliado por João Lima em ${formatarDataHora('2026-07-16T09:00:00.000Z')}`,
    );
  });

  it('autoria entregue e ausente no banco: admite a lacuna, e não fala de restrição', () => {
    expect(ausenteNoBanco).toBe(FRASE_AUSENCIA);
    expect(ausenteNoBanco).not.toContain('restrita');
  });

  it('autoria recusada por escopo: diz a restrição, e NUNCA que não há autoria', () => {
    expect(recusadaPorEscopo).toBe(
      `Contado em ${formatarDataHora(CONTADO_EM)} · ${FRASE_RECUSA}`,
    );
    expect(recusadaPorEscopo).not.toContain('não registrada');
  });

  it('os três estados são textos distintos entre si', () => {
    expect(new Set([comAutoria, ausenteNoBanco, recusadaPorEscopo]).size).toBe(3);
  });

  it('autoria recusada sem carimbo de data: diz "Contado" e a restrição, sem data falsa', () => {
    // Caso real: item contado antes da migration 0065 (sem `contadoEm`) visto
    // por quem não gerencia. A tela não sabe se há autor, então não pode dizer
    // que não há, e também não pode inventar data.
    const texto = autoriaDoItem(item({ contadoEm: null }), false);
    expect(texto).toBe(`Contado · ${FRASE_RECUSA}`);
    expect(texto).not.toContain('—');
    expect(texto).not.toContain('não registrada');
  });

  it('item nem contado nem reconciliado não ganha frase de restrição', () => {
    const naoContado = item({ quantidadeContada: null, contadoEm: null, diferenca: null });
    expect(autoriaDoItem(naoContado, false)).toBe('Ainda não contado');
    expect(autoriaDoItem(naoContado, true)).toBe('Ainda não contado');
  });
});

describe('carregarItensCompleto propaga o autoriaVisivel do servidor', () => {
  it('uma página só: entrega o que o servidor disse, nos dois valores', async () => {
    servirPaginas([pagina({ autoriaVisivel: true })]);
    await expect(
      carregarItensCompleto(CONFERENCIA_ID, { apenasDivergentes: true }),
    ).resolves.toMatchObject({ autoriaVisivel: true });

    vi.unstubAllGlobals();
    servirPaginas([pagina({ autoriaVisivel: false, itens: [ITEM_SEM_AUTORIA_NO_CORPO] })]);
    await expect(
      carregarItensCompleto(CONFERENCIA_ID, { apenasDivergentes: true }),
    ).resolves.toMatchObject({ autoriaVisivel: false });
  });

  it('páginas discordando: falso vence, e nenhum item fica com frase de ausência', async () => {
    // Só acontece se a autorização mudar no meio da carga. O que NÃO pode é
    // ficar indefinido: a tela tem de escolher uma das três frases.
    const cheia = Array.from({ length: 200 }, (_, i) => item({ id: `com-${i}` }));
    servirPaginas([
      { itens: cheia, total: 201, pagina: 1, porPagina: 200, autoriaVisivel: true },
      {
        itens: [ITEM_SEM_AUTORIA_NO_CORPO],
        total: 201,
        pagina: 2,
        porPagina: 200,
        autoriaVisivel: false,
      },
    ]);
    const carga = await carregarItensCompleto(CONFERENCIA_ID, { apenasDivergentes: true });
    expect(carga.itens).toHaveLength(201);
    expect(carga.autoriaVisivel).toBe(false);
  });

  it('duas páginas visíveis: o agregado continua visível (o falso não vem de graça)', async () => {
    const cheia = Array.from({ length: 200 }, (_, i) => item({ id: `com-${i}` }));
    servirPaginas([
      { itens: cheia, total: 201, pagina: 1, porPagina: 200, autoriaVisivel: true },
      {
        itens: [ITEM_COM_AUTORIA],
        total: 201,
        pagina: 2,
        porPagina: 200,
        autoriaVisivel: true,
      },
    ]);
    const carga = await carregarItensCompleto(CONFERENCIA_ID, { apenasDivergentes: true });
    expect(carga.autoriaVisivel).toBe(true);
  });
});

describe('o painel de divergências lê o servidor, não o papel no navegador', () => {
  it('autoria recusada: a linha diz restrição, e o nome não chega à tela', async () => {
    servirPaginas([pagina({ autoriaVisivel: false, itens: [ITEM_SEM_AUTORIA_NO_CORPO] })]);
    montarPainel();

    expect(await screen.findByText(new RegExp(FRASE_RECUSA))).toBeInTheDocument();
    expect(screen.queryByText(/autoria não registrada/)).not.toBeInTheDocument();
    // Ausência no texto INTEIRO da tela, não só no nó que eu lembrei de olhar.
    expect(document.body.textContent).not.toContain('Maria Souza');
    expect(document.body.textContent).not.toContain(OPERADOR_ID);
  });

  it('autoria entregue: a linha nomeia quem contou, e não fala de restrição', async () => {
    servirPaginas([pagina({ autoriaVisivel: true })]);
    montarPainel();

    expect(await screen.findByText(/Contado por Maria Souza/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(FRASE_RECUSA))).not.toBeInTheDocument();
    expect(document.body.textContent).toContain('João Lima');
  });

  it('autoria entregue e ausente no banco: a linha admite a lacuna, sem falar de restrição', async () => {
    servirPaginas([pagina({ autoriaVisivel: true, itens: [ITEM_SEM_AUTORIA_NO_CORPO] })]);
    montarPainel();

    expect(await screen.findByText(/autoria não registrada/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(FRASE_RECUSA))).not.toBeInTheDocument();
  });

  it('o painel pergunta ao servidor pelas divergências antes de escrever a frase', async () => {
    const urls = servirPaginas([pagina({ autoriaVisivel: false, itens: [ITEM_SEM_AUTORIA_NO_CORPO] })]);
    montarPainel();
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(urls[0]).toContain(`/api/estoque/conferencias/${CONFERENCIA_ID}/itens`);
    expect(urls[0]).toContain('apenasDivergentes=true');
  });
});
