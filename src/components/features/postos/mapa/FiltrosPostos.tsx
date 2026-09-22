'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import {
  OPCOES_VAZAO,
  SITUACOES_POSTO,
  TIPOS_POSTO_MAPA,
  TRANSMISSOES,
  UF_DO_ESTADO,
  type FacetasMapa,
  type OpcaoVazao,
  type SituacaoPosto,
  type TipoPostoMapa,
  type Transmissao,
} from '@/domain/mapa-postos';
import { GlifoPosto } from './GlifoPosto';
import { ESTILO_TIPO, ROTULO_SITUACAO, ROTULO_TRANSMISSAO, ROTULO_VAZAO } from './simbolos';
import { rotuloUgrhi } from './ugrhis';
import {
  contarFiltrosAtivos,
  UF_TODAS,
  type EstadoTela,
  type UfSelecionada,
  type UgrhiSelecionada,
} from './estado-url';

/**
 * Filtros da tela Postos.
 *
 * As contagens daqui são do TOTAL do filtro (a lista inteira, sem olhar o
 * enquadramento do mapa), em contagem cruzada: cada opção diz quantos postos a
 * pessoa teria marcando-a. A legenda do mapa conta outra coisa, o que está na
 * área visível, e diz isso no título.
 *
 * No celular os filtros moram numa folha de tela cheia; no desktop, numa linha
 * acima do mapa. Os dois leem e escrevem o mesmo estado.
 */

export type MudancaFiltros = Partial<
  Pick<EstadoTela, 'tipos' | 'situacoes' | 'transmissoes' | 'vazao' | 'ugrhi' | 'uf'>
>;

interface FiltrosPostosProps {
  readonly estado: EstadoTela;
  readonly facetas: FacetasMapa | null;
  readonly totalFiltrado: number;
  readonly aoMudar: (mudanca: MudancaFiltros) => void;
  readonly aoLimpar: () => void;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

function alternar<T>(lista: readonly T[], valor: T, ordem: readonly T[]): T[] {
  const nova = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  return ordem.filter((v) => nova.includes(v));
}

function valorUgrhi(u: UgrhiSelecionada): string {
  return u === null ? '' : String(u);
}

function lerUgrhi(valor: string): UgrhiSelecionada {
  if (valor === '') return null;
  if (valor === 'sem') return 'sem';
  return Number(valor);
}

const classeChip = (ativo: boolean) =>
  `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-150 ease-gov-ease focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul ${
    ativo
      ? 'bg-gov-azul-claro text-gov-azul-escuro font-medium'
      : 'bg-app-surface text-app-fg-muted ring-1 ring-inset ring-app-border hover:bg-app-surface-2 hover:text-app-fg'
  }`;

const classeSelect =
  'h-8 rounded-md border border-app-border-input bg-app-surface pl-2.5 pr-8 text-sm text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gov-azul';

/**
 * Opções de UGRHI com a contagem cruzada.
 *
 * A opção de resgate (`selecionadaAusente`) existe pelo mesmo motivo da de UF:
 * enquanto `facetas` é `null` a lista não tem nenhuma UGRHI, e um `<select>`
 * controlado com `value="7"` sem `<option>` correspondente fica com
 * `selectedIndex = -1`, ou seja, em branco. O filtro segue aplicado, porque o
 * estado vem da URL, e o controle mostrava o contrário: abrir `/?ugrhi=7` com a
 * rede lenta, ou com o banco do órgão fora, deixava o campo vazio com o recorte
 * ativo, e o leitor de tela anunciava "sem seleção". Com os dados prontos a
 * opção marcada já vem semeada com total zero por `src/domain/mapa-postos.ts`,
 * então esta guarda só entra em cena no estado de carga e no de erro.
 */
function OpcoesUgrhi({ facetas, estado }: { facetas: FacetasMapa | null; estado: EstadoTela }) {
  const lista = facetas?.ugrhi ?? [];
  const numeradas = lista.filter((u) => u.numero !== null);
  const sem = lista.find((u) => u.numero === null);
  const selecionadaAusente =
    typeof estado.ugrhi === 'number' && !numeradas.some((u) => u.numero === estado.ugrhi);
  return (
    <>
      <option value="">Todas as UGRHIs</option>
      {numeradas.map((u) => (
        <option key={u.numero} value={String(u.numero)}>
          {rotuloUgrhi(u.numero)} ({fmt(u.total)})
        </option>
      ))}
      {selecionadaAusente && (
        <option value={String(estado.ugrhi)}>{rotuloUgrhi(estado.ugrhi as number)} (0)</option>
      )}
      <option value="sem">Sem UGRHI ({fmt(sem?.total ?? 0)})</option>
    </>
  );
}

const NOMES_UF: Readonly<Record<string, string>> = { SP: 'São Paulo' };

function valorUf(u: UfSelecionada): string {
  if (u === null) return UF_TODAS;
  return u;
}

function lerUfOpcao(valor: string): UfSelecionada {
  return valor === UF_TODAS ? null : valor;
}

/** Opções de UF com a contagem cruzada; "Sem UF" sempre aparece, mesmo zerada, para a opção não sumir. */
function OpcoesUf({ facetas, estado }: { facetas: FacetasMapa | null; estado: EstadoTela }) {
  const lista = facetas?.uf ?? [];
  const siglas = lista.filter((u): u is { uf: string; total: number } => u.uf !== null);
  const sem = lista.find((u) => u.uf === null);
  const selecionadaAusente =
    typeof estado.uf === 'string' && estado.uf !== 'sem' && !siglas.some((u) => u.uf === estado.uf);
  const total = lista.reduce((s, u) => s + u.total, 0);
  return (
    <>
      <option value={UF_TODAS}>Todos os estados{facetas ? ` (${fmt(total)})` : ''}</option>
      {siglas.map((u) => (
        <option key={u.uf} value={u.uf}>
          {NOMES_UF[u.uf] ?? u.uf} ({fmt(u.total)})
        </option>
      ))}
      {selecionadaAusente && <option value={estado.uf as string}>{estado.uf} (0)</option>}
      <option value="sem">Sem UF ({fmt(sem?.total ?? 0)})</option>
    </>
  );
}

function OpcoesVazao({ facetas, vazio }: { facetas: FacetasMapa | null; vazio: string }) {
  return (
    <>
      <option value="">{vazio}</option>
      {OPCOES_VAZAO.map((v) => (
        <option key={v} value={v}>
          {ROTULO_VAZAO[v]}
          {facetas ? ` (${fmt(facetas.vazao[v])})` : ''}
        </option>
      ))}
    </>
  );
}

export function ChipsTipo({
  estado,
  facetas,
  aoMudar,
}: Pick<FiltrosPostosProps, 'estado' | 'facetas' | 'aoMudar'>) {
  return (
    <>
      {TIPOS_POSTO_MAPA.map((t) => {
        const ativo = estado.tipos.includes(t);
        return (
          <button
            key={t}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoMudar({ tipos: alternar(estado.tipos, t, TIPOS_POSTO_MAPA) })}
            className={classeChip(ativo)}
          >
            <GlifoPosto tipo={t} tamanho={10} />
            {ESTILO_TIPO[t].plural}
            {facetas && (
              <span className="tabular-nums text-app-fg-muted">{fmt(facetas.tipo[t])}</span>
            )}
          </button>
        );
      })}
    </>
  );
}

function ChipsSituacao({
  estado,
  facetas,
  aoMudar,
}: Pick<FiltrosPostosProps, 'estado' | 'facetas' | 'aoMudar'>) {
  return (
    <>
      {SITUACOES_POSTO.map((s) => {
        const ativo = estado.situacoes.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoMudar({ situacoes: alternar(estado.situacoes, s, SITUACOES_POSTO) })}
            className={classeChip(ativo)}
          >
            <GlifoSituacao extinto={s === 'extinto'} />
            {ROTULO_SITUACAO[s]}
            {facetas && (
              <span className="tabular-nums text-app-fg-muted">{fmt(facetas.situacao[s])}</span>
            )}
          </button>
        );
      })}
    </>
  );
}

export function GlifoSituacao({ extinto }: { extinto: boolean }) {
  return (
    <svg aria-hidden="true" focusable="false" width="10" height="10" viewBox="0 0 12 12" className="shrink-0">
      <circle
        cx="6"
        cy="6"
        r="4.3"
        fill={extinto ? '#FFFFFF' : '#4B5563'}
        stroke="#4B5563"
        strokeWidth={extinto ? 1.8 : 0}
      />
    </svg>
  );
}

/** Transmissão em lista suspensa com caixas de marcação: é a única dimensão com mais de uma escolha fora dos chips. */
function MenuTransmissao({
  estado,
  facetas,
  aoMudar,
}: Pick<FiltrosPostosProps, 'estado' | 'facetas' | 'aoMudar'>) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idPainel = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    // Escape no documento, em captura, para o atalho global nao agir antes; so vale com o foco dentro do menu.
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!raiz.current?.contains(document.activeElement)) return;
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      botao.current?.focus();
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', escape, true);
    };
  }, [aberto]);

  const marcadas = estado.transmissoes;
  const rotulo =
    marcadas.length === 0
      ? 'Transmissão'
      : marcadas.length === 1
        ? ROTULO_TRANSMISSAO[marcadas[0]!]
        : `Transmissão (${marcadas.length})`;

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={idPainel}
        onClick={() => setAberto((a) => !a)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border bg-app-surface px-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gov-azul ${
          marcadas.length ? 'border-gov-azul text-gov-azul-escuro' : 'border-app-border-input text-app-fg'
        }`}
      >
        {rotulo}
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {aberto && (
        <fieldset
          id={idPainel}
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md bg-app-surface p-2 shadow-gov-card-hover ring-1 ring-app-border-subtle"
        >
          <legend className="sr-only">Transmissão</legend>
          <CaixasTransmissao estado={estado} facetas={facetas} aoMudar={aoMudar} />
        </fieldset>
      )}
    </div>
  );
}

function CaixasTransmissao({
  estado,
  facetas,
  aoMudar,
}: Pick<FiltrosPostosProps, 'estado' | 'facetas' | 'aoMudar'>) {
  return (
    <>
      {TRANSMISSOES.map((t) => (
        <LinhaMarcacao
          key={t}
          tipo="checkbox"
          nome="transmissao"
          marcado={estado.transmissoes.includes(t)}
          aoMudar={() => aoMudar({ transmissoes: alternar(estado.transmissoes, t, TRANSMISSOES) })}
          rotulo={ROTULO_TRANSMISSAO[t]}
          contagem={facetas?.transmissao[t]}
        />
      ))}
    </>
  );
}

function LinhaMarcacao({
  tipo,
  nome,
  marcado,
  aoMudar,
  rotulo,
  contagem,
  glifo,
}: {
  tipo: 'checkbox' | 'radio';
  nome: string;
  marcado: boolean;
  aoMudar: () => void;
  rotulo: string;
  contagem?: number;
  glifo?: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 text-sm text-app-fg hover:bg-app-surface-2 md:min-h-9">
      <input
        type={tipo}
        name={nome}
        checked={marcado}
        onChange={aoMudar}
        className="h-4 w-4 shrink-0 accent-gov-azul"
      />
      {glifo}
      <span className="flex-1">{rotulo}</span>
      {contagem !== undefined && (
        <span className="tabular-nums text-app-fg-muted">{fmt(contagem)}</span>
      )}
    </label>
  );
}

/** Linha de filtros do desktop. */
export function FiltrosDesktop({ estado, facetas, aoMudar, aoLimpar }: FiltrosPostosProps) {
  const idVazao = useId();
  const idUgrhi = useId();
  const idUf = useId();
  const ativos = contarFiltrosAtivos(estado);
  return (
    <div className="hidden space-y-2 md:block">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tipo e situação">
        <ChipsTipo estado={estado} facetas={facetas} aoMudar={aoMudar} />
        <span className="mx-1 h-5 w-px bg-app-border" aria-hidden="true" />
        <ChipsSituacao estado={estado} facetas={facetas} aoMudar={aoMudar} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idVazao} className="text-sm text-app-fg-muted">
          Vazão
        </label>
        <select
          id={idVazao}
          value={estado.vazao ?? ''}
          onChange={(e) => aoMudar({ vazao: (e.target.value || null) as OpcaoVazao | null })}
          className={`${classeSelect} ${estado.vazao ? 'border-gov-azul text-gov-azul-escuro' : ''}`}
        >
          <OpcoesVazao facetas={facetas} vazio="Sem filtro" />
        </select>
        <MenuTransmissao estado={estado} facetas={facetas} aoMudar={aoMudar} />
        <label htmlFor={idUf} className="sr-only">
          UF
        </label>
        <select
          id={idUf}
          value={valorUf(estado.uf)}
          onChange={(e) => aoMudar({ uf: lerUfOpcao(e.target.value) })}
          className={`${classeSelect} ${estado.uf !== UF_DO_ESTADO ? 'border-gov-azul text-gov-azul-escuro' : ''}`}
        >
          <OpcoesUf facetas={facetas} estado={estado} />
        </select>
        <label htmlFor={idUgrhi} className="sr-only">
          UGRHI
        </label>
        <select
          id={idUgrhi}
          value={valorUgrhi(estado.ugrhi)}
          onChange={(e) => aoMudar({ ugrhi: lerUgrhi(e.target.value) })}
          className={`${classeSelect} max-w-[20rem] ${estado.ugrhi !== null ? 'border-gov-azul text-gov-azul-escuro' : ''}`}
        >
          <OpcoesUgrhi facetas={facetas} estado={estado} />
        </select>
        {ativos > 0 && (
          <button
            type="button"
            onClick={aoLimpar}
            className="rounded px-1.5 text-sm text-gov-azul underline underline-offset-2 hover:text-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}

/** Botão e folha de filtros do celular. */
export function FiltrosCelular({ estado, facetas, totalFiltrado, aoMudar, aoLimpar }: FiltrosPostosProps) {
  const [aberto, setAberto] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idTitulo = useId();
  const idUgrhi = useId();
  const idUf = useId();
  const ativos = contarFiltrosAtivos(estado);

  useEffect(() => {
    const dlg = dialogo.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => dlg.querySelector<HTMLButtonElement>('button[data-fechar]')?.focus());
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  const fechar = () => {
    setAberto(false);
    botao.current?.focus();
  };

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-app-surface px-3.5 text-sm font-medium text-app-fg ring-1 ring-inset ring-app-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filtros
        {ativos > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gov-azul px-1 text-2xs font-semibold text-white">
            {ativos}
            <span className="sr-only"> ativos</span>
          </span>
        )}
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby={idTitulo}
        onCancel={(e) => {
          e.preventDefault();
          fechar();
        }}
        onClose={() => aberto && setAberto(false)}
        className="m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-black/40 md:hidden"
      >
        <div className="flex h-full flex-col bg-app-surface text-app-fg">
          <header className="flex items-center gap-3 border-b border-app-border-subtle px-4 py-3">
            <h2 id={idTitulo} className="flex-1 text-lg font-semibold">
              Filtros
            </h2>
            <button
              type="button"
              data-fechar
              onClick={fechar}
              aria-label="Fechar filtros"
              className="grid h-11 w-11 place-items-center rounded text-app-fg-muted hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="relative min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <Grupo titulo="Tipo">
              {TIPOS_POSTO_MAPA.map((t: TipoPostoMapa) => (
                <LinhaMarcacao
                  key={t}
                  tipo="checkbox"
                  nome="tipo"
                  marcado={estado.tipos.includes(t)}
                  aoMudar={() => aoMudar({ tipos: alternar(estado.tipos, t, TIPOS_POSTO_MAPA) })}
                  rotulo={ESTILO_TIPO[t].plural}
                  contagem={facetas?.tipo[t]}
                  glifo={<GlifoPosto tipo={t} tamanho={12} />}
                />
              ))}
            </Grupo>
            <Grupo titulo="Situação">
              {SITUACOES_POSTO.map((s: SituacaoPosto) => (
                <LinhaMarcacao
                  key={s}
                  tipo="checkbox"
                  nome="situacao"
                  marcado={estado.situacoes.includes(s)}
                  aoMudar={() => aoMudar({ situacoes: alternar(estado.situacoes, s, SITUACOES_POSTO) })}
                  rotulo={ROTULO_SITUACAO[s]}
                  contagem={facetas?.situacao[s]}
                  glifo={<GlifoSituacao extinto={s === 'extinto'} />}
                />
              ))}
            </Grupo>
            <Grupo titulo="Transmissão">
              {TRANSMISSOES.map((t: Transmissao) => (
                <LinhaMarcacao
                  key={t}
                  tipo="checkbox"
                  nome="transmissao"
                  marcado={estado.transmissoes.includes(t)}
                  aoMudar={() => aoMudar({ transmissoes: alternar(estado.transmissoes, t, TRANSMISSOES) })}
                  rotulo={ROTULO_TRANSMISSAO[t]}
                  contagem={facetas?.transmissao[t]}
                />
              ))}
            </Grupo>
            <Grupo titulo="Vazão">
              <LinhaMarcacao
                tipo="radio"
                nome="vazao"
                marcado={estado.vazao === null}
                aoMudar={() => aoMudar({ vazao: null })}
                rotulo="Sem filtro"
              />
              {OPCOES_VAZAO.map((v) => (
                <LinhaMarcacao
                  key={v}
                  tipo="radio"
                  nome="vazao"
                  marcado={estado.vazao === v}
                  aoMudar={() => aoMudar({ vazao: v })}
                  rotulo={ROTULO_VAZAO[v]}
                  contagem={facetas?.vazao[v]}
                />
              ))}
            </Grupo>
            <div className="space-y-2">
              <label htmlFor={idUf} className="block text-sm font-semibold text-app-fg">
                UF
              </label>
              <select
                id={idUf}
                value={valorUf(estado.uf)}
                onChange={(e) => aoMudar({ uf: lerUfOpcao(e.target.value) })}
                className={`${classeSelect} h-11 w-full`}
              >
                <OpcoesUf facetas={facetas} estado={estado} />
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor={idUgrhi} className="block text-sm font-semibold text-app-fg">
                UGRHI
              </label>
              <select
                id={idUgrhi}
                value={valorUgrhi(estado.ugrhi)}
                onChange={(e) => aoMudar({ ugrhi: lerUgrhi(e.target.value) })}
                className={`${classeSelect} h-11 w-full`}
              >
                <OpcoesUgrhi facetas={facetas} estado={estado} />
              </select>
            </div>
          </div>

          <footer className="flex items-center gap-3 border-t border-app-border-subtle px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={aoLimpar}
              disabled={ativos === 0}
              className="h-11 rounded px-3 text-sm font-medium text-gov-azul disabled:text-app-fg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={fechar}
              className="h-11 flex-1 rounded bg-gov-azul px-4 text-sm font-semibold text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              Mostrar {fmt(totalFiltrado)} {totalFiltrado === 1 ? 'posto' : 'postos'}
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-app-fg">{titulo}</legend>
      <div className="-mx-2">{children}</div>
    </fieldset>
  );
}
