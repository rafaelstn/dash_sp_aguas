import { type InputHTMLAttributes, forwardRef, useId } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
  descricao?: string;
  erro?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { rotulo, descricao, erro, id, className = '', ...rest },
  ref,
) {
  const geradoId = useId();
  const inputId = id ?? `in-${geradoId}`;
  const descId = descricao ? `${inputId}-desc` : undefined;
  const errId = erro ? `${inputId}-err` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-medium text-gov-texto">
        {rotulo}
      </label>
      {descricao && (
        <span id={descId} className="text-sm text-gov-muted">
          {descricao}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-describedby={[descId, errId].filter(Boolean).join(' ') || undefined}
        aria-invalid={erro ? true : undefined}
        className={`px-3 py-2 border border-gov-borda rounded bg-white text-gov-texto placeholder:text-gov-muted ${className}`}
        {...rest}
      />
      {erro && (
        <span id={errId} role="alert" className="text-sm text-gov-perigo">
          {erro}
        </span>
      )}
    </div>
  );
});
