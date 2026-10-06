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
 * Formato aceito na matrícula do solicitante: 2 a 30 caracteres e NENHUM espaço
 * em branco. Fonte ÚNICA da regra: o zod da rota deriva daqui, e o CHECK
 * ck_estoque_mov_matricula_formato da migration 0075 usa o equivalente POSIX
 * `^[^[:space:]]{2,30}$`. Duas listas escritas à mão divergem.
 *
 * O espaço é justamente o que separa matrícula de nome digitado, e nome livre é
 * o que a revisão de 06/10/2026 recusou (nome não identifica pessoa e vira dado
 * pessoal sem finalidade).
 *
 * A MÁSCARA REAL DA MATRÍCULA DO ÓRGÃO NÃO FOI MEDIDA: quantos dígitos, se tem
 * prefixo, se tem dígito verificador. Esta guarda é mínima de propósito e só
 * pode ENDURECER depois da resposta do órgão; endurecer antes recusaria
 * matrícula legítima no balcão.
 *
 * `\S` do JavaScript é um pouco MAIS estrito que `[:space:]` do Postgres (exclui
 * também espaço sem quebra e outros espaços Unicode). A divergência é na direção
 * segura: a aplicação valida antes de gravar, e o CHECK do banco é o piso.
 */
export const MATRICULA_SOLICITANTE_MIN = 2;
export const MATRICULA_SOLICITANTE_MAX = 30;
export const MATRICULA_SOLICITANTE_REGEX = /^\S{2,30}$/;

/**
 * Mensagem única de recusa da matrícula. NÃO interpola o valor recebido: valor
 * de campo em mensagem de erro acaba no log pelo ramo genérico de
 * `src/app/api/_helpers/erros.ts`, que registra `erro: String(erro)`.
 */
export const MATRICULA_SOLICITANTE_MENSAGEM =
  'solicitanteMatricula deve ser a matrícula ou identificação funcional de quem solicitou: ' +
  'de 2 a 30 caracteres, sem espaço. O campo é matrícula, não o nome da pessoa.';

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
  /**
   * Preenchido quando a movimentacao foi gerada por reconciliacao de conferencia
   * (coluna `conferencia_id`, migration 0064). null nas movimentacoes normais.
   */
  conferenciaId: string | null;
  /**
   * Matricula de QUEM SOLICITOU a saida (coluna `solicitante_matricula`, 0075).
   * Identificador, nunca nome. Preenchido na saida feita no balcao; null nos
   * outros tipos e na saida gerada por reconciliacao de conferencia, que nao tem
   * solicitante humano.
   */
  solicitanteMatricula: string | null;
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
  /**
   * Matricula de quem solicitou a saida (0075). OBRIGATORIO no tipo, e nao
   * opcional, de proposito: assim o `tsc` nomeia TODO caminho que grava no ledger
   * e obriga cada um a decidir o valor. Quem nao tem solicitante passa null
   * explicito (reconciliacao de conferencia, entrada, transferencia, baixa,
   * ajuste).
   */
  solicitanteMatricula: string | null;
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

/**
 * Contexto da gravacao, ao lado do comando: o que NAO vem do corpo da
 * requisicao e muda a regra. Hoje so a conferencia.
 *
 * Por que separado do comando: `conferenciaId` nao e campo que o cliente manda,
 * e sim carimbo de quem chama (`aplicarMovimentacaoNaTx(tx, cmd, conferenciaId)`
 * desde a 0064). Colocar no `ComandoMovimentacao` abriria caminho para a rota
 * publica mandar um id de conferencia e escapar da exigencia de solicitante.
 */
export interface ContextoMovimentacao {
  /**
   * Id da conferencia que gerou a movimentacao (0064), ou null na movimentacao
   * normal. Espelha a coluna `conferencia_id`, que e a UNICA isencao do CHECK
   * ck_estoque_mov_saida_solicitante (0075).
   */
  conferenciaId: string | null;
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
  /** Matricula de quem solicitou a saida (0075). null quando nao ha solicitante. */
  solicitanteMatricula: string | null;
}

/**
 * Valida as regras ESTRUTURAIS da movimentacao (as que nao dependem do estado no
 * banco). Lanca `MovimentacaoInvalida` (400) com motivo. Funcao pura.
 *
 * Regras:
 *  - serializado: quantidade sempre 1.
 *  - entrada: exige localDestino.
 *  - saida/baixa quantificavel: exige localOrigem.
 *  - saida: exige solicitanteMatricula (quem pediu o material), no formato de
 *    identificador. Espelha o CHECK ck_estoque_mov_saida_solicitante da 0075,
 *    INCLUSIVE a isencao `conferencia_id IS NOT NULL`, que entra por
 *    `contexto.conferenciaId`: saida gerada por reconciliacao de conferencia
 *    ajusta inventario e nao tem solicitante humano.
 *    Sintoma que obrigou o parametro (medido em 06/10/2026, suite completa): sem
 *    ele, reconciliar divergencia negativa estourava
 *    `MovimentacaoInvalida: solicitanteMatricula deve ser a matricula ...` em
 *    `tests/unit/application/estoque-conferencia.test.ts`, porque os DOIS
 *    repositorios de conferencia chamam esta funcao (mock linha 447, pg linha
 *    790) e o id da conferencia viajava separado do comando. A versao anterior
 *    deste docblock afirmava que a reconciliacao nao passava por aqui: era
 *    suposicao minha, refutada pela pilha do teste.
 *    O default e `conferenciaId: null`, fail-closed: quem nao informa contexto
 *    cai na regra estrita e precisa de matricula.
 *  - matricula, em qualquer tipo: se vier valor, respeita o formato (o formato
 *    NAO tem isencao por conferencia: a reconciliacao manda null, nunca valor
 *    torto).
 *  - transferencia: exige localOrigem e localDestino distintos.
 *  - baixa e ajuste: exigem motivo (>= 3 chars, ja garantido no zod, revalidado aqui).
 *  - ajuste so se aplica a serializado (correcao de estado/status/local). Para
 *    quantificavel a correcao de quantidade e feita por entrada/saida/baixa.
 *  - ajuste serializado: exige ao menos uma mudanca (estado, status ou local).
 */
export function validarComandoEstrutural(
  cmd: EntradaMovimentacao,
  contexto: ContextoMovimentacao = { conferenciaId: null },
): void {
  const serializado = cmd.alvo.natureza === 'serializado';

  if (!Number.isInteger(cmd.quantidade) || cmd.quantidade < 1) {
    throw new MovimentacaoInvalida('quantidade deve ser inteiro >= 1.');
  }
  if (serializado && cmd.quantidade !== 1) {
    throw new MovimentacaoInvalida('movimentacao de serializado tem quantidade 1.');
  }

  // Formato vale para QUALQUER tipo que mande valor, e nao so para a saida: o
  // CHECK ck_estoque_mov_matricula_formato (0075) tambem e por valor, e a
  // aplicacao recusa antes de chegar ao banco, que e o piso e nao o lugar onde o
  // usuario descobre o erro. A mensagem NAO interpola o valor recebido.
  if (
    cmd.solicitanteMatricula !== null &&
    !MATRICULA_SOLICITANTE_REGEX.test(cmd.solicitanteMatricula)
  ) {
    throw new MovimentacaoInvalida(MATRICULA_SOLICITANTE_MENSAGEM);
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
      // Mesma forma do CHECK ck_estoque_mov_saida_solicitante (0075):
      // `tipo <> 'saida' OR conferencia_id IS NOT NULL OR
      //  solicitante_matricula IS NOT NULL`. A isencao e SEMANTICA (quem gerou a
      // saida), nunca temporal: nao existe isencao por data em nenhuma das duas
      // camadas.
      if (cmd.solicitanteMatricula === null && contexto.conferenciaId === null) {
        throw new MovimentacaoInvalida(MATRICULA_SOLICITANTE_MENSAGEM);
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
