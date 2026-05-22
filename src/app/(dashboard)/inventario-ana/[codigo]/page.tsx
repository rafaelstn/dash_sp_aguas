import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import {
  anaRevisaoRepository,
  papeisRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { Alerta } from '@/components/ui/Alerta';
import { BadgeDivergencia } from '@/components/features/inventario-ana/BadgeDivergencia';
import { BadgeStatus } from '@/components/features/inventario-ana/BadgeStatus';
import { ReconciliacaoAnaVsPostos } from '@/components/features/inventario-ana/ReconciliacaoAnaVsPostos';
import { AcoesRevisao } from '@/components/features/inventario-ana/AcoesRevisao';
import { BotaoCadastrarPosto } from '@/components/features/inventario-ana/BotaoCadastrarPosto';
import { BlocoMatchSugerido } from '@/components/features/inventario-ana/BlocoMatchSugerido';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ codigo: string }>;
}

export default async function InventarioAnaDetalhePage({ params }: PageProps) {
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
        Acesso restrito ao papel de aprovador.
      </Alerta>
    );
  }

  const lote = await anaRevisaoRepository.loteAtual();
  if (!lote) {
    return (
      <Alerta tipo="aviso" titulo="Sem inventário carregado">
        Nenhum lote do PROGESTÃO está carregado.
      </Alerta>
    );
  }

  const { codigo } = await params;
  const estacao = await anaRevisaoRepository.obterPorCodigo(lote.id, codigo);
  if (!estacao) notFound();

  // Carrega o posto correspondente (fonte da verdade)
  const posto = estacao.postoPrefixo
    ? await postosRepository.buscarPorPrefixo(estacao.postoPrefixo)
    : null;

  // Match sugerido (quando estação não tem posto vinculado mas sistema
  // calculou candidato por similaridade nome + coord + município).
  let matchSugerido:
    | {
        prefixo: string;
        nome: string | null;
        municipio: string | null;
        confianca: 'alta' | 'media' | 'baixa';
        score: number;
      }
    | null = null;
  if (!posto) {
    matchSugerido = await anaRevisaoRepository.detalheSugestaoMatch(estacao.id);
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Trilha de navegação" className="text-xs text-app-fg-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/inventario-ana" className="text-gov-azul hover:underline">
              Auditoria ANA
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li className="mono">{codigo}</li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border-subtle pb-3">
        <div>
          <p className="text-2xs uppercase tracking-wider text-app-fg-subtle">
            {estacao.estacaoTipo ?? 'Estação ANA'}
          </p>
          <h1 className="text-xl font-semibold text-app-fg">
            {estacao.nome ?? 'Sem nome'}
          </h1>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            Código ANA: <span className="mono">{estacao.codigoAna}</span>
            {estacao.codigoAdicional ? (
              <>
                {' '}· Adicional: <span className="mono">{estacao.codigoAdicional}</span>
              </>
            ) : null}
            {estacao.postoPrefixo ? (
              <>
                {' '}· Match em <Link href={`/postos/${encodeURIComponent(estacao.postoPrefixo)}`} className="mono text-gov-azul hover:underline">{estacao.postoPrefixo}</Link>
              </>
            ) : (
              <>
                {' '}· <span className="text-amber-800">Sem match no banco SP</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BadgeStatus status={estacao.status} />
          <BadgeDivergencia
            divergencia={estacao.divergenciaMunicipio}
            distanciaM={estacao.distanciaMunicipioDeclaradoM}
          />
        </div>
      </header>

      {estacao.observacoes.length > 0 ? (
        <section aria-labelledby="sec-obs" className="rounded-gov-card border border-amber-300 bg-amber-50 p-4">
          <h2 id="sec-obs" className="mb-2 text-sm font-semibold text-amber-900">
            Apontamentos da ANA (auditor)
          </h2>
          <ul className="space-y-1 text-sm text-amber-900">
            {estacao.observacoes.map((obs, i) => (
              <li key={i} className="border-l-2 border-amber-400 pl-2">
                {obs}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {estacao.divergenciaMunicipio === 'divergente' ||
      estacao.divergenciaMunicipio === 'margem_aceitavel' ? (
        <section
          aria-labelledby="sec-geo"
          className={`rounded-gov-card border p-4 ${estacao.divergenciaMunicipio === 'divergente' ? 'border-gov-perigo bg-red-50' : 'border-amber-300 bg-amber-50'}`}
        >
          <h2 id="sec-geo" className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            Município divergente
          </h2>
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-2xs uppercase text-app-fg-muted">Coordenada informada pela ANA</dt>
              <dd className="mono">{estacao.latitude}, {estacao.longitude}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase text-app-fg-muted">Município declarado pela ANA</dt>
              <dd>
                {estacao.municipioNome}
                {estacao.distanciaMunicipioDeclaradoM !== null ? (
                  <span className="ml-2 text-2xs text-app-fg-subtle">
                    ({(estacao.distanciaMunicipioDeclaradoM / 1000).toFixed(1)} km da fronteira)
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-2xs uppercase text-app-fg-muted">Município que de fato contém a coordenada (PostGIS)</dt>
              <dd className="font-semibold text-app-fg">
                {estacao.municipioSugeridoNome ?? '— (coordenada fora de qualquer município SP)'}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <ReconciliacaoAnaVsPostos estacao={estacao} posto={posto} />

      {matchSugerido ? (
        <BlocoMatchSugerido
          codigoAna={estacao.codigoAna}
          postoPrefixo={matchSugerido.prefixo}
          postoNome={matchSugerido.nome}
          postoMunicipio={matchSugerido.municipio}
          confianca={matchSugerido.confianca}
          score={matchSugerido.score}
        />
      ) : null}

      <AcoesRevisao estacao={estacao} />

      {!posto && !matchSugerido ? (
        <section
          aria-labelledby="sec-sem-match"
          className="rounded-gov-card border border-amber-300 bg-amber-50 p-4 space-y-3"
        >
          <h2 id="sec-sem-match" className="text-sm font-semibold text-amber-900">
            Esta estação não está cadastrada como posto SP
          </h2>
          <p className="text-sm text-app-fg">
            A ANA listou no inventário, mas não há registro correspondente em{' '}
            <code className="mono">postos</code>. Cadastre como posto novo (vai
            criar a entrada com origem <code className="mono">ana_promocao_manual</code>{' '}
            e você refina os dados na próxima tela) ou descarte se não for da
            rede SP Águas (use o botão &quot;Descartar&quot; nas ações de revisão).
          </p>
          <BotaoCadastrarPosto estacao={estacao} />
        </section>
      ) : null}

      <p className="text-2xs text-app-fg-subtle">
        Última atualização desta entrada ANA:{' '}
        {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(estacao.atualizadoEm))}
      </p>
    </div>
  );
}
