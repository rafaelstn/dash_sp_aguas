import type { EstoqueConferenciasRepository } from '@/application/ports/estoque-conferencias-repository';
import type {
  ConferenciaItem,
  ContagemComando,
  ObservacaoContagem,
  SituacaoItem,
} from '@/domain/estoque/conferencia';
import { ConferenciaNaoEncontrada, DadosInvalidos } from '@/domain/errors';

/** Forma serializada da contagem (situacao categorica). */
export interface EntradaContagemSerializado {
  situacao: Exclude<SituacaoItem, 'pendente'>;
  localEncontradoId?: string | null;
  observacao?: string | null;
}
/** Forma quantificavel da contagem (quantidade fisica contada). */
export interface EntradaContagemQuantificavel {
  quantidadeContada: number;
  observacao?: string | null;
}
export type EntradaContagem = EntradaContagemSerializado | EntradaContagemQuantificavel;

function ehSerializada(e: EntradaContagem): e is EntradaContagemSerializado {
  return 'situacao' in e;
}

/**
 * Registra a contagem de 1 item.
 *
 * Responsabilidade do use-case (sem I/O direto de banco): validar que a FORMA da
 * contagem bate com a natureza da SESSAO (serializado usa `situacao`;
 * quantificavel usa `quantidadeContada`) e que `encontrado_em_outro_local` traz
 * o `localEncontradoId`. As regras que dependem do estado (sessao aberta, item
 * existe/pertence, natureza do item) sao revalidadas pelo repositorio dentro da
 * transacao. Testavel por injecao do `repo`.
 */
export async function registrarContagem(
  repo: EstoqueConferenciasRepository,
  conferenciaId: string,
  itemId: string,
  entrada: EntradaContagem,
  usuarioId: string,
): Promise<ConferenciaItem> {
  const conf = await repo.obterPorId(conferenciaId);
  if (!conf) throw new ConferenciaNaoEncontrada(conferenciaId);

  const serializada = ehSerializada(entrada);
  if (conf.natureza === 'serializado' && !serializada) {
    throw new DadosInvalidos('Esta conferencia e de serializados; informe a situacao do item.');
  }
  if (conf.natureza === 'quantificavel' && serializada) {
    throw new DadosInvalidos('Esta conferencia e de quantificaveis; informe a quantidade contada.');
  }

  let comando: ContagemComando;
  if (serializada) {
    if (entrada.situacao === 'encontrado_em_outro_local' && !entrada.localEncontradoId) {
      throw new DadosInvalidos(
        'Item encontrado em outro local exige o localEncontradoId (para onde transferir).',
      );
    }
    comando = {
      tipo: 'serializado',
      situacao: entrada.situacao,
      localEncontradoId: entrada.localEncontradoId ?? null,
      observacao: normalizarObservacao(entrada.observacao),
    };
  } else {
    comando = {
      tipo: 'quantificavel',
      quantidadeContada: entrada.quantidadeContada,
      observacao: normalizarObservacao(entrada.observacao),
    };
  }

  return repo.registrarContagem(conferenciaId, itemId, comando, usuarioId);
}

/**
 * Traduz o campo do payload para os tres estados de `ObservacaoContagem`: campo
 * ausente preserva; `null` ou texto em branco limpam; texto define (sem espaco
 * nas pontas). Texto em branco vira limpeza, e nao um espaco gravado, porque
 * apagar o campo na tela e pedido de limpeza, nao de guardar vazio.
 */
function normalizarObservacao(valor: string | null | undefined): ObservacaoContagem {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const texto = valor.trim();
  return texto === '' ? null : texto;
}
