'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, FileText, TriangleAlert } from 'lucide-react';
import type { ResumoSerie } from '@/application/ports/series-medicao-repository';
import type { PontoMapaPosto } from '@/domain/mapa-postos';
import { Alerta } from '@/components/ui/Alerta';
import { Skeleton, SkeletonGrupo } from '@/components/ui/Skeleton';
import { PainelSeriesPosto } from '@/components/features/postos/series/PainelSeriesPosto';
import { fmtDia, fmtMomento } from '@/components/features/postos/series/formato';
import type { Estacao } from '@/components/features/monitor/tipos';
import { GlifoPosto } from './GlifoPosto';
import { ROTULO_SITUACAO, ROTULO_TRANSMISSAO, ROTULO_VAZAO, estiloDoTipo } from './simbolos';
import { rotuloUgrhi } from './ugrhis';
import { AVISO_COORDENADA_SUSPEITA } from './local-posto';
import { classeAcaoPrimaria, classeAcaoSecundaria } from './ListaPostos';
import { mensagemDeLeitura } from './useMapaPostos';

/**
 * Detalhe do posto aberto no painel lateral (ou abaixo do mapa, no celular).
 *
 * Mostra o que o mapa já sabe na hora, sem esperar rede, e carrega o resto por
 * seção: séries, medições de vazão e curvas-chave. Cada seção tem o seu
 * carregando e o seu erro, para uma origem fora do ar não apagar as outras.
 *
 * O foco vai para "Voltar à lista" ao abrir, e é por ele que se volta. O
 * detalhe completo (arquivos, fichas, edição) continua na ficha do posto.
 */

export type ComparacaoChuva =
  | { readonly situacao: 'indisponivel' }
  | { readonly situacao: 'carregando' }
  | {
      readonly situacao: 'pronta';
      readonly estacao: Estacao;
      readonly naCesta: boolean;
      readonly podeAdicionar: boolean;
      readonly alternar: () => void;
    };

interface DetalhePostoProps {
  readonly ponto: PontoMapaPosto;
  readonly comparacao: ComparacaoChuva;
  readonly aoVoltar: () => void;
}

type Carga<T> =
  | { readonly situacao: 'carregando' }
  | { readonly situacao: 'erro'; readonly status: number | null; readonly mensagem: string }
  | { readonly situacao: 'pronto'; readonly dados: T };

function useJson<T>(url: string | null): { carga: Carga<T>; tentarDeNovo: () => void } {
  const [carga, setCarga] = useState<Carga<T>>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!url) return;
    let ativo = true;
    const controlador = new AbortController();
    setCarga({ situacao: 'carregando' });
    fetch(url, { signal: controlador.signal, headers: { Accept: 'application/json' } })
      .then(async (r) => {
        const corpo: unknown = await r.json().catch(() => null);
        if (!ativo) return;
        if (!r.ok) {
          setCarga({ situacao: 'erro', status: r.status, mensagem: mensagemDeLeitura(r.status, corpo) });
          return;
        }
        setCarga({ situacao: 'pronto', dados: corpo as T });
      })
      .catch((e: unknown) => {
        if (!ativo || (e instanceof DOMException && e.name === 'AbortError')) return;
        setCarga({ situacao: 'erro', status: null, mensagem: 'Sem resposta do servidor.' });
      });
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [url, tentativa]);

  return { carga, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

/** `fixo` alinha a coluna da tabela de medições (2,4 e 12 viram 2,400 e 12,00). */
const fmtNumero = (v: number | null | undefined, casas = 3, fixo = false) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: fixo ? casas : 0 });

function fmtCoordenada(valor: number, positivo: string, negativo: string): string {
  const abs = Math.abs(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  });
  return `${abs}° ${valor < 0 ? negativo : positivo}`;
}

function listaNatural(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

export function DetalhePosto({ ponto, comparacao, aoVoltar }: DetalhePostoProps) {
  const voltar = useRef<HTMLButtonElement>(null);
  const extinto = ponto.situacao === 'extinto';
  const estilo = estiloDoTipo(ponto.tipo);
  const ehFluviometrico = ponto.tipo === 'flu';

  useEffect(() => {
    const botao = voltar.current;
    if (!botao) return;
    botao.focus({ preventScroll: true });
    // No celular o painel fica abaixo do mapa: o foco sozinho deixava o botão
    // na última linha da tela e o posto aberto fora da vista (medido a 390 px).
    if (botao.getBoundingClientRect().top > window.innerHeight * 0.4) {
      botao.closest('article')?.scrollIntoView({ block: 'start' });
    }
  }, [ponto.prefixo]);

  const transmissao = ponto.transmissao.length
    ? listaNatural(ponto.transmissao.map((t) => ROTULO_TRANSMISSAO[t]))
    : 'Não informada';

  return (
    <article aria-labelledby="detalhe-posto-titulo" className="flex h-full min-h-0 scroll-mt-16 flex-col">
      <div className="border-b border-app-border-subtle px-4 py-2">
        <button
          ref={voltar}
          type="button"
          onClick={aoVoltar}
          className="inline-flex h-9 items-center gap-1.5 rounded px-2 text-sm font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar à lista
        </button>
      </div>

      <div className="relative min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <header className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-app-fg-muted">
            <GlifoPosto tipo={ponto.tipo} extinto={extinto} tamanho={11} />
            {estilo.nome}
          </p>
          <h2 id="detalhe-posto-titulo" className="text-xl font-semibold leading-tight text-app-fg">
            {ponto.nome ?? 'Posto sem nome'}
          </h2>
          <p className="text-sm text-app-fg-muted">
            Prefixo <span className="font-medium tabular-nums text-app-fg">{ponto.prefixo}</span>
          </p>
          <p
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              extinto ? 'bg-app-surface-3 text-app-fg' : 'bg-green-50 text-gov-sucesso'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${extinto ? 'border border-app-fg-muted' : 'bg-gov-sucesso'}`}
            />
            {ROTULO_SITUACAO[ponto.situacao]}
          </p>
        </header>

        <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <Fato termo="Município">
            {ponto.municipio ?? <span className="text-app-fg-muted">Não informado</span>}
          </Fato>
          <Fato termo="UF">{ponto.uf ?? <span className="text-app-fg-muted">Sem UF</span>}</Fato>
          <Fato termo="UGRHI">{rotuloUgrhi(ponto.ugrhi)}</Fato>
          <Fato termo="Transmissão">
            <span className={ponto.transmissao.length ? '' : 'text-app-fg-muted'}>{transmissao}</span>
          </Fato>
          {ehFluviometrico && (
            <Fato termo="Vazão">
              {ponto.vazao.length ? (
                listaNatural(ponto.vazao.map((v) => ROTULO_VAZAO[v].toLocaleLowerCase('pt-BR')))
                  .replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'))
              ) : (
                <span className="text-app-fg-muted">Sem fonte de vazão registrada</span>
              )}
            </Fato>
          )}
          <Fato termo="Coordenadas">
            {ponto.lat !== null && ponto.lon !== null ? (
              <span className="tabular-nums">
                {fmtCoordenada(ponto.lat, 'N', 'S')}, {fmtCoordenada(ponto.lon, 'L', 'O')}
              </span>
            ) : (
              <span className="text-app-fg-muted">Sem coordenada válida</span>
            )}
            {ponto.coordenadaSuspeita && (
              <span className="mt-1 flex items-center gap-1 text-xs text-amber-900">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {AVISO_COORDENADA_SUSPEITA}
              </span>
            )}
          </Fato>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Link href={`/postos/${encodeURIComponent(ponto.prefixo)}`} className={classeAcaoPrimaria}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Abrir ficha completa
          </Link>
          <BotaoComparar comparacao={comparacao} />
        </div>

        <SecaoSeries prefixo={ponto.prefixo} />

        {(ehFluviometrico || ponto.vazao.includes('medicao')) && (
          <SecaoMedicoes prefixo={ponto.prefixo} temMedicao={ponto.vazao.includes('medicao')} />
        )}
        {(ehFluviometrico || ponto.vazao.includes('curva')) && (
          <SecaoCurvas prefixo={ponto.prefixo} temCurva={ponto.vazao.includes('curva')} />
        )}
      </div>
    </article>
  );
}

function Fato({ termo, children }: { termo: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-app-fg-muted">{termo}</dt>
      <dd className="min-w-0 text-app-fg">{children}</dd>
    </>
  );
}

function BotaoComparar({ comparacao }: { comparacao: ComparacaoChuva }) {
  if (comparacao.situacao === 'indisponivel') return null;
  if (comparacao.situacao === 'carregando') {
    return (
      <button type="button" disabled className={`${classeAcaoSecundaria} opacity-60`}>
        <BarChart3 className="h-4 w-4" aria-hidden="true" />
        Comparar chuva
      </button>
    );
  }
  const bloqueado = !comparacao.naCesta && !comparacao.podeAdicionar;
  return (
    <button
      type="button"
      aria-pressed={comparacao.naCesta}
      onClick={comparacao.alternar}
      disabled={bloqueado}
      title={bloqueado ? 'A comparação já tem o máximo de estações' : undefined}
      className={`${classeAcaoSecundaria} disabled:cursor-not-allowed disabled:opacity-50 ${
        comparacao.naCesta ? 'border-gov-azul bg-gov-azul-claro text-gov-azul-escuro' : ''
      }`}
    >
      <BarChart3 className="h-4 w-4" aria-hidden="true" />
      {comparacao.naCesta ? 'Na comparação de chuva' : 'Comparar chuva'}
    </button>
  );
}

function TituloSecao({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-base font-semibold text-app-fg">
      {children}
    </h3>
  );
}

function ErroSecao({
  titulo,
  status,
  mensagem,
  tentarDeNovo,
}: {
  titulo: string;
  status: number | null;
  mensagem: string;
  tentarDeNovo: () => void;
}) {
  if (status === 501) {
    return (
      <Alerta tipo="info" titulo="Origem não configurada neste ambiente">
        {mensagem}
      </Alerta>
    );
  }
  return (
    <div className="space-y-2">
      <Alerta tipo="erro" titulo={titulo}>
        {mensagem}
      </Alerta>
      <button type="button" onClick={tentarDeNovo} className={classeAcaoSecundaria}>
        Tentar de novo
      </button>
    </div>
  );
}

function SecaoSeries({ prefixo }: { prefixo: string }) {
  const { carga, tentarDeNovo } = useJson<{ series: ResumoSerie[] }>(
    `/api/monitor/postos/${encodeURIComponent(prefixo)}/series`,
  );
  if (carga.situacao === 'pronto') {
    return (
      <section className="border-t border-app-border-subtle pt-5">
        <PainelSeriesPosto key={prefixo} prefixo={prefixo} series={carga.dados.series} />
      </section>
    );
  }
  return (
    <section aria-labelledby="sec-series-detalhe" aria-busy={carga.situacao === 'carregando'} className="space-y-3 border-t border-app-border-subtle pt-5">
      <TituloSecao id="sec-series-detalhe">Séries históricas de medição</TituloSecao>
      {carga.situacao === 'carregando' ? (
        <SkeletonGrupo rotulo="Carregando séries" className="space-y-2"><Skeleton variante="texto" /><Skeleton variante="texto" className="w-2/3" /><Skeleton variante="card" /></SkeletonGrupo>
      ) : carga.status === 404 ? (
        <Alerta tipo="aviso" titulo="Posto não encontrado no cadastro de séries">
          O banco do órgão não reconhece este prefixo, então não há série a consultar.
        </Alerta>
      ) : (
        <ErroSecao
          titulo="Não foi possível carregar as séries"
          status={carga.status}
          mensagem={carga.mensagem}
          tentarDeNovo={tentarDeNovo}
        />
      )}
    </section>
  );
}

interface MedicaoVazao {
  dataInicial: string;
  dataFinal: string;
  cotaInicial: number | null;
  cotaFinal: number | null;
  vazaoLiquida: number | null;
  areaSeccao: number | null;
  larguraSeccao: number | null;
  profundidadeMedia: number | null;
  velocidadeMedia: number | null;
  qualidade: string | null;
  entidadeMedidora: string | null;
}

interface RespostaMedicoes {
  pagina: number;
  porPagina: number;
  total: number;
  itens: MedicaoVazao[];
}

const RESUMO_MEDICOES = 5;
const PAGINA_MEDICOES = 25;

function SecaoMedicoes({ prefixo, temMedicao }: { prefixo: string; temMedicao: boolean }) {
  const [expandido, setExpandido] = useState(false);
  const [pagina, setPagina] = useState(1);
  const porPagina = expandido ? PAGINA_MEDICOES : RESUMO_MEDICOES;
  const url = temMedicao
    ? `/api/postos/${encodeURIComponent(prefixo)}/medicoes-vazao?pagina=${pagina}&porPagina=${porPagina}`
    : null;
  const { carga, tentarDeNovo } = useJson<RespostaMedicoes>(url);

  return (
    <section aria-labelledby="sec-medicoes" aria-busy={temMedicao && carga.situacao === 'carregando'} className="space-y-3 border-t border-app-border-subtle pt-5">
      <TituloSecao id="sec-medicoes">Medições de vazão</TituloSecao>
      {!temMedicao ? (
        <p className="text-sm text-app-fg-muted">Nenhuma medição de vazão registrada para este posto.</p>
      ) : carga.situacao === 'carregando' ? (
        <SkeletonGrupo rotulo="Carregando medições" className="space-y-2"><Skeleton variante="texto" /><Skeleton variante="texto" /><Skeleton variante="texto" /><Skeleton variante="texto" className="w-1/2" /></SkeletonGrupo>
      ) : carga.situacao === 'erro' ? (
        <ErroSecao
          titulo="Não foi possível carregar as medições"
          status={carga.status}
          mensagem={carga.mensagem}
          tentarDeNovo={tentarDeNovo}
        />
      ) : carga.dados.total === 0 ? (
        <p className="text-sm text-app-fg-muted">Nenhuma medição de vazão registrada para este posto.</p>
      ) : (
        <>
          <p className="text-xs text-app-fg-muted">
            {carga.dados.total.toLocaleString('pt-BR')}{' '}
            {carga.dados.total === 1 ? 'medição em campo' : 'medições em campo'}, da mais recente para a mais antiga.
          </p>
          <div className="relative overflow-x-auto rounded-gov-card ring-1 ring-app-border-subtle">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <caption className="sr-only">Medições de vazão do posto {prefixo}</caption>
              <thead className="bg-app-surface-2 text-app-fg-muted">
                <tr>
                  <th scope="col" className="px-2.5 py-2 font-medium">Data</th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">Vazão (m³/s)</th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">Cota inicial</th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">Cota final</th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">Área</th>
                  <th scope="col" className="px-2.5 py-2 text-right font-medium">Velocidade</th>
                  <th scope="col" className="px-2.5 py-2 font-medium">Entidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border-subtle">
                {carga.dados.itens.map((m) => (
                  <tr key={`${m.dataInicial}-${m.dataFinal}`}>
                    <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{fmtMomento(m.dataInicial)}</td>
                    <td className="px-2.5 py-1.5 text-right font-medium tabular-nums">{fmtNumero(m.vazaoLiquida, 3, true)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtNumero(m.cotaInicial, 2, true)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtNumero(m.cotaFinal, 2, true)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtNumero(m.areaSeccao, 2, true)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtNumero(m.velocidadeMedia, 3, true)}</td>
                    <td className="px-2.5 py-1.5">{m.entidadeMedidora ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-app-fg-subtle">
            Unidades de cota, área e velocidade ainda não confirmadas pelo órgão.
          </p>
          {!expandido && carga.dados.total > RESUMO_MEDICOES ? (
            <button
              type="button"
              onClick={() => {
                setExpandido(true);
                setPagina(1);
              }}
              className={classeAcaoSecundaria}
            >
              Ver as {carga.dados.total.toLocaleString('pt-BR')} medições
            </button>
          ) : expandido ? (
            <PaginacaoSimples
              pagina={pagina}
              totalPaginas={Math.max(1, Math.ceil(carga.dados.total / PAGINA_MEDICOES))}
              aoMudar={setPagina}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function PaginacaoSimples({
  pagina,
  totalPaginas,
  aoMudar,
}: {
  pagina: number;
  totalPaginas: number;
  aoMudar: (p: number) => void;
}) {
  return (
    <nav aria-label="Páginas das medições" className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => aoMudar(pagina - 1)}
        disabled={pagina <= 1}
        className={`${classeAcaoSecundaria} disabled:opacity-50`}
      >
        Anterior
      </button>
      <p className="text-xs tabular-nums text-app-fg-muted">
        Página {pagina} de {totalPaginas}
      </p>
      <button
        type="button"
        onClick={() => aoMudar(pagina + 1)}
        disabled={pagina >= totalPaginas}
        className={`${classeAcaoSecundaria} disabled:opacity-50`}
      >
        Próxima
      </button>
    </nav>
  );
}

interface CurvaChave {
  dataInicio: string;
  dataFinal: string | null;
  vigente: boolean;
  indiceQualidade: string | null;
  consistencia: string | null;
  trechos: Array<{ k: number; h: number; n: number; i: number }>;
}

function dataIso(valor: string | null): string {
  return valor ? fmtDia(valor.slice(0, 10)) : 'sem data final';
}

function SecaoCurvas({ prefixo, temCurva }: { prefixo: string; temCurva: boolean }) {
  const url = temCurva ? `/api/postos/${encodeURIComponent(prefixo)}/curvas-chave` : null;
  const { carga, tentarDeNovo } = useJson<{ total: number; curvas: CurvaChave[] }>(url);

  return (
    <section aria-labelledby="sec-curvas" aria-busy={temCurva && carga.situacao === 'carregando'} className="space-y-3 border-t border-app-border-subtle pt-5">
      <TituloSecao id="sec-curvas">Curvas-chave</TituloSecao>
      {!temCurva ? (
        <p className="text-sm text-app-fg-muted">Nenhuma curva-chave registrada para este posto.</p>
      ) : carga.situacao === 'carregando' ? (
        <SkeletonGrupo rotulo="Carregando curvas-chave"><Skeleton variante="card" className="h-24" /></SkeletonGrupo>
      ) : carga.situacao === 'erro' ? (
        <ErroSecao
          titulo="Não foi possível carregar as curvas-chave"
          status={carga.status}
          mensagem={carga.mensagem}
          tentarDeNovo={tentarDeNovo}
        />
      ) : carga.dados.curvas.length === 0 ? (
        <p className="text-sm text-app-fg-muted">Nenhuma curva-chave registrada para este posto.</p>
      ) : (
        <>
          <p className="text-xs text-app-fg-muted">
            {carga.dados.curvas.length === 1
              ? '1 curva, como gravada no banco do órgão.'
              : `${carga.dados.curvas.length} curvas, da vigência mais recente para a mais antiga, como gravadas no banco do órgão.`}
          </p>
          <ul className="space-y-2">
            {carga.dados.curvas.map((c, indice) => (
              <li key={`${c.dataInicio}-${indice}`}>
                <details className="group rounded-gov-card ring-1 ring-app-border-subtle" open={indice === 0}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul">
                    <span className="tabular-nums">
                      {dataIso(c.dataInicio)} a {dataIso(c.dataFinal)}
                    </span>
                    {c.vigente && (
                      <span className="rounded bg-green-50 px-1.5 text-2xs font-medium text-gov-sucesso">Vigente</span>
                    )}
                    <span className="ml-auto text-xs text-app-fg-muted">
                      {[
                        c.indiceQualidade ? `Qualidade ${c.indiceQualidade}` : null,
                        c.consistencia ? `consistência ${c.consistencia}` : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </summary>
                  <div className="border-t border-app-border-subtle px-3 py-2">
                    {c.trechos.length === 0 ? (
                      <p className="text-xs text-app-fg-muted">Sem equação gravada.</p>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <caption className="sr-only">Coeficientes da curva por trecho</caption>
                        <thead className="text-app-fg-muted">
                          <tr>
                            <th scope="col" className="py-1 font-medium">Trecho</th>
                            <th scope="col" className="py-1 text-right font-medium">k</th>
                            <th scope="col" className="py-1 text-right font-medium">h</th>
                            <th scope="col" className="py-1 text-right font-medium">n</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.trechos.map((t) => (
                            <tr key={t.i}>
                              <td className="py-0.5 tabular-nums">{fmtNumero(t.i, 2)}</td>
                              <td className="py-0.5 text-right tabular-nums">{fmtNumero(t.k, 4)}</td>
                              <td className="py-0.5 text-right tabular-nums">{fmtNumero(t.h, 4)}</td>
                              <td className="py-0.5 text-right tabular-nums">{fmtNumero(t.n, 4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
