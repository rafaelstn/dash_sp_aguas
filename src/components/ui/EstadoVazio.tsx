import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface EstadoVazioProps {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  /**
   * Ícone lucide opcional, exibido em tom sóbrio acima do título. Mantém o
   * estado vazio com identidade visual sem recorrer a ilustração genérica.
   */
  icone?: LucideIcon;
}

export function EstadoVazio({ titulo, descricao, acao, icone: Icone }: EstadoVazioProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center px-4 py-12 text-center"
    >
      {Icone ? (
        <span
          className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-app-surface-2 text-app-fg-subtle"
          aria-hidden="true"
        >
          <Icone className="h-5 w-5" strokeWidth={2} />
        </span>
      ) : null}
      <h2 className="text-lg font-semibold text-app-fg">{titulo}</h2>
      {descricao && <p className="mt-2 max-w-md text-app-fg-muted">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}
