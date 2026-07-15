import { redirect } from 'next/navigation';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { VisaoEtiquetas } from '@/components/features/estoque/VisaoEtiquetas';
import { ehUnidadeFisica } from '@/domain/estoque/local';
import { ehEstadoValido } from '@/domain/estoque/estado';
import { ehStatusValido } from '@/domain/estoque/status-unidade';
import type { FiltrosEtiquetasUI } from '@/components/features/estoque/api';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Etiquetas de patrimônio — SP Águas - DMO',
};

/**
 * Visao de impressao das etiquetas/QR do conjunto serializado FILTRADO. Le os
 * filtros da querystring (os mesmos da aba serializada do Estoque) no servidor,
 * sanea com os guards do dominio e propaga ao componente cliente, que busca os
 * itens em `/api/estoque/unidades/etiquetas` e monta a grade imprimivel.
 * Leitura: qualquer usuario logado; a autorizacao real vive no backend.
 */
export default async function PaginaEtiquetas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/login');
  }

  const sp = await searchParams;
  const primeiro = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const unidade = primeiro(sp.unidade);
  const estado = primeiro(sp.estado);
  const status = primeiro(sp.status);
  const filtros: FiltrosEtiquetasUI = {
    unidade: ehUnidadeFisica(unidade) ? unidade : undefined,
    local: primeiro(sp.local) || undefined,
    estado: ehEstadoValido(estado) ? estado : undefined,
    status: ehStatusValido(status) ? status : undefined,
    materialId: primeiro(sp.materialId) || undefined,
    busca: primeiro(sp.busca)?.trim() || undefined,
  };

  return <VisaoEtiquetas filtros={filtros} />;
}
