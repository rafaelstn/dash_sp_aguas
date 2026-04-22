import { Abas } from '@/components/features/desconformidades/Abas';
import { desconformidadesRepository } from '@/infrastructure/db/desconformidades-repository.pg';
import { contarDesconformidades } from '@/application/use-cases/listar-desconformidades';

export const dynamic = 'force-dynamic';

export default async function LayoutDesconformidades({
  children,
}: {
  children: React.ReactNode;
}) {
  const contagens = await contarDesconformidades(desconformidadesRepository);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-gov-texto">
          Desconformidades cadastrais
        </h2>
        <p className="mt-2 text-sm text-gov-muted max-w-3xl">
          Identificamos registros e arquivos cujo formato diverge do padrão oficial
          fornecido pelo cliente em 22 de abril de 2026. O sistema apresenta
          sugestões de correção para orientar a curadoria manual da planilha-fonte.
          Nenhuma alteração cadastral é aplicada automaticamente.
        </p>
      </header>

      <Abas contagens={contagens} />

      <div className="mt-4">{children}</div>
    </div>
  );
}
