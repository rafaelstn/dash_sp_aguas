'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  DirecaoSeta,
  ElementoDiagrama,
  LimiaresNivel,
} from '@/domain/diagramas/tipos';
import { validarOrdemLimiares } from '@/domain/diagramas/limiares';

interface Props {
  /** Elemento em edição; null fecha o diálogo. */
  elemento: ElementoDiagrama | null;
  aoSalvar: (elemento: ElementoDiagrama) => void;
  aoCancelar: () => void;
}

/** Os 4 limiares como texto de formulário, na ordem de criticidade. */
const CAMPOS_LIMIAR: ReadonlyArray<{ chave: keyof LimiaresNivel; rotulo: string }> = [
  { chave: 'atencao', rotulo: 'Atenção' },
  { chave: 'alerta', rotulo: 'Alerta' },
  { chave: 'emergencia', rotulo: 'Emergência' },
  { chave: 'extravasamento', rotulo: 'Extravasamento' },
];

type LimiaresTexto = Record<keyof LimiaresNivel, string>;

const LIMIARES_VAZIO: LimiaresTexto = {
  atencao: '',
  alerta: '',
  emergencia: '',
  extravasamento: '',
};

/**
 * Edição completa de um elemento (Fase A3): nome, código, valor, unidade e os
 * 4 limiares (nível); valor (chuva); nome (reservatório); rótulo e direção da
 * seta (rio). A ordem dos limiares (atenção <= alerta <= emergência <=
 * extravasamento) é validada ao vivo; ao violar, o diálogo avisa e bloqueia o
 * salvar. Ao salvar o nível, o status recalcula no node (`calcularStatus`).
 *
 * Segue o padrão <dialog> nativo do projeto (focus-trap via showModal, Esc
 * fecha, a11y por label/aria), sem window.prompt. Aberto por duplo clique ou
 * pela tecla Enter sobre o node focado, e pelo botão "Editar" da toolbar.
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
  const [limiares, setLimiares] = useState<LimiaresTexto>(LIMIARES_VAZIO);

  // Carrega os campos a cada novo elemento aberto.
  useEffect(() => {
    if (!elemento) return;
    setNome('nome' in elemento ? elemento.nome : '');
    setCodigo('codigo' in elemento ? elemento.codigo : '');
    setValor(
      'valor' in elemento && elemento.valor !== null
        ? numeroParaTexto(elemento.valor)
        : '',
    );
    setUnidade(
      elemento.tipo === 'nivel' && elemento.unidade ? elemento.unidade : '',
    );
    setRotulo(elemento.tipo === 'linha' ? (elemento.label ?? '') : '');
    setDirecao(elemento.tipo === 'linha' ? elemento.direcaoSeta : 'direta');
    setLimiares(
      elemento.tipo === 'nivel'
        ? {
            atencao: limiarParaTexto(elemento.limiares.atencao),
            alerta: limiarParaTexto(elemento.limiares.alerta),
            emergencia: limiarParaTexto(elemento.limiares.emergencia),
            extravasamento: limiarParaTexto(elemento.limiares.extravasamento),
          }
        : LIMIARES_VAZIO,
    );
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

  // Limiares parseados e validação de ordem, recalculados a cada digitação.
  const limiaresNumericos = useMemo<LimiaresNivel>(
    () => ({
      atencao: parseValor(limiares.atencao),
      alerta: parseValor(limiares.alerta),
      emergencia: parseValor(limiares.emergencia),
      extravasamento: parseValor(limiares.extravasamento),
    }),
    [limiares],
  );

  const validacaoLimiares = useMemo(
    () => validarOrdemLimiares(limiaresNumericos),
    [limiaresNumericos],
  );

  const tipo = elemento?.tipo;
  const podeSalvar = tipo !== 'nivel' || validacaoLimiares.valido;

  function salvar() {
    if (!elemento) return;
    if (!podeSalvar) return;
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
          limiares: limiaresNumericos,
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
  const erroLimiaresId = `${baseId}-erro-limiares`;
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
        className="flex max-h-[85vh] w-[min(90vw,28rem)] flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={tituloId} className="text-lg font-semibold">
            {titulo}
          </h2>
        </header>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
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

          {tipo === 'nivel' ? (
            <fieldset className="space-y-2 rounded border border-app-border-subtle p-3">
              <legend className="px-1 text-sm font-medium text-app-fg">
                Limiares de status
              </legend>
              <p className="text-xs text-app-fg-subtle">
                Pisos crescentes que definem o status do posto. Deixe em branco
                os que não se aplicam.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CAMPOS_LIMIAR.map(({ chave, rotulo: rotuloLimiar }) => (
                  <div key={chave} className="space-y-1">
                    <label
                      htmlFor={`${baseId}-limiar-${chave}`}
                      className="block text-xs font-medium text-app-fg-muted"
                    >
                      {rotuloLimiar}
                    </label>
                    <input
                      id={`${baseId}-limiar-${chave}`}
                      type="text"
                      inputMode="decimal"
                      value={limiares[chave]}
                      onChange={(e) =>
                        setLimiares((atual) => ({
                          ...atual,
                          [chave]: e.target.value,
                        }))
                      }
                      placeholder="—"
                      aria-invalid={!validacaoLimiares.valido}
                      aria-describedby={
                        validacaoLimiares.valido ? undefined : erroLimiaresId
                      }
                      className={classeCampo}
                    />
                  </div>
                ))}
              </div>
              {!validacaoLimiares.valido ? (
                <p
                  id={erroLimiaresId}
                  role="alert"
                  className="rounded border-l-4 border-gov-perigo bg-red-50 p-2 text-xs text-gov-perigo"
                >
                  {validacaoLimiares.mensagem}
                </p>
              ) : null}
            </fieldset>
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
            disabled={!podeSalvar}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Salvar
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** Número do domínio para texto de campo (vírgula decimal pt-BR). */
function numeroParaTexto(n: number): string {
  return String(n).replace('.', ',');
}

/** Limiar (number|null|undefined) para texto de campo. */
function limiarParaTexto(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : numeroParaTexto(n);
}

/** Texto de campo (pt-BR) para número; vazio/ inválido vira null. */
function parseValor(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
