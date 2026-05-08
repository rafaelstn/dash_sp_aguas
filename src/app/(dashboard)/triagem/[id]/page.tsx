import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  papeisRepository,
  triagemRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { obterFichaTriagem } from '@/application/use-cases/triagem/listar-triagem-pendentes';
import { Alerta } from '@/components/ui/Alerta';
import { BadgeEstado, rotuloEstado } from '@/components/features/triagem/BadgeEstado';
import { LinhaTempoEventos } from '@/components/features/triagem/LinhaTempoEventos';
import { PainelPayload } from '@/components/features/triagem/PainelPayload';
import { BarraAcoesTriagem } from '@/components/features/triagem/BarraAcoesTriagem';
import { rotuloTipoDocumento } from '@/domain/tipo-documento';
import { tempoRelativo } from '@/lib/triagem-api';
import { formatarDataHora } from '@/lib/format';
import type { FichaTriagem } from '@/domain/triagem';
import type { EventoTriagem } from '@/domain/triagem-evento';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InfoLock {
  donoDoLock: boolean;
  outroAprovadorComLock: boolean;
  expiraEm: Date | null;
}

/**
 * `FichaTriagem` não expõe `revisorId` (intencional — repositório não
 * vaza estrutura interna do lock). Inferimos o dono do lock atual a
 * partir do audit trail: o último evento `revisao_iniciada` indica
 * quem está com a ficha em revisão.
 */
function calcularInfoLock(
  ficha: FichaTriagem,
  eventos: ReadonlyArray<EventoTriagem>,
  usuarioId: string,
): InfoLock {
  if (ficha.estado !== 'em_revisao') {
    return { donoDoLock: false, outroAprovadorComLock: false, expiraEm: null };
  }
  const ultimoInicio = [...eventos]
    .filter((e) => e.evento === 'revisao_iniciada')
    .sort((a, b) => b.ocorreuEm.getTime() - a.ocorreuEm.getTime())[0];

  if (!ultimoInicio?.atorId) {
    // estado em_revisao sem evento — caso raro/impossível com o backend
    // do Lucas, mas defendemos: sem informação, assumimos outro aprovador.
    return { donoDoLock: false, outroAprovadorComLock: true, expiraEm: null };
  }

  const donoDoLock = ultimoInicio.atorId === usuarioId;
  // O backend reseta o lock após 1 hora (ADR-0008). Estimamos a expiração
  // somando 1h ao timestamp do evento; se o backend devolvesse o valor
  // exato no GET seria melhor, mas isso é informativo na UI.
  const expiraEm = new Date(ultimoInicio.ocorreuEm.getTime() + 60 * 60 * 1000);

  return {
    donoDoLock,
    outroAprovadorComLock: !donoDoLock,
    expiraEm,
  };
}

export default async function TriagemDetalhePage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return (
      <Alerta tipo="aviso" titulo="Sessão necessária">
        Faça login com uma conta autorizada para acessar a triagem.
      </Alerta>
    );
  }

  const ficha = await obterFichaTriagem(
    triagemRepository,
    papeisRepository,
    id,
    usuario.id,
  );

  if (!ficha) notFound();

  const eventos = await triagemRepository.listarEventos(id);
  const lock = calcularInfoLock(ficha, eventos, usuario.id);
  const ehAprovador = await papeisRepository.ehAprovador(usuario.id);
  const temMFA = ehAprovador
    ? await papeisRepository.temMFAVerificado(usuario.id)
    : false;

  const tipoRotulo = rotuloTipoDocumento(ficha.codTipoDocumento);
  const dataVisitaTexto = ficha.dataVisita.toLocaleDateString('pt-BR');

  return (
    <div className="space-y-4">
      <nav aria-label="Trilha de navegação" className="text-xs text-app-fg-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/triagem" className="text-gov-azul hover:underline">
              Triagem
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li className="mono">{id.slice(0, 8)}</li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border-subtle pb-3">
        <div>
          <p className="text-2xs uppercase tracking-wider text-app-fg-subtle">
            {tipoRotulo}
          </p>
          <h1 className="text-xl font-semibold text-app-fg">
            Visita em {dataVisitaTexto} —{' '}
            <span className="mono">{ficha.prefixo}</span>
          </h1>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            Submetida por {ficha.tecnicoNome} em{' '}
            {formatarDataHora(ficha.criadaEm)} ·{' '}
            {tempoRelativo(ficha.criadaEm)}
          </p>
        </div>
        <BadgeEstado
          estado={ficha.estado}
          rotuloAcessivel={`Estado da ficha: ${rotuloEstado(ficha.estado)}`}
        />
      </header>

      {ficha.fichaOrigemId ? (
        <Alerta tipo="info" titulo="Re-envio após devolução">
          Esta ficha é um re-envio. A versão devolvida originalmente está em{' '}
          <Link
            href={`/triagem/${ficha.fichaOrigemId}`}
            className="font-medium underline"
          >
            ver ficha original
          </Link>
          .
        </Alerta>
      ) : null}

      {ehAprovador && !temMFA ? (
        <Alerta tipo="aviso" titulo="MFA pendente">
          Você possui papel de aprovador, mas ainda não configurou o segundo
          fator de autenticação. Operações críticas (aprovar / rejeitar /
          devolver) exigem MFA verificado.{' '}
          <Link
            href="/perfil/mfa"
            className="font-medium underline"
          >
            Configurar agora
          </Link>
          .
        </Alerta>
      ) : null}

      {ehAprovador ? (
        <BarraAcoesTriagem
          triagemId={ficha.id}
          estado={ficha.estado}
          donoDoLock={lock.donoDoLock}
          outroAprovadorComLock={lock.outroAprovadorComLock}
          lockExpiraEm={lock.expiraEm}
        />
      ) : null}

      {ficha.estado === 'rejeitada' || ficha.estado === 'aprovada' ||
      ficha.estado === 'devolvida' ? (
        <DecisaoFinal ficha={ficha} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Conteúdo da ficha" className="space-y-4">
          <SecaoIdentificacao ficha={ficha} />
          <PainelPayload
            codTipoDocumento={ficha.codTipoDocumento}
            dados={ficha.dados}
            observacoes={ficha.observacoes}
          />
        </section>

        <aside aria-label="Histórico e metadados" className="space-y-4">
          <details
            className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3 lg:sticky lg:top-[calc(var(--altura-header)+1rem)]"
            open
          >
            <summary className="cursor-pointer text-sm font-semibold text-app-fg">
              Linha do tempo
            </summary>
            <div className="mt-3">
              <LinhaTempoEventos eventos={eventos} />
            </div>
          </details>

          <MetadadosFicha ficha={ficha} />
        </aside>
      </div>
    </div>
  );
}

function SecaoIdentificacao({ ficha }: { ficha: FichaTriagem }) {
  const semGps =
    ficha.latitudeCapturada === null || ficha.longitudeCapturada === null;

  const linkMapa = !semGps
    ? `https://www.google.com/maps?q=${ficha.latitudeCapturada},${ficha.longitudeCapturada}`
    : null;

  return (
    <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
      <legend className="px-1 text-sm font-semibold text-app-fg">
        Identificação
      </legend>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        <ItemMeta rotulo="Posto (prefixo)">
          <span className="mono">{ficha.prefixo}</span>
        </ItemMeta>
        <ItemMeta rotulo="Data da visita">
          {ficha.dataVisita.toLocaleDateString('pt-BR')}
        </ItemMeta>
        <ItemMeta rotulo="Hora de início">
          {ficha.horaInicio?.slice(0, 5) ?? 'Não informado'}
        </ItemMeta>
        <ItemMeta rotulo="Hora de término">
          {ficha.horaFim?.slice(0, 5) ?? 'Não informado'}
        </ItemMeta>
        <ItemMeta rotulo="Latitude">
          {ficha.latitudeCapturada !== null
            ? ficha.latitudeCapturada.toFixed(6)
            : 'Não capturada'}
        </ItemMeta>
        <ItemMeta rotulo="Longitude">
          {ficha.longitudeCapturada !== null
            ? ficha.longitudeCapturada.toFixed(6)
            : 'Não capturada'}
        </ItemMeta>
        {ficha.precisaoGpsM !== null ? (
          <ItemMeta rotulo="Precisão GPS">
            ± {ficha.precisaoGpsM.toLocaleString('pt-BR')} m
          </ItemMeta>
        ) : null}
        {linkMapa ? (
          <ItemMeta rotulo="Localização no mapa">
            <a
              href={linkMapa}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gov-azul hover:underline"
            >
              Abrir no Google Maps
            </a>
          </ItemMeta>
        ) : (
          <ItemMeta rotulo="Localização no mapa">
            <span className="text-amber-800">
              Coordenadas não foram capturadas
            </span>
          </ItemMeta>
        )}
      </dl>
    </fieldset>
  );
}

function MetadadosFicha({ ficha }: { ficha: FichaTriagem }) {
  return (
    <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3">
      <legend className="px-1 text-sm font-semibold text-app-fg">
        Metadados
      </legend>
      <dl className="mt-2 space-y-2 text-xs">
        <div>
          <dt className="text-app-fg-muted">ID da ficha</dt>
          <dd className="mono break-all text-app-fg">{ficha.id}</dd>
        </div>
        <div>
          <dt className="text-app-fg-muted">Origem</dt>
          <dd className="text-app-fg">{ficha.origem}</dd>
        </div>
        <div>
          <dt className="text-app-fg-muted">Atualizada em</dt>
          <dd className="text-app-fg tabular">
            {formatarDataHora(ficha.atualizadaEm)}
          </dd>
        </div>
        {ficha.fichaVisitaId ? (
          <div>
            <dt className="text-app-fg-muted">Promovida para</dt>
            <dd className="text-app-fg">
              <Link
                href={`/postos/${encodeURIComponent(ficha.prefixo)}/fichas/${ficha.fichaVisitaId}`}
                className="text-gov-azul hover:underline"
              >
                Ver ficha de produção
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
    </fieldset>
  );
}

function DecisaoFinal({ ficha }: { ficha: FichaTriagem }) {
  const titulo =
    ficha.estado === 'aprovada'
      ? 'Ficha aprovada'
      : ficha.estado === 'rejeitada'
        ? 'Ficha rejeitada'
        : 'Ficha devolvida ao técnico';
  const tipo =
    ficha.estado === 'aprovada'
      ? 'sucesso'
      : ficha.estado === 'rejeitada'
        ? 'erro'
        : 'aviso';
  return (
    <Alerta tipo={tipo as 'sucesso' | 'erro' | 'aviso'} titulo={titulo}>
      <div className="space-y-1">
        {ficha.decididaEm ? (
          <p>
            Decidida em {formatarDataHora(ficha.decididaEm)}.
          </p>
        ) : null}
        {ficha.motivoDecisao ? (
          <p>
            <strong>Motivo:</strong>{' '}
            <span className="whitespace-pre-wrap">{ficha.motivoDecisao}</span>
          </p>
        ) : null}
      </div>
    </Alerta>
  );
}

function ItemMeta({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wider text-app-fg-subtle">
        {rotulo}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-app-fg break-words">
        {children}
      </dd>
    </div>
  );
}
