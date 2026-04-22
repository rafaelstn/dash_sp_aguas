import type { ReactNode } from 'react';

export interface EstadoVazioProps {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}

export function EstadoVazio({ titulo, descricao, acao }: EstadoVazioProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      <h2 className="text-lg font-semibold text-gov-texto">{titulo}</h2>
      {descricao && <p className="mt-2 text-gov-muted">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}
