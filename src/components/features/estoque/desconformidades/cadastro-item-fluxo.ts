/**
 * Fluxo do "Cadastrar item" a partir de uma desconformidade `item_sem_descricao`,
 * sem JSX nem `fetch`: a I/O entra por `DepsCadastro`, e o teste troca as três
 * chamadas por dublês e confere o EFEITO (quantas unidades foram criadas, com
 * qual `unidadeId` a pendência foi marcada).
 *
 * A regra que este módulo existe para garantir: uma desconformidade nunca gera
 * duas unidades. Três caminhos levam a isso:
 *  1. a unidade criada é entregue a `aoCriar` ANTES de marcar a pendência, e
 *     quem chama guarda o vínculo fora do diálogo;
 *  2. com vínculo guardado, salvar de novo só repete a marcação;
 *  3. com a página recarregada (vínculo perdido), o 409 `codigo_duplicado` do
 *     servidor vira a oferta de vincular ao item que já tem aquele código.
 */

import type { UpsertUnidade } from '@/domain/estoque/unidade';
import type { AtualizarDesconformidadeUI, DesconformidadeDTO, UnidadeDTO } from '../dtos';
import { ErroEstoque, textoDeErro } from '../erros';
import { NOTA_CADASTRO, campoInvalidoCadastro, type ValoresCadastroItem } from './desconformidades-ui';

export const CODIGO_DUPLICADO = 'codigo_duplicado';
export const DESCONFORMIDADE_ALTERADA = 'desconformidade_alterada';
export const UNIDADE_NAO_ENCONTRADA = 'unidade_nao_encontrada';

export const MENSAGEM_ALTERADA =
  'Outra pessoa alterou esta desconformidade antes de você salvar. A lista foi atualizada; confira a situação atual.';

export interface UnidadeVinculada {
  id: string;
  descricao: string;
  codigo: string | null;
  /** `criada` por esta tela; `existente` quando o código já estava cadastrado. */
  origem: 'criada' | 'existente';
}

type UnidadeResumo = Pick<UnidadeDTO, 'id' | 'descricao' | 'codigo'>;

export interface DepsCadastro {
  criarUnidade: (dados: UpsertUnidade) => Promise<UnidadeResumo>;
  /** Unidades com o código exato (sem diferenciar maiúscula). */
  buscarPorCodigo: (codigo: string) => Promise<readonly UnidadeResumo[]>;
  atualizarDesconformidade: (id: string, dados: AtualizarDesconformidadeUI) => Promise<unknown>;
  /** Recebe a unidade assim que ela existe, antes da marcação. */
  aoCriar: (unidade: UnidadeVinculada) => void;
  /**
   * A unidade do vínculo não existe mais no servidor (excluída depois de
   * criada): quem chama esquece o vínculo, senão cada envio repete o 404.
   */
  aoPerderVinculo: () => void;
}

export interface EntradaCadastro {
  desconformidade: Pick<DesconformidadeDTO, 'id' | 'status'>;
  valores: ValoresCadastroItem;
  localId: string;
  /** Unidade já ligada a esta pendência (criada antes ou existente escolhida). */
  vinculo: UnidadeVinculada | null;
}

export type ResultadoCadastro =
  | { tipo: 'resolvida'; unidade: UnidadeVinculada; mensagem: string }
  | { tipo: 'invalido'; campo: keyof ValoresCadastroItem; mensagem: string }
  | { tipo: 'vinculoPerdido'; mensagem: string }
  | { tipo: 'falhaCriacao'; mensagem: string }
  | { tipo: 'codigoDuplicado'; existente: UnidadeVinculada | null; mensagem: string }
  | { tipo: 'falhaMarcacao'; unidade: UnidadeVinculada; mensagem: string }
  | { tipo: 'alterada'; unidade: UnidadeVinculada; mensagem: string };

const vazioParaNull = (s: string) => {
  const t = s.trim();
  return t === '' ? null : t;
};

/** O código digitado ainda é o do item oferecido? (o servidor compara sem caixa) */
export function mesmoCodigo(a: string | null, b: string | null): boolean {
  const x = (a ?? '').trim().toLowerCase();
  const y = (b ?? '').trim().toLowerCase();
  return x !== '' && x === y;
}

async function procurarExistente(
  codigo: string,
  deps: DepsCadastro,
): Promise<UnidadeVinculada | null> {
  try {
    const achadas = (await deps.buscarPorCodigo(codigo)).filter((u) => mesmoCodigo(u.codigo, codigo));
    if (achadas.length !== 1) return null;
    const u = achadas[0]!;
    return { id: u.id, descricao: u.descricao, codigo: u.codigo, origem: 'existente' };
  } catch {
    return null;
  }
}

export async function cadastrarEResolver(
  entrada: EntradaCadastro,
  deps: DepsCadastro,
): Promise<ResultadoCadastro> {
  const { desconformidade, valores, localId } = entrada;
  let unidade = entrada.vinculo;

  if (!unidade) {
    const invalido = campoInvalidoCadastro(valores);
    if (invalido) return { tipo: 'invalido', ...invalido };
    const codigo = vazioParaNull(valores.codigo);
    try {
      const nova = await deps.criarUnidade({
        descricao: valores.descricao.trim(),
        codigo,
        marca: vazioParaNull(valores.marca),
        modelo: vazioParaNull(valores.modelo),
        numeroSerie: vazioParaNull(valores.numeroSerie),
        patDaee: vazioParaNull(valores.patDaee),
        localId: localId || null,
        status: 'ativo',
      });
      unidade = { id: nova.id, descricao: nova.descricao, codigo: nova.codigo, origem: 'criada' };
      deps.aoCriar(unidade);
    } catch (e) {
      if (e instanceof ErroEstoque && e.codigo === CODIGO_DUPLICADO && codigo) {
        const existente = await procurarExistente(codigo, deps);
        return {
          tipo: 'codigoDuplicado',
          existente,
          mensagem: existente
            ? `Já existe um item com o código ${codigo}: "${existente.descricao}". Vincule esta desconformidade a ele ou corrija o código da etiqueta.`
            : `${textoDeErro(e, 'Já existe um item com este código.')} Corrija o código da etiqueta.`,
        };
      }
      return {
        tipo: 'falhaCriacao',
        mensagem: textoDeErro(e, 'Não foi possível cadastrar o item. Tente novamente.'),
      };
    }
  }

  try {
    await deps.atualizarDesconformidade(desconformidade.id, {
      status: 'resolvida',
      nota: NOTA_CADASTRO,
      unidadeId: unidade.id,
      statusEsperado: desconformidade.status,
    });
  } catch (e) {
    if (e instanceof ErroEstoque && e.codigo === UNIDADE_NAO_ENCONTRADA) {
      deps.aoPerderVinculo();
      return {
        tipo: 'vinculoPerdido',
        mensagem: `O item "${unidade.descricao}" ligado a esta desconformidade não existe mais, então confira os dados e cadastre de novo.`,
      };
    }
    if (e instanceof ErroEstoque && e.codigo === DESCONFORMIDADE_ALTERADA) {
      // A unidade criada fica sem vínculo e não é apagada: a mensagem dá ao
      // gestor o código e a descrição para achá-la em Serializados.
      const identificacao = unidade.codigo
        ? `"${unidade.descricao}" (código ${unidade.codigo})`
        : `"${unidade.descricao}" (sem código)`;
      return {
        tipo: 'alterada',
        unidade,
        mensagem:
          unidade.origem === 'criada'
            ? `O item ${identificacao} foi cadastrado, mas outra pessoa alterou esta desconformidade antes de você salvar e ele ficou sem vínculo com ela. A lista foi atualizada; confira a situação atual e localize o item em Serializados.`
            : MENSAGEM_ALTERADA,
      };
    }
    const motivo = textoDeErro(e, 'Falha ao marcar como resolvida.');
    return {
      tipo: 'falhaMarcacao',
      unidade,
      mensagem:
        unidade.origem === 'criada'
          ? `O item "${unidade.descricao}" foi cadastrado, mas a desconformidade continua aberta. Motivo: ${motivo} Salve de novo para marcar como resolvida.`
          : `A desconformidade continua aberta e não foi vinculada ao item "${unidade.descricao}". Motivo: ${motivo} Tente de novo.`,
    };
  }

  return {
    tipo: 'resolvida',
    unidade,
    mensagem:
      unidade.origem === 'criada'
        ? `Item "${unidade.descricao}" cadastrado e desconformidade resolvida.`
        : `Desconformidade vinculada ao item "${unidade.descricao}" e resolvida.`,
  };
}

// ── Vínculos guardados na aba do navegador ──────────────────────────────────
/**
 * O vínculo desconformidade para unidade criada vive na seção e é copiado para
 * o `sessionStorage` da aba: sobrevive a fechar o diálogo, trocar de aba do
 * estoque e recarregar a página, inclusive para item sem código (onde o 409 do
 * servidor não tem como avisar). Guarda só identificador e descrição do
 * equipamento, nada de pessoa.
 */
export const CHAVE_VINCULOS = 'dmo:estoque:desconformidades:vinculos';

export type MapaVinculos = Readonly<Record<string, UnidadeVinculada>>;

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function ehVinculo(v: unknown): v is UnidadeVinculada {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    o.id !== '' &&
    typeof o.descricao === 'string' &&
    (o.codigo === null || typeof o.codigo === 'string') &&
    (o.origem === 'criada' || o.origem === 'existente')
  );
}

export function lerVinculos(armazenamento: Armazenamento | null): MapaVinculos {
  if (!armazenamento) return {};
  try {
    const bruto = armazenamento.getItem(CHAVE_VINCULOS);
    if (!bruto) return {};
    const obj: unknown = JSON.parse(bruto);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const saida: Record<string, UnidadeVinculada> = {};
    for (const [chave, valor] of Object.entries(obj)) {
      if (ehVinculo(valor)) saida[chave] = valor;
    }
    return saida;
  } catch {
    return {};
  }
}

export function gravarVinculos(armazenamento: Armazenamento | null, mapa: MapaVinculos): void {
  if (!armazenamento) return;
  try {
    if (Object.keys(mapa).length === 0) armazenamento.removeItem(CHAVE_VINCULOS);
    else armazenamento.setItem(CHAVE_VINCULOS, JSON.stringify(mapa));
  } catch {
    /* armazenamento cheio ou bloqueado: o vínculo continua na memória da seção */
  }
}
