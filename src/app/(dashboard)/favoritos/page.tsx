import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ListaResultados } from '@/components/features/busca/ListaResultados';
import { Alerta } from '@/components/ui/Alerta';
import {
  favoritosRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { listarFavoritos } from '@/application/use-cases/listar-favoritos';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Meus favoritos — Ficha Técnica SPÁguas',
};

export default async function PaginaFavoritos() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/login?returnTo=/favoritos');
  }

  try {
    const itens = await listarFavoritos(
      favoritosRepository,
      postosRepository,
      usuario.id,
    );
    const postos = itens.map((i) => i.posto);
    const prefixosFavoritos = new Set(postos.map((p) => p.prefixo));

    if (postos.length === 0) {
      return (
        <div className="space-y-6">
          <header>
            <h1 className="text-display font-bold text-gov-texto">
              Meus favoritos
            </h1>
            <p className="mt-1 text-gov-muted">
              Postos marcados como favoritos aparecem aqui. Para marcar,
              abra a ficha do posto e clique na estrela.
            </p>
          </header>
          <div className="border border-dashed border-gov-borda rounded-gov-card bg-white p-8 text-center">
            <p className="text-gov-texto font-medium">
              Nenhum posto favoritado ainda.
            </p>
            <p className="text-sm text-gov-muted mt-1">
              Comece pela{' '}
              <Link href="/" className="text-gov-azul hover:underline">
                busca de postos
              </Link>
              .
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-display font-bold text-gov-texto">
            Meus favoritos
          </h1>
          <p className="mt-1 text-sm text-gov-muted">
            {postos.length.toLocaleString('pt-BR')}{' '}
            {postos.length === 1 ? 'posto favoritado' : 'postos favoritados'}
          </p>
        </header>
        <ListaResultados
          itens={postos}
          total={postos.length}
          termo=""
          prefixosFavoritos={prefixosFavoritos}
          autenticado
        />
      </div>
    );
  } catch {
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar favoritos">
        Tente novamente em instantes.
      </Alerta>
    );
  }
}
