import { randomUUID } from 'node:crypto';
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
        <div className="space-y-4">
          <header>
            <h1 className="text-xl font-semibold text-app-fg">Meus favoritos</h1>
            <p className="mt-0.5 text-xs text-app-fg-muted">
              Postos marcados como favoritos aparecem aqui. Para marcar,
              abra a ficha do posto e clique na estrela.
            </p>
          </header>
          <div className="rounded-gov-card border border-dashed border-app-border-subtle bg-app-surface p-8 text-center">
            <p className="font-medium text-app-fg">Nenhum posto favoritado ainda.</p>
            <p className="mt-1 text-xs text-app-fg-muted">
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
      <div className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold text-app-fg">Meus favoritos</h1>
          <p className="mt-0.5 text-xs text-app-fg-muted tabular">
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
  } catch (erro) {
    // Log estruturado server-side para diagnóstico. UUID interno (pseudônimo
    // LGPD) + código curto de correlação que o técnico pode citar no suporte.
    // Não serializar a `causa` para o cliente — pode conter detalhe de infra.
    const codigo = randomUUID().slice(0, 8);
    console.error('[favoritos.page] Falha ao listar favoritos', {
      codigo,
      usuarioId: usuario.id,
      erro,
    });
    return (
      <Alerta
        tipo="erro"
        titulo="Não foi possível carregar os favoritos no momento"
      >
        Tente novamente em instantes. Se o problema persistir, informe o
        código{' '}
        <code className="font-mono font-semibold">{codigo}</code> à equipe
        técnica.
      </Alerta>
    );
  }
}
