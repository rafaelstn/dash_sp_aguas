'use client';

import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { CheckCircle2, EyeOff, PackagePlus, RotateCcw, Search } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { Button } from '@/components/ui/Button';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { atualizarDesconformidade, listarDesconformidades } from '../api';
import { ErroEstoque, textoDeErro } from '../erros';
import {
  STATUS_DESCONFORMIDADE,
  TIPOS_DESCONFORMIDADE,
  type DesconformidadeDTO,
  type LocalDTO,
  type StatusDesconformidade,
  type TipoDesconformidade,
} from '../dtos';
import {
  ROTULO_STATUS_DESCONFORMIDADE,
  ROTULO_TIPO_DESCONFORMIDADE,
  VAZIO_POR_STATUS,
  acoesDisponiveis,
  classeBadgeStatusDesconformidade,
  indiceDeFoco,
  localizacaoPlanilha,
  mudarFiltro,
  paginaDeRecuo,
  termoBuscaDe,
  type AcaoDesconformidade,
  type FiltroLista,
} from './desconformidades-ui';
import {
  DESCONFORMIDADE_ALTERADA,
  MENSAGEM_ALTERADA,
  gravarVinculos,
  lerVinculos,
  type MapaVinculos,
  type UnidadeVinculada,
} from './cadastro-item-fluxo';
import { NotaDialog, type DecisaoNota } from './NotaDialog';
import { CadastrarItemDialog } from './CadastrarItemDialog';

const POR_PAGINA = 50;

export interface PaginacaoProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  aoPaginar: (p: number) => void;
}

interface Props {
  podeGerenciar: boolean;
  /** Muda quando o painel recarrega (após qualquer escrita). */
  versao: number;
  locais: readonly LocalDTO[];
  Paginacao: ComponentType<PaginacaoProps>;
  /** Sucesso: o painel mostra a mensagem, anuncia e recarrega. */
  aoConcluir: (mensagem: string) => void;
  /** Falha fora de diálogo (reabrir, item criado com pendência aberta, 409): mostra e recarrega. */
  aoFalhar: (mensagem: string) => void;
  /** Leva para a aba Serializados com a busca preenchida. */
  aoVerItens: (termo: string) => void;
}

type Carga =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; itens: DesconformidadeDTO[]; total: number };

const FILTRO_INICIAL: FiltroLista = { status: 'aberta', tipo: '', pagina: 1 };

function armazenamentoDaAba(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const BADGE =
  'inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide whitespace-nowrap';

export function SecaoDesconformidades({
  podeGerenciar,
  versao,
  locais,
  Paginacao,
  aoConcluir,
  aoFalhar,
  aoVerItens,
}: Props) {
  const id = useId();
  // Filtro e página num estado só: trocar o filtro zera a página no mesmo render.
  const [filtro, setFiltro] = useState<FiltroLista>(FILTRO_INICIAL);
  const { status, tipo, pagina } = filtro;
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });
  const [contagem, setContagem] = useState<Record<StatusDesconformidade, number> | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [alvoNota, setAlvoNota] = useState<{ item: DesconformidadeDTO; decisao: DecisaoNota } | null>(
    null,
  );
  const [alvoCadastro, setAlvoCadastro] = useState<DesconformidadeDTO | null>(null);
  const [reabrindo, setReabrindo] = useState<string | null>(null);

  // Unidade criada por desconformidade: sobrevive a fechar o diálogo e, pelo
  // sessionStorage da aba, a trocar de aba do estoque e recarregar a página.
  const [vinculos, setVinculos] = useState<MapaVinculos>({});
  const vinculosLidos = useRef(false);
  useEffect(() => {
    setVinculos(lerVinculos(armazenamentoDaAba()));
    vinculosLidos.current = true;
  }, []);
  useEffect(() => {
    if (vinculosLidos.current) gravarVinculos(armazenamentoDaAba(), vinculos);
  }, [vinculos]);

  const guardarVinculo = useCallback((desconformidadeId: string, u: UnidadeVinculada) => {
    setVinculos((atual) => ({ ...atual, [desconformidadeId]: u }));
  }, []);
  const esquecerVinculo = useCallback((desconformidadeId: string) => {
    setVinculos((atual) => {
      if (!(desconformidadeId in atual)) return atual;
      const resto = { ...atual };
      delete resto[desconformidadeId];
      return resto;
    });
  }, []);

  // Foco depois de uma ação que tira a linha da lista (WCAG 2.4.3): a linha que
  // passou a ocupar a posição, a última, ou o filtro de situação quando a lista
  // esvazia. `cargaDaAcao` impede de focar a lista velha antes de a nova chegar.
  const statusRef = useRef<HTMLSelectElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const focoPendente = useRef<{ indice: number; cargaDaAcao: Carga } | null>(null);
  const cargaAtual = useRef<Carga>(carga);
  useEffect(() => {
    cargaAtual.current = carga;
  }, [carga]);

  const pedirFocoApos = useCallback((item: DesconformidadeDTO) => {
    const c = cargaAtual.current;
    const indice = c.fase === 'ok' ? Math.max(0, c.itens.findIndex((d) => d.id === item.id)) : 0;
    focoPendente.current = { indice, cargaDaAcao: c };
  }, []);

  useEffect(() => {
    const pendente = focoPendente.current;
    if (!pendente || carga.fase === 'carregando' || carga === pendente.cargaDaAcao) return;
    focoPendente.current = null;
    const alvo = carga.fase === 'ok' ? indiceDeFoco(pendente.indice, carga.itens.length) : null;
    const linha =
      alvo === null
        ? undefined
        : Array.from(
            listaRef.current?.querySelectorAll<HTMLElement>(`[data-foco-linha="${alvo}"]`) ?? [],
          ).find((el) => el.getClientRects().length > 0);
    (linha ?? statusRef.current)?.focus();
  }, [carga]);

  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    setCarga({ fase: 'carregando' });
    listarDesconformidades({ status, tipo: tipo || undefined, pagina, porPagina: POR_PAGINA }, c.signal)
      .then((r) => {
        if (!ativo) return;
        setContagem(r.contagem);
        const recuo = paginaDeRecuo(pagina, r.total, POR_PAGINA, r.itens.length);
        if (recuo !== null) {
          // Página esvaziou (último item resolvido ou ignorado): volta para a última que existe.
          setFiltro((f) => mudarFiltro(f, { campo: 'pagina', valor: recuo }));
          return;
        }
        setCarga({ fase: 'ok', itens: r.itens, total: r.total });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        setCarga({
          fase: 'erro',
          mensagem: textoDeErro(e, 'Não foi possível carregar as desconformidades.'),
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [status, tipo, pagina, versao, recarga]);

  const reabrir = useCallback(
    async (item: DesconformidadeDTO) => {
      setReabrindo(item.id);
      try {
        await atualizarDesconformidade(item.id, { status: 'aberta', statusEsperado: item.status });
        pedirFocoApos(item);
        aoConcluir('Desconformidade reaberta.');
      } catch (e) {
        if (e instanceof ErroEstoque && e.codigo === DESCONFORMIDADE_ALTERADA) {
          pedirFocoApos(item);
          aoFalhar(MENSAGEM_ALTERADA);
        } else {
          aoFalhar(textoDeErro(e, 'Não foi possível reabrir. Tente novamente.'));
        }
      } finally {
        setReabrindo(null);
      }
    },
    [aoConcluir, aoFalhar, pedirFocoApos],
  );

  const executar = useCallback(
    (acao: AcaoDesconformidade, item: DesconformidadeDTO) => {
      switch (acao) {
        case 'cadastrar':
          setAlvoCadastro(item);
          return;
        case 'resolver':
          setAlvoNota({ item, decisao: 'resolvida' });
          return;
        case 'ignorar':
          setAlvoNota({ item, decisao: 'ignorada' });
          return;
        case 'reabrir':
          void reabrir(item);
          return;
        case 'verItens': {
          const termo = termoBuscaDe(item);
          if (termo) aoVerItens(termo);
          return;
        }
      }
    },
    [aoVerItens, reabrir],
  );

  const totalPaginas = carga.fase === 'ok' ? Math.max(1, Math.ceil(carga.total / POR_PAGINA)) : 1;
  const rotuloStatus = (s: StatusDesconformidade) =>
    contagem
      ? `${ROTULO_STATUS_DESCONFORMIDADE[s]} (${contagem[s].toLocaleString('pt-BR')})`
      : ROTULO_STATUS_DESCONFORMIDADE[s];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-3 sm:grid-cols-2 lg:max-w-2xl">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-status`} className="text-sm font-medium text-app-fg">
            Situação
          </label>
          <select
            ref={statusRef}
            id={`${id}-status`}
            value={status}
            onChange={(e) =>
              setFiltro((f) =>
                mudarFiltro(f, { campo: 'status', valor: e.target.value as StatusDesconformidade }),
              )
            }
            className="w-full rounded border border-app-border-input bg-app-surface px-3 py-2 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
          >
            {STATUS_DESCONFORMIDADE.map((s) => (
              <option key={s} value={s}>
                {rotuloStatus(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-tipo`} className="text-sm font-medium text-app-fg">
            Tipo
          </label>
          <select
            id={`${id}-tipo`}
            value={tipo}
            onChange={(e) =>
              setFiltro((f) =>
                mudarFiltro(f, { campo: 'tipo', valor: e.target.value as '' | TipoDesconformidade }),
              )
            }
            className="w-full rounded border border-app-border-input bg-app-surface px-3 py-2 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
          >
            <option value="">Todos os tipos</option>
            {TIPOS_DESCONFORMIDADE.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_DESCONFORMIDADE[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {carga.fase === 'carregando' ? (
        <SkeletonGrupo rotulo="Carregando desconformidades">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-app-border-subtle" />
            ))}
          </div>
        </SkeletonGrupo>
      ) : carga.fase === 'erro' ? (
        <div className="space-y-3">
          <Alerta tipo="erro" titulo="Erro ao carregar">
            {carga.mensagem}
          </Alerta>
          <Button type="button" variante="secundario" onClick={() => setRecarga((n) => n + 1)}>
            Tentar novamente
          </Button>
        </div>
      ) : carga.itens.length === 0 ? (
        <EstadoVazio icone={CheckCircle2} titulo={VAZIO_POR_STATUS[status]} />
      ) : (
        <div ref={listaRef} className="space-y-3">
          <ListaDesconformidades
            itens={carga.itens}
            podeGerenciar={podeGerenciar}
            reabrindo={reabrindo}
            aoExecutar={executar}
          />
          <Paginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={carga.total}
            aoPaginar={(p) => setFiltro((f) => mudarFiltro(f, { campo: 'pagina', valor: p }))}
          />
        </div>
      )}

      <NotaDialog
        alvo={alvoNota}
        aoFechar={() => setAlvoNota(null)}
        aoConcluir={(msg) => {
          if (alvoNota) pedirFocoApos(alvoNota.item);
          setAlvoNota(null);
          aoConcluir(msg);
        }}
        aoAlterada={(msg) => {
          if (alvoNota) pedirFocoApos(alvoNota.item);
          setAlvoNota(null);
          aoFalhar(msg);
        }}
      />
      <CadastrarItemDialog
        item={alvoCadastro}
        locais={locais}
        criada={alvoCadastro ? (vinculos[alvoCadastro.id] ?? null) : null}
        aoCriar={guardarVinculo}
        aoPerderVinculo={esquecerVinculo}
        aoFechar={(avisoPendente) => {
          setAlvoCadastro(null);
          if (avisoPendente) aoFalhar(avisoPendente);
        }}
        aoConcluir={(msg) => {
          if (alvoCadastro) {
            pedirFocoApos(alvoCadastro);
            esquecerVinculo(alvoCadastro.id);
          }
          setAlvoCadastro(null);
          aoConcluir(msg);
        }}
        aoAlterada={(msg) => {
          if (alvoCadastro) pedirFocoApos(alvoCadastro);
          setAlvoCadastro(null);
          aoFalhar(msg);
        }}
      />
    </div>
  );
}

const ICONE_ACAO: Record<AcaoDesconformidade, typeof Search> = {
  cadastrar: PackagePlus,
  resolver: CheckCircle2,
  ignorar: EyeOff,
  reabrir: RotateCcw,
  verItens: Search,
};

const ROTULO_ACAO: Record<AcaoDesconformidade, string> = {
  cadastrar: 'Cadastrar item',
  resolver: 'Marcar como resolvida',
  ignorar: 'Ignorar',
  reabrir: 'Reabrir',
  verItens: 'Ver nos itens',
};

function BadgeStatusDesconformidade({ status }: { status: StatusDesconformidade }) {
  return (
    <span className={`${BADGE} ${classeBadgeStatusDesconformidade(status)}`}>
      {ROTULO_STATUS_DESCONFORMIDADE[status]}
    </span>
  );
}

function Acoes({
  item,
  indice,
  podeGerenciar,
  reabrindo,
  aoExecutar,
}: {
  item: DesconformidadeDTO;
  /** Posição da linha: o primeiro botão recebe o foco depois de uma ação. */
  indice: number;
  podeGerenciar: boolean;
  reabrindo: string | null;
  aoExecutar: (acao: AcaoDesconformidade, item: DesconformidadeDTO) => void;
}) {
  const acoes = acoesDisponiveis(item, podeGerenciar);
  if (acoes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {acoes.map((acao, posicao) => {
        const Icone = ICONE_ACAO[acao];
        const principal = acao === 'cadastrar';
        const ocupado = acao === 'reabrir' && reabrindo === item.id;
        return (
          <button
            key={acao}
            type="button"
            data-foco-linha={posicao === 0 ? indice : undefined}
            onClick={() => {
              if (!ocupado) aoExecutar(acao, item);
            }}
            // aria-disabled e não disabled: desabilitar joga o foco no BODY durante a reabertura.
            aria-disabled={ocupado || undefined}
            className={[
              'inline-flex min-h-[44px] items-center md:min-h-[32px] gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
              principal
                ? 'bg-gov-azul text-white hover:bg-gov-azul-escuro'
                : 'border border-app-border-subtle bg-app-surface text-app-fg hover:bg-app-surface-2',
            ].join(' ')}
          >
            <Icone className="h-3.5 w-3.5" aria-hidden="true" />
            {ocupado ? 'Reabrindo…' : ROTULO_ACAO[acao]}
          </button>
        );
      })}
    </div>
  );
}

function Nota({ item }: { item: DesconformidadeDTO }) {
  if (item.status === 'aberta' || !item.nota) return null;
  return <p className="mt-1 break-words text-xs text-app-fg-muted">Nota: {item.nota}</p>;
}

/** Tabela a partir de md; cartões no celular (sem rolagem lateral em 390 px). */
function ListaDesconformidades({
  itens,
  podeGerenciar,
  reabrindo,
  aoExecutar,
}: {
  itens: readonly DesconformidadeDTO[];
  podeGerenciar: boolean;
  reabrindo: string | null;
  aoExecutar: (acao: AcaoDesconformidade, item: DesconformidadeDTO) => void;
}) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {itens.map((d, i) => (
          <li
            key={d.id}
            className="min-w-0 rounded-gov-card border border-app-border-subtle bg-app-surface p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-medium text-app-fg">{ROTULO_TIPO_DESCONFORMIDADE[d.tipo]}</p>
              <BadgeStatusDesconformidade status={d.status} />
            </div>
            <p className="mt-0.5 text-xs text-app-fg-muted">{localizacaoPlanilha(d.aba, d.linha)}</p>
            <p className="mt-2 break-words text-sm text-app-fg">{d.detalhe}</p>
            <Nota item={d} />
            <div className="mt-3">
              <Acoes
                item={d}
                indice={i}
                podeGerenciar={podeGerenciar}
                reabrindo={reabrindo}
                aoExecutar={aoExecutar}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Desconformidades da importação da planilha</caption>
          <thead>
            <tr className="bg-app-surface-2 text-left text-xs font-semibold text-app-fg-muted">
              <th scope="col" className="px-3 py-2">Tipo</th>
              <th scope="col" className="px-3 py-2">Planilha</th>
              <th scope="col" className="px-3 py-2">Detalhe</th>
              <th scope="col" className="px-3 py-2">Situação</th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((d, i) => (
              <tr key={d.id} className="border-t border-app-border-subtle align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-app-fg">
                  {ROTULO_TIPO_DESCONFORMIDADE[d.tipo]}
                </td>
                <td className="px-3 py-2 text-app-fg-muted">{localizacaoPlanilha(d.aba, d.linha)}</td>
                <td className="min-w-[16rem] px-3 py-2 text-app-fg">
                  <span className="break-words">{d.detalhe}</span>
                  <Nota item={d} />
                </td>
                <td className="px-3 py-2">
                  <BadgeStatusDesconformidade status={d.status} />
                </td>
                <td className="px-3 py-2">
                  <Acoes
                    item={d}
                    indice={i}
                    podeGerenciar={podeGerenciar}
                    reabrindo={reabrindo}
                    aoExecutar={aoExecutar}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
