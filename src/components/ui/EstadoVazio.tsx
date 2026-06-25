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
  /**
   * Nível do título (1 a 3). Default 2: assume um `<h1>` ancestral na página.
   * Use 1 quando o estado vazio for o conteúdo único de uma rota sem outro
   * heading, para não criar salto de nível (WCAG 1.3.1 / 2.4.6).
   */
  nivelTitulo?: 1 | 2 | 3;
}

export function EstadoVazio({
  titulo,
  descricao,
  acao,
  icone: Icone,
  nivelTitulo = 2,
}: EstadoVazioProps) {
  const Titulo = `h${nivelTitulo}` as const;
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
      <Titulo className="text-lg font-semibold text-app-fg">{titulo}</Titulo>
      {descricao && <p className="mt-2 max-w-md text-app-fg-muted">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}
