/**
 * "Não há" e "você não vê" são estados DIFERENTES (06/10/2026).
 *
 * Desde a mesma data, `GET /api/estoque/movimentacoes` e `GET /api/estoque/export`
 * rodam `exigirGestorEstoque()`: papel `user` colhe 403. Antes desta medição a
 * trilha só sabia renderizar lista vazia, então a recusa por escopo aparecia na
 * tela como "Sem movimentação registrada" num item que TEM histórico, e o botão
 * de exportar era oferecido para ser recusado no clique.
 *
 * Esta régua afirma as DUAS direções, de propósito: com lista vazia, o estado de
 * partida é o mesmo nos dois casos, e uma asserção só deixaria os opostos
 * passarem. Texto exato, porque é o texto que a pessoa lê.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TrilhaMovimentacoes } from '@/components/features/estoque/TrilhaMovimentacoes';
import { BotaoExportarExcel } from '@/components/features/estoque/BotaoExportarExcel';
import type {
  DetalheUnidadeDTO,
  MovimentacaoTrilhaDTO,
  UnidadeDTO,
} from '@/components/features/estoque/dtos';

/**
 * So `obterUnidade` e dublado; o resto do modulo de API continua o real, para o
 * `urlExportarMovimentacoes` que o drawer usa nao virar dubla silenciosa.
 */
const obterUnidade = vi.fn();
vi.mock('@/components/features/estoque/api', async (importarOriginal) => ({
  ...(await importarOriginal<Record<string, unknown>>()),
  obterUnidade: (...args: unknown[]) => obterUnidade(...args),
}));
const { UnidadeDetalhe } = await import('@/components/features/estoque/UnidadeDetalhe');

const LOCAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const nomeLocal = (id: string | null) => (id === LOCAL_A ? 'Almoxarifado Penha' : '—');

const SAIDA: MovimentacaoTrilhaDTO = {
  id: '99999999-9999-9999-9999-999999999999',
  tipo: 'saida',
  unidadeId: '11111111-1111-1111-1111-111111111111',
  materialId: null,
  quantidade: 1,
  localOrigemId: LOCAL_A,
  localDestinoId: null,
  estadoAnterior: null,
  estadoNovo: null,
  statusAnterior: null,
  statusNovo: null,
  motivo: null,
  usuarioId: '33333333-3333-3333-3333-333333333333',
  conferenciaId: null,
  solicitanteMatricula: '482913',
  criadoEm: '2026-10-06T12:00:00.000Z',
  operador: 'Ana Souza',
};

describe('a trilha separa recusa de ausência', () => {
  it('sem permissão: diz que é restrito, e NUNCA que não há evento', () => {
    render(
      <TrilhaMovimentacoes movimentacoes={[]} nomeLocal={nomeLocal} podeVerTrilha={false} />,
    );

    expect(screen.getByText('Trilha restrita à gestão do estoque')).toBeInTheDocument();
    // O defeito que motivou isto: a recusa dizia que a trilha estava vazia.
    expect(screen.queryByText('Sem movimentação registrada')).toBeNull();
    expect(
      screen.queryByText(/Ainda não há eventos na trilha/),
    ).toBeNull();
    // E ela precisa saber o que fazer, não só que não pode.
    expect(
      screen.getByText(/Peça o perfil de gestão do estoque a um administrador/i),
    ).toBeInTheDocument();
  });

  it('com permissão e sem evento: o estado vazio continua sendo o estado vazio', () => {
    render(
      <TrilhaMovimentacoes movimentacoes={[]} nomeLocal={nomeLocal} podeVerTrilha />,
    );

    expect(screen.getByText('Sem movimentação registrada')).toBeInTheDocument();
    expect(screen.queryByText('Trilha restrita à gestão do estoque')).toBeNull();
  });

  it('com permissão e com evento: a matrícula do solicitante aparece na linha', () => {
    render(
      <TrilhaMovimentacoes movimentacoes={[SAIDA]} nomeLocal={nomeLocal} podeVerTrilha />,
    );

    // Campo que a UI nunca mostra é campo decorativo: a saída agora registra
    // QUEM pediu, e a auditoria precisa ler isso.
    expect(screen.getByRole('columnheader', { name: 'Solicitante' })).toBeInTheDocument();
    expect(screen.getByText('482913')).toBeInTheDocument();
    // Identificador, nunca nome: a tela não resolve matrícula para pessoa.
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  });

  it('sem permissão, nem a trilha com eventos é renderizada', () => {
    render(
      <TrilhaMovimentacoes movimentacoes={[SAIDA]} nomeLocal={nomeLocal} podeVerTrilha={false} />,
    );

    expect(screen.getByText('Trilha restrita à gestão do estoque')).toBeInTheDocument();
    expect(screen.queryByText('482913')).toBeNull();
    expect(screen.queryByText('Ana Souza')).toBeNull();
  });
});

const UNIDADE: UnidadeDTO = {
  id: '11111111-1111-1111-1111-111111111111',
  materialId: null,
  codigo: 'PAT-00412',
  codigoSpaguas: null,
  patDaee: null,
  outrosPat: null,
  numeroSerie: null,
  helice: null,
  descricao: 'Notebook Dell 7420',
  marca: 'Dell',
  modelo: '7420',
  estado: null,
  status: 'ativo',
  localId: LOCAL_A,
  dataAquisicao: null,
  observacao: null,
  chaveImport: null,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
};

/**
 * O drawer do item serializado com o envelope de `GET /unidades/[id]`.
 *
 * Desde 06/10/2026 a rota devolve `historico: null` com `historicoVisivel:
 * false` para quem nao e gestor, e e `null` de proposito: com `[]` o drawer
 * diria "sem movimentacao" para um item que TEM trilha. O caso mede o drawer
 * INTEIRO, porque o defeito que motivou a mudanca nao estava na trilha, estava
 * em quem a monta.
 */
describe('o drawer da unidade com a trilha restrita', () => {
  function montarDrawer(detalhe: DetalheUnidadeDTO, podeGerenciar: boolean) {
    obterUnidade.mockReset();
    obterUnidade.mockResolvedValue(detalhe);
    render(
      <UnidadeDetalhe
        unidadeId={UNIDADE.id}
        versao={0}
        podeGerenciar={podeGerenciar}
        nomeLocal={nomeLocal}
        aoFechar={vi.fn()}
        aoMovimentar={vi.fn()}
        aoEditar={vi.fn()}
        aoExcluir={vi.fn()}
      />,
    );
  }

  it('historico null nao quebra o drawer, e a trilha diz que e restrita', async () => {
    montarDrawer({ unidade: UNIDADE, historico: null, historicoVisivel: false }, false);

    // O detalhe da unidade continua aberto: so a trilha nao vem.
    expect(await screen.findByText('Notebook Dell 7420')).toBeInTheDocument();
    expect(screen.getByText('Trilha restrita à gestão do estoque')).toBeInTheDocument();
    expect(screen.queryByText('Sem movimentação registrada')).toBeNull();
    // Exportar levaria 403: nao se oferece para recusar.
    expect(screen.queryByRole('button', { name: /Exportar movimentações/i })).toBeNull();
  });

  it('gestor com trilha visivel le os eventos e tem o export', async () => {
    montarDrawer({ unidade: UNIDADE, historico: [SAIDA], historicoVisivel: true }, true);

    expect(await screen.findByText('482913')).toBeInTheDocument();
    expect(screen.queryByText('Trilha restrita à gestão do estoque')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Exportar movimentações/i }),
    ).toBeInTheDocument();
  });

  it('visivel e vazia continua sendo vazia, e sem export para exportar nada', async () => {
    montarDrawer({ unidade: UNIDADE, historico: [], historicoVisivel: true }, true);

    expect(await screen.findByText('Sem movimentação registrada')).toBeInTheDocument();
    expect(screen.queryByText('Trilha restrita à gestão do estoque')).toBeNull();
    expect(screen.queryByRole('button', { name: /Exportar movimentações/i })).toBeNull();
  });

  /**
   * Os dois casos abaixo existem porque `podeGerenciar` (palpite do cliente) e
   * `historicoVisivel` (resposta do servidor) andavam SEMPRE juntos nos casos de
   * cima, e dois valores que nao se separam deixam passar quem leu o errado.
   * Aqui eles DISCORDAM, e quem manda e o servidor.
   */
  it('quem manda e o servidor: podeGerenciar true com historicoVisivel false esconde', async () => {
    montarDrawer({ unidade: UNIDADE, historico: null, historicoVisivel: false }, true);

    expect(await screen.findByText('Notebook Dell 7420')).toBeInTheDocument();
    expect(screen.getByText('Trilha restrita à gestão do estoque')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exportar movimentações/i })).toBeNull();
  });

  it('e com historicoVisivel true a trilha aparece mesmo com podeGerenciar false', async () => {
    montarDrawer({ unidade: UNIDADE, historico: [SAIDA], historicoVisivel: true }, false);

    expect(await screen.findByText('482913')).toBeInTheDocument();
    expect(screen.queryByText('Trilha restrita à gestão do estoque')).toBeNull();
    // O export tem a MESMA regra de backend da trilha (`exigirGestorEstoque`):
    // se o servidor entregou a trilha, exportar nao leva 403, e esconder o
    // botao por causa do palpite do cliente tira funcao de quem tem direito.
    expect(
      screen.getByRole('button', { name: /Exportar movimentações/i }),
    ).toBeInTheDocument();
  });

  it('envelope que se contradiz (visivel com historico null) nao derruba o drawer', async () => {
    // Nao e contrato: e defesa. `null` chegando onde a lista renderiza daria
    // `.map` de null e levaria o drawer inteiro, e o drawer tambem mostra o
    // registro da unidade, que a pessoa TEM direito de ver.
    montarDrawer({ unidade: UNIDADE, historico: null, historicoVisivel: true }, true);

    expect(await screen.findByText('Notebook Dell 7420')).toBeInTheDocument();
    expect(screen.getByText('Sem movimentação registrada')).toBeInTheDocument();
  });
});

describe('o 403 do export, montado como o servidor responde', () => {
  /** Corpo medido em `exigirGestorEstoque` (src/app/api/_helpers/auth.ts). */
  const CORPO_403 = { erro: 'sem_papel_admin', mensagem: 'Operação requer papel de Admin.' };

  it('a mensagem na tela é para a pessoa, não o slug nem a frase do sistema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify(CORPO_403), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    render(
      <BotaoExportarExcel url="/api/estoque/export?tipo=movimentacoes" arquivoFallback="mov" />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exportar Excel' }));

    const alerta = await waitFor(() => screen.getByRole('alert'));
    expect(alerta.textContent).toMatch(/perfil não tem acesso/i);
    expect(alerta.textContent).toMatch(/administrador/i);
    // Enum nunca vira texto de tela, e "Operação requer papel de Admin." é a
    // linguagem do sistema: não diz à pessoa o que fazer.
    expect(alerta.textContent).not.toMatch(/sem_papel_admin/);
    expect(alerta.textContent).not.toMatch(/requer papel de Admin/);
    expect(alerta.textContent).not.toMatch(/HTTP 403/);

    vi.unstubAllGlobals();
  });
});
