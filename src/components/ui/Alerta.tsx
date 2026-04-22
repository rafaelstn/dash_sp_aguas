import type { ReactNode } from 'react';

type Tipo = 'info' | 'aviso' | 'erro' | 'sucesso';

const classes: Record<Tipo, { container: string; role: 'status' | 'alert' }> = {
  info: { container: 'bg-blue-50 border-blue-300 text-blue-900', role: 'status' },
  aviso: { container: 'bg-amber-50 border-amber-300 text-amber-900', role: 'status' },
  erro: { container: 'bg-red-50 border-gov-perigo text-gov-perigo', role: 'alert' },
  sucesso: { container: 'bg-green-50 border-gov-sucesso text-gov-sucesso', role: 'status' },
};

export interface AlertaProps {
  tipo?: Tipo;
  titulo: string;
  children?: ReactNode;
}

export function Alerta({ tipo = 'info', titulo, children }: AlertaProps) {
  const { container, role } = classes[tipo];
  return (
    <div role={role} className={`border-l-4 p-4 rounded ${container}`}>
      <p className="font-semibold">{titulo}</p>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  );
}
