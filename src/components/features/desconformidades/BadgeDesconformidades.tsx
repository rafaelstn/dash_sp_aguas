import { desconformidadesRepository } from '@/infrastructure/repositories';
import { contarDesconformidades } from '@/application/use-cases/listar-desconformidades';

/**
 * Server Component que lê a contagem total de desconformidades e renderiza
 * um badge discreto no menu. Renderização silenciosa em caso de erro
 * (o menu permanece funcional sem o badge).
 */
export async function BadgeDesconformidades() {
  try {
    const c = await contarDesconformidades(desconformidadesRepository);
    const total = c.prefixoPrincipal + c.prefixoAna + c.arquivosOrfaos + c.arquivosMalformados;
    if (total === 0) return null;

    return (
      <span
        className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 rounded-full bg-white text-gov-azul text-xs font-semibold"
        aria-label={`${total} desconformidades registradas`}
      >
        {total.toLocaleString('pt-BR')}
      </span>
    );
  } catch {
    return null;
  }
}
