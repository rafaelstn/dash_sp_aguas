'use client';

import { useEffect, useId, useState } from 'react';
import {
  ErroDeCampo,
  FormDialog,
  MensagemErroCampo,
  idsDescritos,
  useErroDoCampo,
} from '../FormDialog';
import { atualizarDesconformidade } from '../api';
import { ErroEstoque, textoDeErro } from '../erros';
import { DESCONFORMIDADE_ALTERADA, MENSAGEM_ALTERADA } from './cadastro-item-fluxo';
import type { DesconformidadeDTO } from '../dtos';
import {
  NOTA_MAX,
  ROTULO_TIPO_DESCONFORMIDADE,
  localizacaoPlanilha,
  validarNota,
} from './desconformidades-ui';

export type DecisaoNota = 'resolvida' | 'ignorada';

interface Props {
  alvo: { item: DesconformidadeDTO; decisao: DecisaoNota } | null;
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => void;
  /** 409 `desconformidade_alterada`: a tela fecha, avisa e recarrega a lista. */
  aoAlterada: (mensagem: string) => void;
}

const TITULO: Record<DecisaoNota, string> = {
  resolvida: 'Marcar como resolvida',
  ignorada: 'Ignorar desconformidade',
};

/** Resolver ou ignorar com nota obrigatoria (mesma regra do servidor). */
export function NotaDialog({ alvo, aoFechar, aoConcluir, aoAlterada }: Props) {
  const [nota, setNota] = useState('');
  const id = useId();
  const aberto = alvo !== null;

  useEffect(() => {
    if (aberto) setNota('');
  }, [aberto]);

  async function salvar() {
    if (!alvo) return;
    const erro = validarNota(nota);
    if (erro) throw new ErroDeCampo('nota', erro);
    try {
      await atualizarDesconformidade(alvo.item.id, {
        status: alvo.decisao,
        nota: nota.trim(),
        statusEsperado: alvo.item.status,
      });
    } catch (e) {
      if (e instanceof ErroEstoque && e.codigo === DESCONFORMIDADE_ALTERADA) {
        aoAlterada(MENSAGEM_ALTERADA);
        return;
      }
      throw new Error(textoDeErro(e, 'Não foi possível salvar. Tente novamente.'));
    }
    aoConcluir(
      alvo.decisao === 'resolvida'
        ? 'Desconformidade marcada como resolvida.'
        : 'Desconformidade ignorada.',
    );
  }

  return (
    <FormDialog
      aberto={aberto}
      titulo={alvo ? TITULO[alvo.decisao] : ''}
      rotuloConfirmar={alvo?.decisao === 'ignorada' ? 'Ignorar' : 'Marcar como resolvida'}
      aoSalvar={salvar}
      aoFechar={aoFechar}
    >
      {alvo ? (
        <div className="rounded bg-app-surface-2 px-3 py-2 text-sm">
          <p className="font-medium text-app-fg">{ROTULO_TIPO_DESCONFORMIDADE[alvo.item.tipo]}</p>
          <p className="text-app-fg-muted">{localizacaoPlanilha(alvo.item.aba, alvo.item.linha)}</p>
          <p className="mt-1 break-words text-app-fg">{alvo.item.detalhe}</p>
        </div>
      ) : null}
      <CampoNota id={id} nota={nota} aoMudar={setNota} />
    </FormDialog>
  );
}

/** Componente próprio porque o erro de campo vem do contexto do FormDialog. */
function CampoNota({ id, nota, aoMudar }: { id: string; nota: string; aoMudar: (v: string) => void }) {
  const erro = useErroDoCampo('nota');
  const tamanho = nota.trim().length;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-nota`} className="text-sm font-medium text-app-fg">
        Nota
        <span aria-hidden="true" className="text-gov-perigo">
          {' *'}
        </span>
      </label>
      <textarea
        id={`${id}-nota`}
        value={nota}
        onChange={(e) => aoMudar(e.target.value)}
        required
        aria-required="true"
        maxLength={NOTA_MAX}
        rows={3}
        placeholder="O que foi verificado. Não escreva CPF nem nome de pessoa."
        data-campo="nota"
        aria-invalid={erro.invalido || undefined}
        aria-describedby={idsDescritos(erro.idErro, `${id}-contador`)}
        className="rounded border border-app-border-input bg-app-surface px-3 py-2 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface aria-[invalid=true]:border-gov-perigo"
      />
      <span id={`${id}-contador`} className="self-end text-2xs text-app-fg-muted tabular">
        {tamanho} de {NOTA_MAX} caracteres
      </span>
      <MensagemErroCampo id={erro.idErro} mensagem={erro.mensagem} anunciar={erro.anunciar} />
    </div>
  );
}
