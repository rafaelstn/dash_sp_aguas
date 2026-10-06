/**
 * Logica PURA do formulario de movimentacao (sem React, sem I/O). Espelha as
 * regras estruturais do dominio (`validarComandoEstrutural`) para dar feedback
 * imediato no cliente, ANTES de enviar. O backend continua sendo a autoridade;
 * isto e so UX. Testavel isoladamente.
 */

import {
  MATRICULA_SOLICITANTE_MAX,
  MATRICULA_SOLICITANTE_MIN,
  MATRICULA_SOLICITANTE_REGEX,
} from '@/domain/estoque/movimentacao';
import type { PayloadMovimentacao } from './tipos';
import type { Estado, Natureza, Status, TipoMovimentacao } from './dtos';

export interface AlvoMov {
  natureza: Natureza;
  /** Id da unidade serializada (natureza serializado). */
  unidadeId?: string;
  /** Id do material quantificavel (natureza quantificavel). */
  materialId?: string;
}

/** Estado editavel do formulario de movimentacao. */
export interface EstadoFormMov {
  tipo: TipoMovimentacao;
  /** Quantidade (quantificavel). Serializado e sempre 1. */
  quantidade: number;
  /** Bucket de tamanho (quantificavel). '' = sem tamanho. */
  tamanho: string;
  /** Local de origem (uuid) ou ''. */
  localOrigem: string;
  /** Local de destino (uuid) ou ''. */
  localDestino: string;
  motivo: string;
  /** Ajuste serializado: novo estado fisico. '' = nao mexer. */
  estado: '' | Estado;
  /** Ajuste serializado: nova situacao. '' = nao mexer. */
  status: '' | Status;
  /**
   * Matricula funcional de quem SOLICITOU a retirada. So a `saida` usa. Guarda
   * o valor BRUTO que a pessoa digitou: sem trim, porque o espaco e justamente
   * o que separa matricula de nome, e aparar faria ' 482913' virar outro valor.
   */
  solicitanteMatricula: string;
}

export function estadoInicialForm(tipoInicial: TipoMovimentacao): EstadoFormMov {
  return {
    tipo: tipoInicial,
    quantidade: 1,
    tamanho: '',
    localOrigem: '',
    localDestino: '',
    motivo: '',
    estado: '',
    status: '',
    solicitanteMatricula: '',
  };
}

/**
 * Motivo da recusa da matricula, em texto para QUEM DIGITA.
 *
 * Nao reaproveita o `MATRICULA_SOLICITANTE_MENSAGEM` do dominio de proposito:
 * aquela frase comeca pelo nome do campo (`solicitanteMatricula`) e serve ao
 * corpo de erro da rota, nao a tela (identificador de programa nao e texto de
 * interface). Os LIMITES, que sao a regra, vem importados, e a regex do dominio
 * continua sendo a palavra final logo abaixo.
 *
 * Tres motivos separados porque a pessoa precisa saber qual e o dela: no balcao
 * o erro comum e digitar o NOME, e "valor invalido" faria ela digitar o nome de
 * novo. Devolve null quando o valor passa.
 */
export function motivoRecusaMatricula(valor: string): string | null {
  if (valor === '') {
    return 'Informe a matrícula funcional de quem solicitou a retirada.';
  }
  if (/\s/.test(valor)) {
    return 'A matrícula não pode conter espaço. Este campo é a matrícula funcional de quem solicitou, não é o nome da pessoa.';
  }
  if (!MATRICULA_SOLICITANTE_REGEX.test(valor)) {
    return `A matrícula deve ter de ${MATRICULA_SOLICITANTE_MIN} a ${MATRICULA_SOLICITANTE_MAX} caracteres.`;
  }
  return null;
}

/**
 * Tipos de movimentacao aplicaveis a cada natureza. `ajuste` so vale para
 * serializado (correcao de estado/situacao/local); em quantificavel a correcao
 * de quantidade e feita por entrada/saida/baixa.
 */
export function tiposPorNatureza(natureza: Natureza): TipoMovimentacao[] {
  if (natureza === 'serializado') {
    return ['transferencia', 'baixa', 'ajuste', 'entrada', 'saida'];
  }
  return ['entrada', 'saida', 'transferencia', 'baixa'];
}

/** Campos visiveis no formulario para um dado tipo/natureza. */
export interface CamposVisiveis {
  quantidade: boolean;
  tamanho: boolean;
  localOrigem: boolean;
  localDestino: boolean;
  motivo: boolean;
  estado: boolean;
  status: boolean;
  /** So a `saida` tem solicitante. Nos outros tipos mandar o campo e erro. */
  solicitanteMatricula: boolean;
}

export function camposVisiveis(
  tipo: TipoMovimentacao,
  natureza: Natureza,
): CamposVisiveis {
  const quant = natureza === 'quantificavel';
  const base: CamposVisiveis = {
    quantidade: false,
    tamanho: false,
    localOrigem: false,
    localDestino: false,
    motivo: false,
    estado: false,
    status: false,
    solicitanteMatricula: false,
  };
  switch (tipo) {
    case 'entrada':
      return { ...base, quantidade: quant, tamanho: quant, localDestino: true };
    case 'saida':
      return {
        ...base,
        quantidade: quant,
        tamanho: quant,
        localOrigem: true,
        solicitanteMatricula: true,
      };
    case 'transferencia':
      return {
        ...base,
        quantidade: quant,
        tamanho: quant,
        localOrigem: true,
        localDestino: true,
      };
    case 'baixa':
      return {
        ...base,
        quantidade: quant,
        tamanho: quant,
        localOrigem: quant,
        motivo: true,
      };
    case 'ajuste':
      // Somente serializado.
      return { ...base, motivo: true, estado: true, status: true, localDestino: true };
  }
}

export interface ResultadoMontagem {
  payload: PayloadMovimentacao | null;
  erros: Partial<Record<keyof EstadoFormMov | 'geral', string>>;
}

/**
 * Valida o formulario e monta o payload da rota `POST /movimentacoes`.
 * Retorna `payload: null` quando ha erro. Espelha as regras estruturais do
 * dominio para o feedback imediato no cliente. Funcao PURA.
 */
export function montarPayload(
  alvo: AlvoMov,
  form: EstadoFormMov,
): ResultadoMontagem {
  const erros: ResultadoMontagem['erros'] = {};
  const serializado = alvo.natureza === 'serializado';
  const vis = camposVisiveis(form.tipo, alvo.natureza);

  if (serializado && !alvo.unidadeId) erros.geral = 'Unidade não identificada.';
  if (!serializado && !alvo.materialId) erros.geral = 'Material não identificado.';

  const quantidade = serializado ? 1 : Math.trunc(form.quantidade);
  if (!serializado) {
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      erros.quantidade = 'Informe uma quantidade inteira maior ou igual a 1.';
    }
  }

  if (vis.localDestino && form.tipo !== 'ajuste' && !form.localDestino) {
    erros.localDestino = 'Selecione o local de destino.';
  }
  if (vis.localOrigem && !form.localOrigem) {
    erros.localOrigem = 'Selecione o local de origem.';
  }
  if (
    form.tipo === 'transferencia' &&
    form.localOrigem &&
    form.localDestino &&
    form.localOrigem === form.localDestino
  ) {
    erros.localDestino = 'Origem e destino devem ser diferentes.';
  }
  if ((form.tipo === 'baixa' || form.tipo === 'ajuste') && form.motivo.trim().length < 3) {
    erros.motivo = 'Informe um motivo com ao menos 3 caracteres.';
  }
  if (form.tipo === 'ajuste') {
    const semMudanca = form.estado === '' && form.status === '' && !form.localDestino;
    if (semMudanca) {
      erros.geral = 'Escolha ao menos uma mudança: estado, situação ou local.';
    }
  }
  if (vis.solicitanteMatricula) {
    // Sobre o valor BRUTO. A regex do dominio e a palavra final dentro de
    // `motivoRecusaMatricula`, para a tela nunca aceitar o que a rota recusaria.
    const recusa = motivoRecusaMatricula(form.solicitanteMatricula);
    if (recusa) erros.solicitanteMatricula = recusa;
  }

  if (Object.keys(erros).length > 0) {
    return { payload: null, erros };
  }

  const payload: PayloadMovimentacao = { tipo: form.tipo };
  if (serializado) payload.unidadeId = alvo.unidadeId;
  else {
    payload.materialId = alvo.materialId;
    payload.quantidade = quantidade;
    if (vis.tamanho && form.tamanho.trim()) payload.tamanho = form.tamanho.trim();
  }
  if (vis.localOrigem && form.localOrigem) payload.localOrigem = form.localOrigem;
  if (form.localDestino && (vis.localDestino || form.tipo === 'ajuste')) {
    payload.localDestino = form.localDestino;
  }
  if (vis.motivo) payload.motivo = form.motivo.trim();
  if (form.tipo === 'ajuste') {
    if (form.estado !== '') payload.estado = form.estado;
    if (form.status !== '') payload.status = form.status;
  }
  // So a saida declara a chave no zod da rota. Mandar identificador funcional
  // onde ele nao tem finalidade e dado pessoal gravado sem necessidade.
  if (vis.solicitanteMatricula) {
    payload.solicitanteMatricula = form.solicitanteMatricula;
  }

  return { payload, erros: {} };
}
