'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DirecaoSeta, ElementoDiagrama } from '@/domain/diagramas/tipos';

interface Props {
  /** Elemento em edição; null fecha o diálogo. */
  elemento: ElementoDiagrama | null;
  aoSalvar: (elemento: ElementoDiagrama) => void;
  aoCancelar: () => void;
}

/**
 * Edição rápida de um elemento (Fase A2): nome, código, valor, rótulo e direção
 * conforme o tipo. A edição completa de limiares vem na A3; aqui cobrimos o
 * básico para o usuário identificar cada elemento. Segue o padrão <dialog>
 * nativo do projeto (focus-trap via showModal, a11y por label/aria), sem
 * window.prompt. Aberto por duplo clique no elemento.
 *
 * O parsing de número aceita vírgula decimal (pt-BR); vazio vira null.
 */
export function DialogEditarElemento({ elemento, aoSalvar, aoCancelar }: Props) {
  const aberto = elemento !== null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primeiroCampoRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [valor, setValor] = useState('');
  const [unidade, setUnidade] = useState('');
  const [rotulo, setRotulo] = useState('');
  const [direcao, setDirecao] = useState<DirecaoSeta>('direta');

  // Carrega os campos a cada novo elemento aberto.
  useEffect(() => {
    if (!elemento) return;
    setNome('nome' in elemento ? elemento.nome : '');
    setCodigo('codigo' in elemento ? elemento.codigo : '');
    setValor(
      'valor' in elemento && elemento.valor !== null
        ? String(elemento.valor).replace('.', ',')
        : '',
    );
    setUnidade(
      elemento.tipo === 'nivel' && elemento.unidade ? elemento.unidade : '',
    );
    setRotulo(elemento.tipo === 'linha' ? (elemento.label ?? '') : '');
    setDirecao(elemento.tipo === 'linha' ? elemento.direcaoSeta : 'direta');
  }, [elemento]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => primeiroCampoRef.current?.focus());
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  const titulo = useMemo(() => {
    switch (elemento?.tipo) {
      case 'reservatorio':
        return 'Editar reservatório';
      case 'nivel':
        return 'Editar posto de nível';
      case 'chuva':
        return 'Editar posto de chuva';
      case 'linha':
        return 'Editar rio';
      default:
        return 'Editar elemento';
    }
  }, [elemento]);

  function parseValor(texto: string): number | null {
    const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
    if (limpo === '') return null;
    const n = Number(limpo);
    return Number.isFinite(n) ? n : null;
  }

  function salvar() {
    if (!elemento) return;
    let atualizado: ElementoDiagrama;
    switch (elemento.tipo) {
      case 'reservatorio':
        atualizado = { ...elemento, nome: nome.trim() || 'Reservatório' };
        break;
      case 'nivel':
        atualizado = {
          ...elemento,
          nome: nome.trim() || 'Posto de nível',
          codigo: codigo.trim() || 'PN-000',
          valor: parseValor(valor),
          unidade: unidade.trim() || null,
        };
        break;
      case 'chuva':
        atualizado = {
          ...elemento,
          nome: nome.trim() || 'Posto de chuva',
          codigo: codigo.trim() || 'PC-000',
          valor: parseValor(valor),
        };
        break;
      case 'linha':
        atualizado = {
          ...elemento,
          label: rotulo.trim() || null,
          direcaoSeta: direcao,
        };
        break;
    }
    aoSalvar(atualizado);
  }

  const tituloId = `${baseId}-titulo`;
  const tipo = elemento?.tipo;
  const temCodigo = tipo === 'nivel' || tipo === 'chuva';
  const temValor = tipo === 'nivel' || tipo === 'chuva';
  const temNome = tipo !== 'linha';

  const classeCampo =
    'w-full rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul';
  const classeLabel = 'block text-sm font-medium text-app-fg';

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        aoCancelar();
      }}
      onClose={() => {
        if (aberto) aoCancelar();
      }}
      aria-labelledby={tituloId}
      className="m-0 max-w-md rounded-gov-card border border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
        className="flex w-[min(90vw,28rem)] flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={tituloId} className="text-lg font-semibold">
            {titulo}
          </h2>
        </header>

        <div className="space-y-3 px-5 py-4">
          {temNome ? (
            <div className="space-y-1">
              <label htmlFor={`${baseId}-nome`} className={classeLabel}>
                Nome
              </label>
              <input
                ref={primeiroCampoRef}
                id={`${baseId}-nome`}
                type="text"
                value={nome}
                maxLength={200}
                onChange={(e) => setNome(e.target.value)}
                className={classeCampo}
              />
            </div>
          ) : null}

          {temCodigo ? (
            <div className="space-y-1">
              <label htmlFor={`${baseId}-codigo`} className={classeLabel}>
                Código
              </label>
              <input
                id={`${baseId}-codigo`}
                type="text"
                value={codigo}
                maxLength={40}
                onChange={(e) => setCodigo(e.target.value)}
                className={classeCampo}
              />
            </div>
          ) : null}

          {temValor ? (
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label htmlFor={`${baseId}-valor`} className={classeLabel}>
                  Valor
                </label>
                <input
                  id={`${baseId}-valor`}
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="Sem leitura"
                  className={classeCampo}
                />
              </div>
              {tipo === 'nivel' ? (
                <div className="w-24 space-y-1">
                  <label htmlFor={`${baseId}-unidade`} className={classeLabel}>
                    Unidade
                  </label>
                  <input
                    id={`${baseId}-unidade`}
                    type="text"
                    value={unidade}
                    maxLength={20}
                    onChange={(e) => setUnidade(e.target.value)}
                    placeholder="m"
                    className={classeCampo}
                  />
                </div>
              ) : (
                <div className="flex w-24 items-end pb-1.5 text-sm text-app-fg-muted">
                  mm
                </div>
              )}
            </div>
          ) : null}

          {tipo === 'linha' ? (
            <>
              <div className="space-y-1">
                <label htmlFor={`${baseId}-rotulo`} className={classeLabel}>
                  Rótulo do rio
                </label>
                <input
                  ref={primeiroCampoRef}
                  id={`${baseId}-rotulo`}
                  type="text"
                  value={rotulo}
                  maxLength={200}
                  onChange={(e) => setRotulo(e.target.value)}
                  placeholder="Ex.: Rio Tietê"
                  className={classeCampo}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${baseId}-direcao`} className={classeLabel}>
                  Direção da seta
                </label>
                <select
                  id={`${baseId}-direcao`}
                  value={direcao}
                  onChange={(e) => setDirecao(e.target.value as DirecaoSeta)}
                  className={classeCampo}
                >
                  <option value="direta">Direta (sentido do traçado)</option>
                  <option value="reversa">Reversa (sentido inverso)</option>
                  <option value="nenhuma">Sem seta</option>
                </select>
              </div>
            </>
          ) : null}

          {tipo === 'nivel' ? (
            <p className="text-xs text-app-fg-subtle">
              Limiares de alerta e tendência serão configurados na próxima etapa.
            </p>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={aoCancelar}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Salvar
          </button>
        </footer>
      </form>
    </dialog>
  );
}
