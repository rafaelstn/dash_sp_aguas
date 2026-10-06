/**
 * A matrícula do solicitante DIGITADA, no diálogo de movimentação (06/10/2026).
 *
 * A lógica pura já tem caso próprio em `movimentacao-solicitante.test.ts`; aqui
 * se mede o que a pessoa vê e o que sai para a API quando ela usa o produto:
 * o campo existe na saída, o nome digitado é recusado com o motivo, e o valor
 * válido chega ao `registrarMovimentacao` EXATAMENTE como ela escreveu.
 *
 * O caso que importa é o do balcão: quem atende digita o NOME de quem pediu. O
 * espaço em branco é a única coisa que hoje separa matrícula de nome, então a
 * recusa precisa dizer isso em texto, e a tela precisa bloquear ANTES do envio
 * (`registrarMovimentacao` não pode ser chamado), senão o produto só devolve o
 * 400 do servidor sem explicação.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocalDTO } from '@/components/features/estoque/dtos';

const registrarMovimentacao = vi.fn();
vi.mock('@/components/features/estoque/api', () => ({
  registrarMovimentacao: (...args: unknown[]) => registrarMovimentacao(...args),
}));

const { MovimentacaoDialog } = await import(
  '@/components/features/estoque/MovimentacaoDialog'
);
type AlvoMovimentacao = Parameters<typeof MovimentacaoDialog>[0]['alvo'];

const UNIDADE_ID = '11111111-1111-1111-1111-111111111111';
const LOCAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOCAL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/**
 * Tipado como o DTO REAL de propósito: com literal solto, um campo novo em
 * `LocalDTO` entraria sem o `tsc` nomear esta fixture, e fixture que não
 * acompanha o contrato envelhece calada.
 */
const LOCAIS: readonly LocalDTO[] = [
  {
    id: LOCAL_A,
    unidade: 'PENHA',
    sala: null,
    prateleira: null,
    armario: null,
    rotulo: 'Almoxarifado Penha',
    observacao: null,
    criadoEm: '2026-01-01T00:00:00.000Z',
  },
  {
    id: LOCAL_B,
    unidade: 'ARARAQUARA',
    sala: null,
    prateleira: null,
    armario: null,
    rotulo: 'Campo Araraquara',
    observacao: null,
    criadoEm: '2026-01-01T00:00:00.000Z',
  },
];

const ALVO = {
  natureza: 'serializado',
  unidadeId: UNIDADE_ID,
  descricao: 'Notebook Dell 7420 — patrimônio 00412',
  localAtualId: LOCAL_A,
} satisfies NonNullable<AlvoMovimentacao>;

function montar() {
  const aoConcluir = vi.fn();
  render(
    <MovimentacaoDialog
      aberto
      alvo={ALVO}
      locais={LOCAIS}
      aoFechar={vi.fn()}
      aoConcluir={aoConcluir}
    />,
  );
  return { aoConcluir, usuario: userEvent.setup() };
}

/** Escolhe o tipo pelo rótulo visível, como quem usa a tela faria. */
async function escolherTipo(usuario: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await usuario.selectOptions(
    screen.getByLabelText('Tipo de movimentação'),
    screen.getByRole('option', { name: rotulo }),
  );
}

function campoMatricula(): HTMLInputElement {
  return screen.getByLabelText('Matrícula de quem solicitou') as HTMLInputElement;
}

function botaoRegistrar(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Registrar movimentação' }) as HTMLButtonElement;
}

beforeEach(() => {
  registrarMovimentacao.mockReset();
  registrarMovimentacao.mockResolvedValue({ movimentacao: { id: 'x' }, saldo: null });
});

describe('o campo de matrícula aparece e se explica', () => {
  it('a saída pede a matrícula, e o rótulo deixa claro que não é o nome', async () => {
    const { usuario } = montar();
    await escolherTipo(usuario, 'Saída');

    const campo = campoMatricula();
    expect(campo).toBeInTheDocument();
    // A pessoa precisa saber o que digitar ANTES de errar: a descrição do campo
    // nomeia a matrícula e nega o nome.
    const descricao = campo.getAttribute('aria-describedby');
    expect(descricao, 'o campo precisa ter descrição acessível').toBeTruthy();
    const textoDaDescricao = descricao!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(textoDaDescricao).toMatch(/matr[íi]cula/i);
    expect(textoDaDescricao).toMatch(/n[ãa]o é o nome/i);
  });

  it('a transferência não mostra o campo: não existe solicitante nela', async () => {
    const { usuario } = montar();
    await escolherTipo(usuario, 'Saída');
    expect(campoMatricula()).toBeInTheDocument();

    await escolherTipo(usuario, 'Transferência');
    expect(screen.queryByLabelText('Matrícula de quem solicitou')).toBeNull();
  });
});

describe('digitar o nome em vez da matrícula', () => {
  it('recusa na tela, explica o motivo e NÃO chama a API', async () => {
    const { usuario } = montar();
    await escolherTipo(usuario, 'Saída');
    await usuario.type(campoMatricula(), 'Maria da Silva');
    await usuario.click(botaoRegistrar());

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/espa[çc]o/i);
    expect(alerta.textContent).toMatch(/n[ãa]o é o nome/i);
    expect(campoMatricula()).toHaveAttribute('aria-invalid', 'true');
    // O bloqueio na tela existe para a pessoa receber o motivo, e não o 400 mudo.
    expect(registrarMovimentacao).not.toHaveBeenCalled();
    // E o que ela digitou continua no campo: nada de trim silencioso.
    expect(campoMatricula().value).toBe('Maria da Silva');
  });
});

describe('matrícula válida', () => {
  it('vai para a API exatamente como digitada, junto do resto da saída', async () => {
    const { usuario, aoConcluir } = montar();
    await escolherTipo(usuario, 'Saída');
    await usuario.type(campoMatricula(), '482913');
    await usuario.click(botaoRegistrar());

    await waitFor(() => expect(registrarMovimentacao).toHaveBeenCalledTimes(1));
    expect(registrarMovimentacao).toHaveBeenCalledWith({
      tipo: 'saida',
      unidadeId: UNIDADE_ID,
      localOrigem: LOCAL_A,
      solicitanteMatricula: '482913',
    });
    await waitFor(() => expect(aoConcluir).toHaveBeenCalledTimes(1));
  });

  it('a transferência sai sem a chave, mesmo depois de a matrícula ter sido digitada', async () => {
    const { usuario } = montar();
    await escolherTipo(usuario, 'Saída');
    await usuario.type(campoMatricula(), '482913');
    // Troca de tipo depois de digitar: o identificador não tem finalidade na
    // transferência, e o zod da rota nem declara a chave nesse ramo.
    await escolherTipo(usuario, 'Transferência');
    // Por valor, e não pelo nome da opção: origem e destino listam os MESMOS
    // locais, e o rótulo casaria em dois selects.
    await usuario.selectOptions(screen.getByLabelText('Local de destino'), LOCAL_B);
    await usuario.click(botaoRegistrar());

    await waitFor(() => expect(registrarMovimentacao).toHaveBeenCalledTimes(1));
    const payload = registrarMovimentacao.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.tipo).toBe('transferencia');
    expect(payload).not.toHaveProperty('solicitanteMatricula');
  });
});

describe('o foco não se perde no envio', () => {
  it('continua no botão de registrar enquanto a requisição está em voo', async () => {
    // `disabled` tira o botão da ordem de foco e o navegador joga o foco no
    // BODY, de onde ele não volta (padrão da casa: aria-disabled + bloqueio no
    // handler). Mede-se o EFEITO, com o MESMO nó.
    // Nasce como funcao, e nao como `null`: com `(() => void) | null` o `tsc`
    // nao enxerga a atribuicao dentro do callback e recusa a chamada (TS2349).
    let liberar: () => void = () => {};
    registrarMovimentacao.mockImplementation(
      () => new Promise<void>((resolve) => { liberar = resolve; }),
    );

    const { usuario } = montar();
    await escolherTipo(usuario, 'Saída');
    await usuario.type(campoMatricula(), '482913');

    const botao = botaoRegistrar();
    botao.focus();
    expect(document.activeElement).toBe(botao);
    await usuario.click(botao);

    await waitFor(() => expect(botao).toHaveAttribute('aria-disabled', 'true'));
    expect(document.activeElement).toBe(botao);
    expect(document.activeElement).not.toBe(document.body);
    liberar();
  });
});
