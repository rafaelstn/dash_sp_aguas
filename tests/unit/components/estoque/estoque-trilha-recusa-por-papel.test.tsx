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
import { ErroEstoque } from '@/components/features/estoque/erros';
import type {
  DetalheUnidadeDTO,
  MaterialDTO,
  MovimentacaoTrilhaDTO,
  SaldoContextoDTO,
  UnidadeDTO,
} from '@/components/features/estoque/dtos';

/**
 * So as quatro leituras que os drawers fazem sao dubladas; o resto do modulo de
 * API continua o real, para o `urlExportarMovimentacoes` que eles usam nao virar
 * dubla silenciosa.
 */
const obterUnidade = vi.fn();
const obterMaterial = vi.fn();
const listarSaldos = vi.fn();
const listarMovimentacoes = vi.fn();
vi.mock('@/components/features/estoque/api', async (importarOriginal) => ({
  ...(await importarOriginal<Record<string, unknown>>()),
  obterUnidade: (...args: unknown[]) => obterUnidade(...args),
  obterMaterial: (...args: unknown[]) => obterMaterial(...args),
  listarSaldos: (...args: unknown[]) => listarSaldos(...args),
  listarMovimentacoes: (...args: unknown[]) => listarMovimentacoes(...args),
}));
const { UnidadeDetalhe } = await import('@/components/features/estoque/UnidadeDetalhe');
const { MaterialDetalhe } = await import('@/components/features/estoque/MaterialDetalhe');

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

const MATERIAL: MaterialDTO = {
  id: '22222222-2222-2222-2222-222222222222',
  descricao: 'Luva de raspa cano curto',
  marca: 'Volk',
  modelo: null,
  natureza: 'quantificavel',
  unidadeMedida: 'par',
  categoriaId: null,
  quantidadeMinima: null,
  ativo: true,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
};

const SALDO: SaldoContextoDTO = {
  id: '44444444-4444-4444-4444-444444444444',
  materialId: MATERIAL.id,
  localId: LOCAL_A,
  quantidade: 37,
  tamanho: null,
  atualizadoEm: '2026-10-01T00:00:00.000Z',
  materialDescricao: MATERIAL.descricao,
  localRotulo: 'Almoxarifado Penha',
  unidade: 'PENHA',
};

/** Corpo que `GET /api/estoque/movimentacoes` devolve a papel `user`. */
function recusaDaTrilha(): ErroEstoque {
  return new ErroEstoque(
    'Seu perfil não tem acesso a esta ação do estoque. Peça o perfil de gestão do estoque a um administrador.',
    'sem_papel_admin',
    403,
  );
}

/**
 * O drawer do material quantificavel, onde a trilha NAO vem no mesmo envelope.
 *
 * Aqui a listagem da trilha e uma rota propria que responde 403, entao nao
 * existe `historicoVisivel` vindo do servidor: quem decide a tela e a RESPOSTA
 * daquela chamada. O `podeGerenciar` continua servindo de otimizacao (nao pedir
 * o que vai ser recusado), e o caso central e justamente o palpite ERRADO, que
 * e a situacao que o papel defasado no navegador, ou a mudanca do critario no
 * backend, produzem sem ninguem mexer na tela.
 */
describe('o drawer do material quando o palpite do cliente erra', () => {
  function montarDrawer(podeGerenciar: boolean) {
    render(
      <MaterialDetalhe
        materialId={MATERIAL.id}
        versao={0}
        podeGerenciar={podeGerenciar}
        nomeCategoria={() => '—'}
        nomeLocal={nomeLocal}
        aoFechar={vi.fn()}
        aoMovimentar={vi.fn()}
        aoEditar={vi.fn()}
        aoExcluir={vi.fn()}
      />,
    );
  }

  function dublarLeituras() {
    for (const d of [obterMaterial, listarSaldos, listarMovimentacoes]) d.mockReset();
    obterMaterial.mockResolvedValue(MATERIAL);
    listarSaldos.mockResolvedValue({ itens: [SALDO], total: 1 });
  }

  it('palpite true com 403 na trilha: o drawer fica de pé e a trilha diz que é restrita', async () => {
    dublarLeituras();
    listarMovimentacoes.mockRejectedValue(recusaDaTrilha());
    montarDrawer(true);

    // O que a pessoa TEM direito de ver continua na tela: catálogo e saldo.
    expect(await screen.findByText('Luva de raspa cano curto')).toBeInTheDocument();
    // Duas ocorrências com um único saldo: o total agrupado e a linha do local.
    expect(screen.getAllByText('37')).toHaveLength(2);
    expect(screen.getByText('Almoxarifado Penha')).toBeInTheDocument();
    // E a trilha diz o motivo certo, nem erro nem ausência.
    expect(screen.getByText('Trilha restrita à gestão do estoque')).toBeInTheDocument();
    expect(screen.queryByText('Sem movimentação registrada')).toBeNull();
    expect(screen.queryByText('Erro ao carregar')).toBeNull();
    expect(screen.queryByRole('button', { name: /Exportar movimentações/i })).toBeNull();
  });

  it('o catch é estreito: falha que não é de permissão não vira "restrita"', async () => {
    dublarLeituras();
    listarMovimentacoes.mockRejectedValue(
      new ErroEstoque('Falha ao processar a solicitação.', 'http_500', 500),
    );
    montarDrawer(true);

    // Âncora de PRESENÇA antes de afirmar ausência, senão a asserção passa no
    // primeiro tick, com o skeleton ainda na tela, e um `catch` largo (que
    // engolisse 5xx como recusa) sobreviveria à régua. Medido: foi exatamente
    // isso que aconteceu na primeira versão deste caso.
    // Os dois alvos cobrem os dois desenhos possíveis do 5xx (derrubar o
    // drawer ou isolar a trilha), porque o que a régua defende não é o lugar
    // da mensagem: é que falha de infraestrutura não seja contada como recusa
    // de permissão nem como ausência de evento.
    await waitFor(() => {
      expect(
        screen.queryByText('Erro ao carregar') ?? screen.queryByText('Luva de raspa cano curto'),
      ).not.toBeNull();
    });
    expect(screen.queryByText('Trilha restrita à gestão do estoque')).toBeNull();
    expect(screen.queryByText('Sem movimentação registrada')).toBeNull();
  });

  it('gestor de verdade lê os eventos e tem o export', async () => {
    dublarLeituras();
    listarMovimentacoes.mockResolvedValue({ itens: [SAIDA], total: 1 });
    montarDrawer(true);

    expect(await screen.findByText('482913')).toBeInTheDocument();
    expect(screen.queryByText('Trilha restrita à gestão do estoque')).toBeNull();
    expect(screen.getByRole('button', { name: /Exportar movimentações/i })).toBeInTheDocument();
  });

  it('leitura simples: a trilha nem é pedida, e a tela diz restrita', async () => {
    dublarLeituras();
    listarMovimentacoes.mockResolvedValue({ itens: [SAIDA], total: 1 });
    montarDrawer(false);

    expect(await screen.findByText('Luva de raspa cano curto')).toBeInTheDocument();
    expect(screen.getByText('Trilha restrita à gestão do estoque')).toBeInTheDocument();
    // A otimização é o que evita o 403 inútil: sem papel, a chamada não sai.
    expect(listarMovimentacoes).not.toHaveBeenCalled();
  });
});
