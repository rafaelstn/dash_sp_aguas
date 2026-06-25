'use client';

import {
  REGRAS_FORMATO,
  type CampoFicha,
  type FormatoCampo,
} from '@/domain/fichas/schemas';

/**
 * Widget primitivo de campo do formulário dinâmico do app.
 *
 * Renderiza o input correto pra cada `CampoFicha.tipo` aplicando
 * tokens do design system. Toca em layouts mobile-first:
 *  - touch targets ≥ 44px
 *  - label clicável grande
 *  - foco visível com `focus-visible:ring-2 focus-visible:ring-gov-azul`
 *  - mensagem de erro com `aria-describedby` + `aria-invalid` + role="alert"
 *
 * O `tipo` é o do schema (`texto`, `textarea`, `numero`, `select`, `checkbox`).
 * Tipos futuros (data, arquivo, coordenada) ficam preparados via switch
 * default para failsafe — quando André endurecer o domínio, é adicionar
 * o branch.
 *
 * Pt-BR: o `inputMode="decimal"` no campo numero ajuda o teclado virtual,
 * mas o usuário pode digitar vírgula. Convertemos antes de enviar pra Zod
 * — a função `parseNumeroPtBR` cuida disso no `FormularioFichaMobile`.
 */

/**
 * Chevron do select nativo. SVG data-uri inline como background-image, cor
 * `#6B7280` (token --fg-subtle, contraste suficiente sobre fundo branco).
 * Necessário porque `appearance-none` remove a seta nativa; sem ela o select
 * fica visualmente igual a um input de texto. Classe estática para o Tailwind
 * detectar no build.
 */
const ICONE_CHEVRON =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")]";

interface CampoFichaMobileProps {
  campo: CampoFicha;
  /** Valor atual do campo (string crua do input ou bool). */
  valor: unknown;
  onChange: (chave: string, valor: unknown) => void;
  /** Mensagem de erro inline (null se válido). */
  erro: string | null;
  /** Prefixo de id pra evitar colisão entre instâncias. */
  prefixoId: string;
  /** Marca o campo como obrigatório no UI (asterisco + aria-required). */
  obrigatorio: boolean;
}

export function CampoFichaMobile({
  campo,
  valor,
  onChange,
  erro,
  prefixoId,
  obrigatorio,
}: CampoFichaMobileProps) {
  const idCampo = `${prefixoId}-${campo.chave}`;
  const idAjuda = campo.ajuda ? `${idCampo}-ajuda` : undefined;
  const idErro = erro ? `${idCampo}-erro` : undefined;
  const describedBy =
    [idAjuda, idErro].filter((s): s is string => Boolean(s)).join(' ') || undefined;

  const baseClasses =
    'mt-1 block w-full min-h-[44px] rounded border bg-app-surface px-3 ' +
    'text-md text-app-fg placeholder:text-app-fg-muted ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul ' +
    'focus-visible:ring-offset-1 disabled:opacity-60';
  const borderClass = erro
    ? 'border-red-500 focus:border-red-500'
    : 'border-app-border focus:border-gov-azul';
  const inputClass = `${baseClasses} ${borderClass}`;

  // Helpers de leitura tolerante.
  const valorString = typeof valor === 'string' ? valor : valor === null || valor === undefined ? '' : String(valor);
  const valorBool = typeof valor === 'boolean' ? valor : false;

  function renderControle(): React.ReactNode {
    switch (campo.tipo) {
      case 'texto': {
        const regra = campo.formato ? REGRAS_FORMATO[campo.formato] : null;
        const placeholder = campo.placeholder ?? regra?.placeholder;
        return (
          <input
            id={idCampo}
            type="text"
            inputMode={inputModePorFormato(campo.formato)}
            autoComplete="off"
            placeholder={placeholder}
            maxLength={maxLengthPorFormato(campo.formato)}
            value={valorString}
            onChange={(e) =>
              onChange(campo.chave, aplicarMascara(campo.formato, e.target.value))
            }
            className={inputClass}
            aria-required={obrigatorio || undefined}
            aria-invalid={erro ? true : undefined}
            aria-describedby={describedBy}
          />
        );
      }

      case 'textarea':
        return (
          <textarea
            id={idCampo}
            rows={4}
            value={valorString}
            onChange={(e) => onChange(campo.chave, e.target.value)}
            className={`${inputClass} py-2 leading-snug`}
            aria-required={obrigatorio || undefined}
            aria-invalid={erro ? true : undefined}
            aria-describedby={describedBy}
          />
        );

      case 'numero':
        return (
          <div className="relative mt-1">
            <input
              id={idCampo}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={valorString}
              onChange={(e) => onChange(campo.chave, e.target.value)}
              placeholder={campo.min !== undefined && campo.max !== undefined ? `${campo.min}–${campo.max}` : undefined}
              className={`${inputClass} ${campo.unidade ? 'pr-12' : ''} mt-0`}
              aria-required={obrigatorio || undefined}
              aria-invalid={erro ? true : undefined}
              aria-describedby={describedBy}
            />
            {campo.unidade ? (
              <span
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-app-fg-muted"
                aria-hidden="true"
              >
                {campo.unidade}
              </span>
            ) : null}
          </div>
        );

      case 'select':
        return (
          <select
            id={idCampo}
            value={valorString}
            onChange={(e) => onChange(campo.chave, e.target.value)}
            className={`${inputClass} appearance-none bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9 ${ICONE_CHEVRON}`}
            aria-required={obrigatorio || undefined}
            aria-invalid={erro ? true : undefined}
            aria-describedby={describedBy}
          >
            <option value="">Selecionar…</option>
            {(campo.opcoes ?? []).map((opt) => (
              <option key={opt.valor} value={opt.valor}>
                {opt.rotulo}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        // Para checkbox usamos label clicável "card-like" pra área grande.
        return (
          <label
            htmlFor={idCampo}
            className={`mt-1 flex min-h-[44px] cursor-pointer items-center gap-3 rounded border bg-app-surface p-3 ${
              erro ? 'border-red-500' : 'border-app-border'
            } focus-within:ring-2 focus-within:ring-gov-azul focus-within:ring-offset-1`}
          >
            <input
              id={idCampo}
              type="checkbox"
              checked={valorBool}
              onChange={(e) => onChange(campo.chave, e.target.checked)}
              className="h-5 w-5 rounded border-app-border text-gov-azul focus:ring-gov-azul"
              aria-required={obrigatorio || undefined}
              aria-invalid={erro ? true : undefined}
              aria-describedby={describedBy}
            />
            <span className="text-sm leading-tight text-app-fg">
              {campo.rotulo}
              {obrigatorio ? (
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
              ) : null}
            </span>
          </label>
        );

      case 'tabela':
        return (
          <TabelaCampoMobile
            campo={campo}
            valor={valor}
            onChange={onChange}
            idCampo={idCampo}
            describedBy={describedBy}
          />
        );

      default: {
        // Failsafe — tipo novo introduzido no schema sem widget aqui.
        const tipoDesconhecido: string = (campo as { tipo: string }).tipo;
        return (
          <div
            role="alert"
            className="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
          >
            Tipo de campo &quot;{tipoDesconhecido}&quot; ainda não suportado.
          </div>
        );
      }
    }
  }

  // Para checkbox o rótulo já vai dentro do label clicável. Para os demais,
  // o label aparece em cima.
  if (campo.tipo === 'checkbox') {
    return (
      <div>
        {renderControle()}
        {campo.ajuda ? (
          <p id={idAjuda} className="mt-1 text-2xs text-app-fg-muted">
            {campo.ajuda}
          </p>
        ) : null}
        {erro ? (
          <p
            id={idErro}
            role="alert"
            className="mt-1 text-xs font-medium text-red-700"
          >
            {erro}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={idCampo}
        className="block text-xs font-medium text-app-fg"
      >
        {campo.rotulo}
        {obrigatorio ? (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {renderControle()}
      {campo.ajuda ? (
        <p id={idAjuda} className="mt-1 text-2xs text-app-fg-muted">
          {campo.ajuda}
        </p>
      ) : null}
      {erro ? (
        <p
          id={idErro}
          role="alert"
          className="mt-1 text-xs font-medium text-red-700"
        >
          {erro}
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Máscara e atributos de teclado por formato. Mantém só dígitos e insere os
// separadores conforme o técnico digita; a validação de formato fica no Zod
// (REGRAS_FORMATO). Formatos sem máscara (coordenada, e-mail) passam direto.
// ─────────────────────────────────────────────────────────────────────────

function aplicarMascara(formato: FormatoCampo | undefined, bruto: string): string {
  switch (formato) {
    case 'mes_ano':
      return agruparDigitos(bruto, [2], '/', 6);
    case 'data_br':
      return agruparDigitos(bruto, [2, 4], '/', 8);
    case 'hora_hm':
      return agruparDigitos(bruto, [2], ':', 4);
    case 'hora_hms':
      return agruparDigitos(bruto, [2, 4], ':', 6);
    case 'telefone':
      return mascararTelefone(bruto);
    case 'cpf':
      return mascararCpf(bruto);
    default:
      return bruto;
  }
}

/** XXX.XXX.XXX-XX progressivo. */
function mascararCpf(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 11);
  let saida = d.slice(0, 3);
  if (d.length > 3) saida += `.${d.slice(3, 6)}`;
  if (d.length > 6) saida += `.${d.slice(6, 9)}`;
  if (d.length > 9) saida += `-${d.slice(9, 11)}`;
  return saida;
}

/**
 * Insere `separador` após cada posição de corte, limitando a `maxDigitos`.
 * Ex.: agruparDigitos('19122025', [2,4], '/', 8) => '19/12/2025'.
 */
function agruparDigitos(
  bruto: string,
  cortes: number[],
  separador: string,
  maxDigitos: number,
): string {
  const digitos = bruto.replace(/\D/g, '').slice(0, maxDigitos);
  let saida = '';
  for (let i = 0; i < digitos.length; i++) {
    if (cortes.includes(i) && i > 0) saida += separador;
    saida += digitos[i];
  }
  return saida;
}

/** (XX) XXXXX-XXXX progressivo, aceitando fixo (10) ou celular (11 dígitos). */
function mascararTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  // 8 dígitos (fixo) quebram em 4-4; 9 dígitos (celular) em 5-4.
  const corte = resto.length <= 8 ? 4 : 5;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

function inputModePorFormato(
  formato: FormatoCampo | undefined,
): React.HTMLAttributes<HTMLInputElement>['inputMode'] {
  switch (formato) {
    case 'mes_ano':
    case 'data_br':
    case 'hora_hm':
    case 'hora_hms':
    case 'telefone':
    case 'cpf':
      return 'numeric';
    case 'email':
      return 'email';
    default:
      return 'text';
  }
}

function maxLengthPorFormato(formato: FormatoCampo | undefined): number | undefined {
  switch (formato) {
    case 'mes_ano':
      return 7; // MM/AAAA
    case 'data_br':
      return 10; // DD/MM/AAAA
    case 'hora_hm':
      return 5; // HH:MM
    case 'hora_hms':
      return 8; // HH:MM:SS
    case 'telefone':
      return 15; // (XX) XXXXX-XXXX
    case 'cpf':
      return 14; // XXX.XXX.XXX-XX
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Widget de tabela de linhas dinâmicas (ex.: verticais da medição de vazão).
// Cada linha é um objeto; as células guardam string crua e a conversão
// numérica pt-BR acontece na normalização do formulário, igual aos campos
// `numero` soltos. O técnico adiciona e remove linhas conforme mede.
// ─────────────────────────────────────────────────────────────────────────

function TabelaCampoMobile({
  campo,
  valor,
  onChange,
  idCampo,
  describedBy,
}: {
  campo: CampoFicha;
  valor: unknown;
  onChange: (chave: string, valor: unknown) => void;
  idCampo: string;
  describedBy?: string;
}) {
  const colunas = campo.colunas ?? [];
  const linhas: Array<Record<string, unknown>> = Array.isArray(valor)
    ? (valor as Array<Record<string, unknown>>)
    : [];
  const rotuloLinha = campo.rotuloLinha ?? 'Linha';
  const rotuloMinusculo = rotuloLinha.toLowerCase();

  const valorCelula = (v: unknown): string =>
    typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);

  function atualizarCelula(idx: number, chaveCol: string, novoValor: string) {
    onChange(
      campo.chave,
      linhas.map((l, i) => (i === idx ? { ...l, [chaveCol]: novoValor } : l)),
    );
  }
  function adicionarLinha() {
    onChange(campo.chave, [...linhas, {}]);
  }
  function removerLinha(idx: number) {
    onChange(
      campo.chave,
      linhas.filter((_, i) => i !== idx),
    );
  }

  const celulaClass =
    'mt-0.5 block w-full min-h-[40px] rounded border border-app-border bg-app-surface ' +
    'px-2 text-sm text-app-fg focus:border-gov-azul focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-gov-azul';

  return (
    <div className="mt-1 space-y-3" aria-describedby={describedBy}>
      {linhas.length === 0 ? (
        <p className="text-sm text-app-fg-muted">
          Nenhuma {rotuloMinusculo} adicionada ainda.
        </p>
      ) : (
        linhas.map((linha, idx) => (
          <fieldset
            key={idx}
            className="rounded border border-app-border bg-app-surface-2 p-3"
          >
            <legend className="px-1 text-xs font-semibold text-app-fg">
              {rotuloLinha} {idx + 1}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {colunas.map((col) => {
                const idCel = `${idCampo}-${idx}-${col.chave}`;
                return (
                  <div key={col.chave}>
                    <label
                      htmlFor={idCel}
                      className="block text-2xs font-medium text-app-fg-muted"
                    >
                      {col.rotulo}
                      {col.unidade ? ` (${col.unidade})` : ''}
                    </label>
                    {col.tipo === 'select' ? (
                      <select
                        id={idCel}
                        value={valorCelula(linha[col.chave])}
                        onChange={(e) => atualizarCelula(idx, col.chave, e.target.value)}
                        className={celulaClass}
                      >
                        <option value="">—</option>
                        {(col.opcoes ?? []).map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.rotulo}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={idCel}
                        type="text"
                        inputMode={col.tipo === 'numero' ? 'decimal' : 'text'}
                        autoComplete="off"
                        value={valorCelula(linha[col.chave])}
                        onChange={(e) => atualizarCelula(idx, col.chave, e.target.value)}
                        className={celulaClass}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => removerLinha(idx)}
              className="mt-2 min-h-[40px] rounded border border-app-border px-3 text-xs font-medium text-app-fg hover:bg-app-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
            >
              Remover {rotuloMinusculo}
            </button>
          </fieldset>
        ))
      )}
      <button
        type="button"
        onClick={adicionarLinha}
        className="min-h-[44px] w-full rounded border border-dashed border-gov-azul px-3 text-sm font-semibold text-gov-azul hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
      >
        + Adicionar {rotuloMinusculo}
      </button>
    </div>
  );
}
