import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  papeisRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { Alerta } from '@/components/ui/Alerta';
import { FormularioEditarPosto } from '@/components/features/postos/FormularioEditarPosto';
import { HistoricoPostoEventos } from '@/components/features/postos/HistoricoPostoEventos';
import { logger } from '@/infrastructure/logging/logger';
import type { Posto } from '@/domain/posto';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ prefixo: string }>;
}

export default async function EditarPostoPage({ params }: PageProps) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return (
      <Alerta tipo="aviso" titulo="Sessão necessária">
        Acesse o sistema com uma conta autorizada.
      </Alerta>
    );
  }
  const ehAprovador = await papeisRepository.ehAprovador(usuario.id);
  if (!ehAprovador) {
    return (
      <Alerta tipo="aviso" titulo="Acesso restrito">
        Acesso restrito ao papel de aprovador. Solicite ao gestor.
      </Alerta>
    );
  }

  const { prefixo: prefixoRaw } = await params;
  const prefixo = decodeURIComponent(prefixoRaw);

  let posto: Posto | null;
  try {
    posto = await postosRepository.buscarPorPrefixo(prefixo);
  } catch (e) {
    logger.error(
      'erro_inesperado',
      { rota: '/postos/[prefixo]/editar', prefixo, usuarioId: usuario.id, erro: String(e) },
      'Falha ao carregar posto para edição',
    );
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar o posto">
        Não foi possível recuperar o cadastro deste posto agora. Tente
        novamente em alguns instantes.
      </Alerta>
    );
  }
  if (!posto) notFound();

  return (
    // Tela de formulário: largura de leitura para não esticar os campos em
    // telas largas (o chrome agora é full-width por padrão).
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <nav aria-label="Trilha de navegação" className="text-xs text-app-fg-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="text-gov-azul hover:underline">
              Postos
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link href={`/postos/${encodeURIComponent(prefixo)}`} className="mono text-gov-azul hover:underline">
              {prefixo}
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>Editar</li>
        </ol>
      </nav>

      <header>
        <h1 className="text-xl font-semibold text-app-fg">
          Editar posto <span className="mono">{prefixo}</span>
        </h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          {posto.nomeEstacao ?? 'Sem nome'} ·{' '}
          {posto.municipio ?? 'Sem município'} · Origem: {posto.origem ?? '—'}
        </p>
        {posto.deletedAt ? (
          <Alerta tipo="aviso" titulo="Posto removido">
            Este posto foi marcado como removido em{' '}
            {new Intl.DateTimeFormat('pt-BR').format(posto.deletedAt)}. Restaure
            pela API antes de editar.
          </Alerta>
        ) : null}
      </header>

      <FormularioEditarPosto posto={posto} />

      <HistoricoPostoEventos postoId={posto.id} />

      <p className="text-2xs text-app-fg-muted">
        Toda alteração é registrada em <code className="mono">postos_evento</code> com
        timestamp, IP e identificação do aprovador (governo.md §4 LGPD).
      </p>
    </div>
  );
}
