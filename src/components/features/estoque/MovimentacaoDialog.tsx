'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ESTADOS } from '@/domain/estoque/estado';
import { STATUS } from '@/domain/estoque/status-unidade';
import { registrarMovimentacao } from './api';
import { ErroEstoque } from './erros';
import {
  AJUDA_TIPO_MOV,
  ROTULO_ESTADO,
  ROTULO_STATUS,
  ROTULO_TIPO_MOV,
} from './rotulos';
import {
  camposVisiveis,
  estadoInicialForm,
  montarPayload,
  tiposPorNatureza,
  type AlvoMov,
  type EstadoFormMov,
} from './movimentacao-form';
import type { LocalDTO, Natureza, Status, TipoMovimentacao } from './dtos';

export interface AlvoMovimentacao extends AlvoMov {
  descricao: string;
  /** Situacao atual (serializado): desabilita baixa quando ja descartado. */
  statusAtual?: Status;
  /** Local atual (serializado): pre-preenche origem de transferencia. */
  localAtualId?: string | null;
}

interface Props {
  aberto: boolean;
  alvo: AlvoMovimentacao | null;
  locais: readonly LocalDTO[];
  /** Buckets de tamanho ja existentes do material (quantificavel). */
  tamanhosDisponiveis?: readonly string[];
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => void;
}

/**
 * Dialog de registrar movimentacao (admin). NUNCA envia direto: o operador
 * revisa tipo, quantidade/tamanho, locais e motivo, e confirma. Cobre os cinco
 * tipos conforme o backend; feedback de sucesso/erro claro (ex.: saldo
 * insuficiente vira mensagem legivel). A11y: `<dialog>` modal, labels, foco
 * inicial, erro com role=alert.
 */
export function MovimentacaoDialog({
  aberto,
  alvo,
  locais,
  tamanhosDisponiveis = [],
  aoFechar,
  aoConcluir,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const natureza: Natureza = alvo?.natureza ?? 'serializado';
  const tipos = useMemo(() => tiposPorNatureza(natureza), [natureza]);

  const [form, setForm] = useState<EstadoFormMov>(() =>
    estadoInicialForm(tipos[0] ?? 'transferencia'),
  );
  const [erros, setErros] = useState<
    Partial<Record<keyof EstadoFormMov | 'geral', string>>
  >({});
  const [enviando, setEnviando] = useState(false);
  const [erroApi, setErroApi] = useState<string | null>(null);

  // Reset a cada abertura/alvo novo. Pre-preenche origem com o local atual do
  // serializado (transferencia/ajuste partem de onde o item esta hoje).
  useEffect(() => {
    if (!aberto || !alvo) return;
    const tipoInicial = tiposPorNatureza(alvo.natureza)[0] ?? 'transferencia';
    setForm({
      ...estadoInicialForm(tipoInicial),
      localOrigem: alvo.localAtualId ?? '',
    });
    setErros({});
    setErroApi(null);
    setEnviando(false);
  }, [aberto, alvo]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => {
        dlg.querySelector<HTMLSelectElement>('select[data-inicial]')?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  if (!alvo) {
    // Mantem o <dialog> no DOM para animar o fechamento sem crash de acesso.
    return <dialog ref={dialogRef} className="hidden" aria-hidden="true" />;
  }

  const vis = camposVisiveis(form.tipo, natureza);
  const baixaBloqueada = natureza === 'serializado' && alvo.statusAtual === 'descarte';

  function atualizar<K extends keyof EstadoFormMov>(campo: K, valor: EstadoFormMov[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((e) => ({ ...e, [campo]: undefined, geral: undefined }));
  }

  async function enviar() {
    if (!alvo) return;
    const { payload, erros: errosValidacao } = montarPayload(alvo, form);
    if (!payload) {
      setErros(errosValidacao);
      return;
    }
    setEnviando(true);
    setErroApi(null);
    try {
      await registrarMovimentacao(payload);
      aoConcluir(`Movimentação registrada: ${ROTULO_TIPO_MOV[form.tipo]} de ${alvo.descricao}.`);
    } catch (e) {
      setErroApi(
        e instanceof ErroEstoque
          ? e.message
          : 'Não foi possível registrar a movimentação. Tente novamente.',
      );
      setEnviando(false);
    }
  }

  const idTipo = `${baseId}-tipo`;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        if (enviando) {
          e.preventDefault();
          return;
        }
        aoFechar();
      }}
      onClose={() => {
        if (aberto) aoFechar();
      }}
      aria-modal="true"
      aria-labelledby={`${baseId}-titulo`}
      className="m-0 w-full max-w-lg rounded-gov-card border border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="flex max-h-[85vh] flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={`${baseId}-titulo`} className="text-lg font-semibold">
            Registrar movimentação
          </h2>
          <p className="mt-0.5 truncate text-xs text-app-fg-muted">{alvo.descricao}</p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Tipo */}
          <div className="flex flex-col gap-1">
            <label htmlFor={idTipo} className="text-sm font-medium text-app-fg">
              Tipo de movimentação
            </label>
            <div className="relative">
              <select
                id={idTipo}
                data-inicial
                value={form.tipo}
                onChange={(e) => {
                  const novo = e.target.value as TipoMovimentacao;
                  setForm({
                    ...estadoInicialForm(novo),
                    localOrigem: alvo.localAtualId ?? '',
                  });
                  setErros({});
                }}
                className="w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
              >
                {tipos.map((t) => (
                  <option key={t} value={t} disabled={t === 'baixa' && baixaBloqueada}>
                    {ROTULO_TIPO_MOV[t]}
                    {t === 'baixa' && baixaBloqueada ? ' (item já descartado)' : ''}
                  </option>
                ))}
              </select>
              <SetaSelect />
            </div>
            <p className="text-2xs text-app-fg-muted">{AJUDA_TIPO_MOV[form.tipo]}</p>
          </div>

          {/* Quantidade + tamanho (quantificavel) */}
          {vis.quantidade || vis.tamanho ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {vis.quantidade ? (
                <CampoNumero
                  rotulo="Quantidade"
                  valor={form.quantidade}
                  erro={erros.quantidade}
                  aoMudar={(n) => atualizar('quantidade', n)}
                />
              ) : null}
              {vis.tamanho ? (
                <CampoTexto
                  rotulo="Tamanho"
                  descricao="Bitola, medida ou lote (se houver)."
                  valor={form.tamanho}
                  lista={tamanhosDisponiveis}
                  aoMudar={(v) => atualizar('tamanho', v)}
                />
              ) : null}
            </div>
          ) : null}

          {/* Locais */}
          {vis.localOrigem ? (
            <CampoLocal
              rotulo="Local de origem"
              valor={form.localOrigem}
              locais={locais}
              erro={erros.localOrigem}
              aoMudar={(v) => atualizar('localOrigem', v)}
            />
          ) : null}
          {vis.localDestino ? (
            <CampoLocal
              rotulo={form.tipo === 'ajuste' ? 'Novo local (opcional)' : 'Local de destino'}
              valor={form.localDestino}
              locais={locais}
              erro={erros.localDestino}
              opcional={form.tipo === 'ajuste'}
              aoMudar={(v) => atualizar('localDestino', v)}
            />
          ) : null}

          {/* Ajuste serializado: estado / situacao */}
          {vis.estado ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoSelect
                rotulo="Novo estado (opcional)"
                valor={form.estado}
                aoMudar={(v) => atualizar('estado', v as EstadoFormMov['estado'])}
                opcoes={ESTADOS.map((e) => ({ valor: e, rotulo: ROTULO_ESTADO[e] }))}
              />
              <CampoSelect
                rotulo="Nova situação (opcional)"
                valor={form.status}
                aoMudar={(v) => atualizar('status', v as EstadoFormMov['status'])}
                opcoes={STATUS.map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] }))}
              />
            </div>
          ) : null}

          {/* Motivo (baixa/ajuste) */}
          {vis.motivo ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${baseId}-motivo`} className="text-sm font-medium text-app-fg">
                Motivo
              </label>
              <textarea
                id={`${baseId}-motivo`}
                value={form.motivo}
                onChange={(e) => atualizar('motivo', e.target.value)}
                rows={2}
                aria-invalid={erros.motivo ? true : undefined}
                className={[
                  'rounded border bg-app-surface px-3 py-2 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface',
                  erros.motivo
                    ? 'border-gov-perigo focus-visible:ring-gov-perigo'
                    : 'border-app-border-input focus-visible:ring-gov-azul',
                ].join(' ')}
                placeholder="Descreva o motivo (mínimo 3 caracteres). Fica registrado na trilha."
              />
              {erros.motivo ? (
                <span role="alert" className="text-sm text-gov-perigo">
                  {erros.motivo}
                </span>
              ) : null}
            </div>
          ) : null}

          {erros.geral ? (
            <p role="alert" className="text-sm text-gov-perigo">
              {erros.geral}
            </p>
          ) : null}

          {erroApi ? (
            <div
              role="alert"
              className="rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
            >
              {erroApi}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={aoFechar}
            disabled={enviando}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {enviando ? 'Registrando…' : 'Registrar movimentação'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function CampoNumero({
  rotulo,
  valor,
  erro,
  aoMudar,
}: {
  rotulo: string;
  valor: number;
  erro?: string;
  aoMudar: (n: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      <input
        id={id}
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={Number.isFinite(valor) ? valor : ''}
        onChange={(e) => aoMudar(Number(e.target.value))}
        aria-invalid={erro ? true : undefined}
        className={[
          'rounded border bg-app-surface px-3 py-2 text-sm text-app-fg tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface',
          erro ? 'border-gov-perigo focus-visible:ring-gov-perigo' : 'border-app-border-input focus-visible:ring-gov-azul',
        ].join(' ')}
      />
      {erro ? (
        <span role="alert" className="text-sm text-gov-perigo">
          {erro}
        </span>
      ) : null}
    </div>
  );
}

function CampoTexto({
  rotulo,
  descricao,
  valor,
  lista,
  aoMudar,
}: {
  rotulo: string;
  descricao?: string;
  valor: string;
  lista?: readonly string[];
  aoMudar: (v: string) => void;
}) {
  const id = useId();
  const listId = `${id}-lista`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      <input
        id={id}
        type="text"
        value={valor}
        list={lista && lista.length > 0 ? listId : undefined}
        onChange={(e) => aoMudar(e.target.value)}
        className="rounded border border-app-border-input bg-app-surface px-3 py-2 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface"
      />
      {lista && lista.length > 0 ? (
        <datalist id={listId}>
          {lista.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      ) : null}
      {descricao ? <span className="text-2xs text-app-fg-muted">{descricao}</span> : null}
    </div>
  );
}

function CampoLocal({
  rotulo,
  valor,
  locais,
  erro,
  opcional,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  locais: readonly LocalDTO[];
  erro?: string;
  opcional?: boolean;
  aoMudar: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      <div className="relative">
        <select
          id={id}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          aria-invalid={erro ? true : undefined}
          className={[
            'w-full appearance-none rounded border bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface',
            erro ? 'border-gov-perigo focus-visible:ring-gov-perigo' : 'border-app-border-input focus-visible:ring-gov-azul',
          ].join(' ')}
        >
          <option value="">{opcional ? 'Manter local atual' : 'Selecione o local'}</option>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>
              {l.rotulo}
            </option>
          ))}
        </select>
        <SetaSelect />
      </div>
      {erro ? (
        <span role="alert" className="text-sm text-gov-perigo">
          {erro}
        </span>
      ) : null}
    </div>
  );
}

function CampoSelect({
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  opcoes: { valor: string; rotulo: string }[];
  aoMudar: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      <div className="relative">
        <select
          id={id}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className="w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
        >
          <option value="">Manter</option>
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <SetaSelect />
      </div>
    </div>
  );
}

function SetaSelect() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-app-fg-muted"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
