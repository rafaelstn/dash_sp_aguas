import Link from 'next/link';
import type { FichaVisita } from '@/domain/ficha-visita';
import { TIPOS_DOCUMENTO } from '@/domain/tipo-documento';
import { SCHEMAS_FICHA } from '@/domain/fichas/schemas';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import {
  AbasArquivos,
  type AbaArquivos,
} from '@/components/features/arquivos/AbasArquivos';

export interface HistoricoFichasProps {
  prefixo: string;
  fichas: FichaVisita[];
}

/**
 * Lista as fichas digitais do posto agrupadas por tipo de documento,
 * usando a mesma tab bar dos arquivos do HD pra manter consistência
 * visual. Cada aba mostra apenas as fichas daquele tipo, ordenadas por
 * data de visita (mais recente primeiro).
 *
 * Aba só aparece quando há pelo menos 1 ficha do tipo correspondente —
 * tipos zerados não poluem a UI. O botão "+ Nova ficha" no header
 * continua oferecendo TODOS os tipos disponíveis pra criar, mesmo os
 * que ainda não têm ficha alguma.
 */
export function HistoricoFichas({ prefixo, fichas }: HistoricoFichasProps) {
  const tiposDisponiveis = Object.values(SCHEMAS_FICHA).filter(
    (s) => s.disponivel,
  );

  // Agrupa fichas por tipo de documento. Mantém ordem decrescente por
  // data dentro de cada grupo.
  const porTipo = new Map<number, FichaVisita[]>();
  for (const f of fichas) {
    const lista = porTipo.get(f.codTipoDocumento) ?? [];
    lista.push(f);
    porTipo.set(f.codTipoDocumento, lista);
  }
  for (const lista of porTipo.values()) {
    lista.sort(
      (a, b) =>
        b.dataVisita.getTime() - a.dataVisita.getTime() ||
        b.criadaEm.getTime() - a.criadaEm.getTime(),
    );
  }

  // SEMPRE constrói as 7 abas oficiais na mesma ordem (1..7) — mesmo as
  // zeradas — pra manter paridade visual com a tab bar do acervo histórico.
  // Aba vazia mostra estado vazio interno em vez de sumir.
  const abas: AbaArquivos[] = Object.values(TIPOS_DOCUMENTO)
    .sort((a, b) => a.codigo - b.codigo)
    .map((t) => {
      const fichasTipo = porTipo.get(t.codigo) ?? [];
      return {
        id: String(t.codigo),
        rotulo: t.rotulo,
        contagem: fichasTipo.length,
        conteudo:
          fichasTipo.length === 0 ? (
            <EmptyAbaFicha prefixo={prefixo} rotuloTipo={t.rotulo} />
          ) : (
            <ul className="divide-y divide-app-border-subtle rounded-gov-card border border-app-border-subtle bg-app-surface">
              {fichasTipo.map((f) => (
                <li key={f.id}>
                  <CardFicha prefixo={prefixo} ficha={f} />
                </li>
              ))}
            </ul>
          ),
      };
    });

  return (
    <section aria-labelledby="historico-fichas" className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border-subtle pb-2">
        <div className="min-w-0 flex-1">
          <h2
            id="historico-fichas"
            className="text-base font-semibold text-app-fg"
          >
            Histórico de visitas
          </h2>
          <p className="mt-0.5 text-xs text-app-fg-muted tabular">
            {fichas.length > 0 && (
              <>
                <span className="font-medium text-app-fg">
                  {fichas.length.toLocaleString('pt-BR')}
                </span>{' '}
                {fichas.length === 1 ? 'ficha digital' : 'fichas digitais'} em{' '}
                {abas.length} {abas.length === 1 ? 'tipo' : 'tipos'}
                {' · '}
              </>
            )}
            Fichas digitais enviadas pelo app de campo (ou simuladas via
            formulário web), agrupadas pelos mesmos tipos oficiais usados no
            acervo histórico.
          </p>
        </div>
        <NovaFichaDropdown
          prefixo={prefixo}
          tipos={tiposDisponiveis.map((t) => ({
            codigo: t.codigo,
            rotulo: t.rotulo,
          }))}
        />
      </header>

      <AbasArquivos abas={abas} />
    </section>
  );
}

/**
 * Empty state mostrado dentro de uma aba sem fichas daquele tipo.
 * Linka direto pro form de criação do tipo correspondente — atalho
 * rápido pra popular o histórico durante a fase de simulação.
 */
function EmptyAbaFicha({
  rotuloTipo,
}: {
  prefixo: string;
  rotuloTipo: string;
}) {
  return (
    <EstadoVazio
      titulo={`Nenhuma ficha de ${rotuloTipo} ainda`}
      descricao={`Use o botão "+ Nova ficha" acima para criar a primeira ficha de ${rotuloTipo} deste posto, ou aguarde o app de campo começar a enviar.`}
    />
  );
}

function CardFicha({
  prefixo,
  ficha,
}: {
  prefixo: string;
  ficha: FichaVisita;
}) {
  const dataPt = ficha.dataVisita.toLocaleDateString('pt-BR');
  const horario = ficha.horaInicio
    ? ` · ${ficha.horaInicio.slice(0, 5)}`
    : '';
  const detalhesPath = `/postos/${encodeURIComponent(prefixo)}/fichas/${ficha.id}`;

  return (
    <Link
      href={detalhesPath}
      className="block px-3 py-2 hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-app-fg tabular">
          Visita em {dataPt}
          {horario}
        </span>
        <BadgeOrigem origem={ficha.origem} />
        <BadgeStatus status={ficha.status} />
      </div>
      <p className="mt-0.5 truncate text-xs text-app-fg-muted">
        Técnico:{' '}
        <span className="font-medium text-app-fg">{ficha.tecnicoNome}</span>
        {ficha.observacoes ? ` · ${ficha.observacoes}` : ''}
      </p>
    </Link>
  );
}

function BadgeOrigem({ origem }: { origem: FichaVisita['origem'] }) {
  const rotulo: Record<FichaVisita['origem'], string> = {
    web_simulada: 'Simulada (web)',
    app_campo: 'App de campo',
    importacao: 'Importação',
  };
  return (
    <span className="inline-flex items-center rounded border border-app-border-subtle bg-app-surface-2 px-1.5 py-0.5 text-2xs font-medium text-app-fg-muted">
      {rotulo[origem]}
    </span>
  );
}

function BadgeStatus({ status }: { status: FichaVisita['status'] }) {
  const cores: Record<FichaVisita['status'], string> = {
    rascunho: 'border-amber-300 bg-amber-50 text-amber-900',
    enviada: 'border-gov-azul/30 bg-gov-azul-claro text-gov-azul',
    aprovada: 'border-gov-sucesso/30 bg-green-50 text-gov-sucesso',
  };
  const rotulo: Record<FichaVisita['status'], string> = {
    rascunho: 'Rascunho',
    enviada: 'Enviada',
    aprovada: 'Aprovada',
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-medium ${cores[status]}`}
    >
      {rotulo[status]}
    </span>
  );
}

/**
 * Dropdown HTML puro (server-renderable) com os tipos disponíveis.
 * Usei `<details>/<summary>` em vez de menu JS-driven pra evitar Client
 * Component só por causa de um menu — funciona com JS desabilitado.
 */
function NovaFichaDropdown({
  prefixo,
  tipos,
}: {
  prefixo: string;
  tipos: Array<{ codigo: number; rotulo: string }>;
}) {
  if (tipos.length === 0) {
    return (
      <span className="text-xs text-app-fg-muted">
        Nenhum tipo habilitado pra criação ainda.
      </span>
    );
  }

  // Atalho: se só há 1 tipo disponível, faz link direto sem dropdown.
  if (tipos.length === 1) {
    const unico = tipos[0]!;
    return (
      <Link
        href={`/postos/${encodeURIComponent(prefixo)}/fichas/nova/${unico.codigo}`}
        className="inline-flex items-center gap-1 rounded bg-gov-azul px-3 py-1.5 text-xs font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
      >
        <span aria-hidden="true">+</span>
        Nova ficha de {unico.rotulo}
      </Link>
    );
  }

  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded bg-gov-azul px-3 py-1.5 text-xs font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul">
        <span aria-hidden="true">+</span>
        Nova ficha
        <span aria-hidden="true" className="ml-1">▾</span>
      </summary>
      <ul
        className="absolute right-0 z-10 mt-1 min-w-[14rem] rounded-gov-card border border-app-border-subtle bg-white p-1 shadow-gov-card-hover"
        role="menu"
      >
        {tipos.map((t) => (
          <li key={t.codigo} role="none">
            <Link
              href={`/postos/${encodeURIComponent(prefixo)}/fichas/nova/${t.codigo}`}
              role="menuitem"
              className="block rounded px-2 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              {t.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
