'use client';

import type { CampoFicha } from '@/domain/fichas/schemas';

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
      case 'texto':
        return (
          <input
            id={idCampo}
            type="text"
            inputMode="text"
            autoComplete="off"
            value={valorString}
            onChange={(e) => onChange(campo.chave, e.target.value)}
            className={inputClass}
            aria-required={obrigatorio || undefined}
            aria-invalid={erro ? true : undefined}
            aria-describedby={describedBy}
          />
        );

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
            className={inputClass}
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
