/**
 * Movimentacao = registro do ledger / trilha de auditoria. Tipo puro, espelha a
 * tabela `estoque_movimentacoes` (migration 0059). Aqui tambem vivem as regras
 * PURAS da movimentacao: resolucao do alvo (XOR) e validacao estrutural do
 * comando por tipo. A validacao que depende do estado no banco (transicao de
 * status, saldo nao-negativo) roda dentro da transacao no repositorio.
 */

import type { Estado } from './estado';
import type { Status } from './status-unidade';
import type { Saldo } from './saldo';
import type { Unidade } from './unidade';
import { AlvoMovimentacaoInvalido, MovimentacaoInvalida } from '../errors';

export type TipoMovimentacao =
  | 'entrada'
  | 'saida'
  | 'transferencia'
  | 'baixa'
  | 'ajuste';

export const TIPOS_MOVIMENTACAO: readonly TipoMovimentacao[] = Object.freeze([
  'entrada',
  'saida',
  'transferencia',
  'baixa',
  'ajuste',
]);

export function ehTipoMovimentacao(valor: unknown): valor is TipoMovimentacao {
  return (
    valor === 'entrada' ||
    valor === 'saida' ||
    valor === 'transferencia' ||
    valor === 'baixa' ||
    valor === 'ajuste'
  );
}

/**
 * Alvo da movimentacao: serializado (unidade) XOR quantificavel (material).
 * A natureza e derivada de qual identificador veio.
 */
export type AlvoMovimentacao =
  | { natureza: 'serializado'; unidadeId: string }
  | { natureza: 'quantificavel'; materialId: string };

export interface Movimentacao {
  id: string;
  tipo: TipoMovimentacao;
  unidadeId: string | null;
  materialId: string | null;
  quantidade: number;
  localOrigemId: string | null;
  localDestinoId: string | null;
  estadoAnterior: Estado | null;
  estadoNovo: Estado | null;
  statusAnterior: Status | null;
  statusNovo: Status | null;
  motivo: string | null;
  usuarioId: string;
  criadoEm: Date;
}

/**
 * Comando normalizado passado ao repositorio `registrar` (ja resolvido o alvo e
 * validada a estrutura). O repositorio executa a transacao atomica.
 */
export interface ComandoMovimentacao {
  tipo: TipoMovimentacao;
  alvo: AlvoMovimentacao;
  quantidade: number;
  localOrigemId: string | null;
  localDestinoId: string | null;
  /** Bucket de tamanho do quantificavel (ex. bitola de cabo). null = sem tamanho. */
  tamanho: string | null;
  motivo: string | null;
  /** Ajuste de serializado: novo estado (undefined = nao mexer; null = limpar). */
  novoEstado?: Estado | null;
  /** Ajuste de serializado: novo status (undefined = nao mexer). Status nunca e null. */
  novoStatus?: Status;
  usuarioId: string;
}

/** Resultado da movimentacao: o registro do ledger + o efeito colateral. */
export interface ResultadoMovimentacao {
  movimentacao: Movimentacao;
  /** Preenchido para quantificavel (saldo resultante). */
  saldo: Saldo | null;
  /** Preenchido para serializado (unidade resultante). */
  unidade: Unidade | null;
}

/** Filtros da trilha (GET movimentacoes). Combinados com AND. */
export interface FiltrosMovimentacao {
  tipo?: TipoMovimentacao;
  unidadeId?: string;
  materialId?: string;
  /** Filtra por local (origem OU destino). */
  localId?: string;
  usuarioId?: string;
  de?: Date;
  ate?: Date;
  pagina?: number;
  porPagina?: number;
}

/**
 * Resolve o alvo a partir de identificadores opcionais, garantindo o XOR
 * (exatamente um). Funcao pura; lanca `AlvoMovimentacaoInvalido` (400) se vier
 * nenhum ou ambos.
 */
export function resolverAlvo(entrada: {
  unidadeId?: string | null;
  materialId?: string | null;
}): AlvoMovimentacao {
  const temUnidade = Boolean(entrada.unidadeId);
  const temMaterial = Boolean(entrada.materialId);
  if (temUnidade === temMaterial) {
    throw new AlvoMovimentacaoInvalido(
      'Informe exatamente um alvo: unidadeId (serializado) ou materialId (quantificavel).',
    );
  }
  return temUnidade
    ? { natureza: 'serializado', unidadeId: entrada.unidadeId as string }
    : { natureza: 'quantificavel', materialId: entrada.materialId as string };
}

/** Comando bruto (pos-zod, pre-normalizacao) para validacao estrutural. */
export interface EntradaMovimentacao {
  tipo: TipoMovimentacao;
  alvo: AlvoMovimentacao;
  quantidade: number;
  localOrigemId: string | null;
  localDestinoId: string | null;
  tamanho: string | null;
  motivo: string | null;
  novoEstado?: Estado | null;
  novoStatus?: Status;
}

/**
 * Valida as regras ESTRUTURAIS da movimentacao (as que nao dependem do estado no
 * banco). Lanca `MovimentacaoInvalida` (400) com motivo. Funcao pura.
 *
 * Regras:
 *  - serializado: quantidade sempre 1.
 *  - entrada: exige localDestino.
 *  - saida/baixa quantificavel: exige localOrigem.
 *  - transferencia: exige localOrigem e localDestino distintos.
 *  - baixa e ajuste: exigem motivo (>= 3 chars, ja garantido no zod, revalidado aqui).
 *  - ajuste so se aplica a serializado (correcao de estado/status/local). Para
 *    quantificavel a correcao de quantidade e feita por entrada/saida/baixa.
 *  - ajuste serializado: exige ao menos uma mudanca (estado, status ou local).
 */
export function validarComandoEstrutural(cmd: EntradaMovimentacao): void {
  const serializado = cmd.alvo.natureza === 'serializado';

  if (!Number.isInteger(cmd.quantidade) || cmd.quantidade < 1) {
    throw new MovimentacaoInvalida('quantidade deve ser inteiro >= 1.');
  }
  if (serializado && cmd.quantidade !== 1) {
    throw new MovimentacaoInvalida('movimentacao de serializado tem quantidade 1.');
  }

  switch (cmd.tipo) {
    case 'entrada':
      if (!cmd.localDestinoId) {
        throw new MovimentacaoInvalida('entrada exige localDestino.');
      }
      break;
    case 'saida':
      if (!cmd.localOrigemId) {
        throw new MovimentacaoInvalida('saida exige localOrigem.');
      }
      break;
    case 'transferencia':
      if (!cmd.localOrigemId || !cmd.localDestinoId) {
        throw new MovimentacaoInvalida('transferencia exige localOrigem e localDestino.');
      }
      if (cmd.localOrigemId === cmd.localDestinoId) {
        throw new MovimentacaoInvalida('transferencia exige origem e destino distintos.');
      }
      break;
    case 'baixa':
      if (!cmd.motivo || cmd.motivo.trim().length < 3) {
        throw new MovimentacaoInvalida('baixa exige motivo (>= 3 caracteres).');
      }
      if (!serializado && !cmd.localOrigemId) {
        throw new MovimentacaoInvalida('baixa de quantificavel exige localOrigem.');
      }
      break;
    case 'ajuste':
      if (!serializado) {
        throw new MovimentacaoInvalida(
          'ajuste aplica-se a itens serializados; para quantificavel use entrada/saida/baixa.',
        );
      }
      if (!cmd.motivo || cmd.motivo.trim().length < 3) {
        throw new MovimentacaoInvalida('ajuste exige motivo (>= 3 caracteres).');
      }
      if (
        cmd.novoEstado === undefined &&
        cmd.novoStatus === undefined &&
        !cmd.localDestinoId
      ) {
        throw new MovimentacaoInvalida(
          'ajuste exige ao menos uma mudanca: estado, status ou local.',
        );
      }
      break;
  }
}
