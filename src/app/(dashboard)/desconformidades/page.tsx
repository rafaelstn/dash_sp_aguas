import { redirect } from 'next/navigation';

export default function PaginaDesconformidadesRaiz() {
  // A raiz /desconformidades redireciona para a primeira aba, mantendo
  // a URL consistente com o tabpanel ativo.
  redirect('/desconformidades/prefixo-principal');
}
