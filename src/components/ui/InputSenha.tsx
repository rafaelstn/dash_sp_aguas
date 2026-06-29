import { type InputHTMLAttributes, forwardRef, useId, useState } from 'react';

export interface InputSenhaProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  rotulo: string;
  descricao?: string;
  erro?: string;
}

/**
 * Campo de senha padrão do sistema, com botão de mostrar/ocultar (olho).
 * Reaproveita os tokens e a estrutura do `Input` (borda, ring de foco,
 * erro em `gov-perigo`, label, descrição e mensagem de erro).
 *
 * Acessibilidade (e-MAG / WCAG 2.1 AA):
 * - botão `type="button"` para não submeter o formulário;
 * - `aria-label` alterna entre "Mostrar senha" e "Ocultar senha";
 * - `aria-pressed` reflete o estado de visibilidade;
 * - foco visível no botão; o ícone do olho é `aria-hidden`;
 * - `autoComplete` continua sob controle de quem usa o componente.
 */
export const InputSenha = forwardRef<HTMLInputElement, InputSenhaProps>(
  function InputSenha({ rotulo, descricao, erro, id, className = '', ...rest }, ref) {
    const geradoId = useId();
    const inputId = id ?? `pw-${geradoId}`;
    const descId = descricao ? `${inputId}-desc` : undefined;
    const errId = erro ? `${inputId}-err` : undefined;
    const [visivel, setVisivel] = useState(false);

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="font-medium text-app-fg">
          {rotulo}
        </label>
        {descricao && (
          <span id={descId} className="text-sm text-app-fg-muted">
            {descricao}
          </span>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visivel ? 'text' : 'password'}
            aria-describedby={
              [descId, errId].filter(Boolean).join(' ') || undefined
            }
            aria-invalid={erro ? true : undefined}
            className={`w-full pl-3 pr-11 py-2 border rounded bg-app-surface text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface ${
              erro
                ? 'border-gov-perigo focus-visible:ring-gov-perigo'
                : 'border-app-border-input focus-visible:ring-gov-azul'
            } ${className}`}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisivel((v) => !v)}
            aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={visivel}
            aria-controls={inputId}
            disabled={rest.disabled}
            className="absolute inset-y-0 right-0 flex items-center justify-center w-10 text-app-fg-muted hover:text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface focus-visible:ring-gov-azul rounded-r disabled:cursor-not-allowed disabled:opacity-50"
          >
            {visivel ? (
              // Olho aberto com risco (ocultar)
              <svg
                aria-hidden="true"
                focusable="false"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              // Olho aberto (mostrar)
              <svg
                aria-hidden="true"
                focusable="false"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {erro && (
          <span id={errId} role="alert" className="text-sm text-gov-perigo">
            {erro}
          </span>
        )}
      </div>
    );
  },
);
