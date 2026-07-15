'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Package, Plus, Settings2 } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { LiveRegion } from '@/components/a11y/LiveRegion';
import {
  contarUnidades,
  excluirCategoria,
  excluirLocal,
  excluirMaterial,
  excluirUnidade,
  listarCategorias,
  listarLocais,
  listarMateriais,
  listarSaldos,
  listarUnidades,
  urlExportarMovimentacoes,
  urlExportarQuantificavel,
  urlExportarSerializado,
} from './api';
import { BotaoExportarExcel } from './BotaoExportarExcel';
import { ErroEstoque } from './erros';
import {
  agruparSaldos,
  contarAbaixoDoMinimo,
  filtrarAbaixoDoMinimo,
  somarQuantidades,
} from './saldos-agrupados';
import { FiltrosEstoque, FILTROS_ESTOQUE_INICIAIS, type FiltrosEstoqueUI } from './FiltrosEstoque';
import { TabelaUnidades } from './TabelaUnidades';
import { SaldoTabela } from './SaldoTabela';
import { UnidadeDetalhe } from './UnidadeDetalhe';
import { MaterialDetalhe } from './MaterialDetalhe';
import { MovimentacaoDialog, type AlvoMovimentacao } from './MovimentacaoDialog';
import { MaterialForm } from './MaterialForm';
import { UnidadeForm } from './UnidadeForm';
import { LocalForm } from './LocalForm';
import { CategoriaForm } from './CategoriaForm';
import { GestaoCadastros } from './GestaoCadastros';
import type {
  CategoriaDTO,
  LocalDTO,
  MaterialDTO,
  Natureza,
  SaldoContextoDTO,
  UnidadeDTO,
} from './dtos';

interface Props {
  /** Papel do ator resolvido no servidor: admin/super_admin gerenciam. */
  podeGerenciar: boolean;
}

const POR_PAGINA = 50;

type CargaUnidades =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; itens: UnidadeDTO[]; total: number };

type CargaSaldos =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; saldos: SaldoContextoDTO[] };

interface ResumoSerial {
  total: number;
  ativo: number;
  defeito: number;
  descarte: number;
}

/** Alvo de exclusao (discriminated union por tipo de cadastro). */
type AlvoExclusao =
  | { tipo: 'unidade'; item: UnidadeDTO }
  | { tipo: 'material'; item: MaterialDTO }
  | { tipo: 'local'; item: LocalDTO }
  | { tipo: 'categoria'; item: CategoriaDTO };

function useDebounce<T>(valor: T, ms: number): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return debounced;
}

/**
 * Painel do modulo de Estoque (almoxarifado / patrimonio). Abas por natureza
 * (serializado / quantificavel), filtros no padrao do Monitor, resumo no topo,
 * detalhe com trilha, movimentacao com dialog revisado e CRUD completo. Acoes
 * de escrita so aparecem para quem pode gerenciar (UX; o backend e a autoridade).
 */
export function PainelEstoque({ podeGerenciar }: Props) {
  const [aba, setAba] = useState<Natureza>('serializado');
  const [filtros, setFiltros] = useState<FiltrosEstoqueUI>(FILTROS_ESTOQUE_INICIAIS);
  const [pagina, setPagina] = useState(1);
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  const buscaDebounced = useDebounce(filtros.busca, 300);

  // Cadastros auxiliares carregados uma vez (e recarregados por `versao`).
  const [locais, setLocais] = useState<LocalDTO[]>([]);
  const [categorias, setCategorias] = useState<CategoriaDTO[]>([]);
  const [materiaisQuant, setMateriaisQuant] = useState<MaterialDTO[]>([]);

  const [cargaU, setCargaU] = useState<CargaUnidades>({ fase: 'carregando' });
  const [cargaS, setCargaS] = useState<CargaSaldos>({ fase: 'carregando' });
  const [resumo, setResumo] = useState<ResumoSerial | null>(null);

  const [versao, setVersao] = useState(0);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [anuncio, setAnuncio] = useState('');

  // Detalhe (drawers)
  const [detalheUnidadeId, setDetalheUnidadeId] = useState<string | null>(null);
  const [detalheMaterialId, setDetalheMaterialId] = useState<string | null>(null);

  // Dialogs de escrita
  const [movAlvo, setMovAlvo] = useState<AlvoMovimentacao | null>(null);
  const [movTamanhos, setMovTamanhos] = useState<string[]>([]);
  const [formMaterial, setFormMaterial] = useState<{ aberto: boolean; material: MaterialDTO | null }>({
    aberto: false,
    material: null,
  });
  const [formUnidade, setFormUnidade] = useState<{ aberto: boolean; unidade: UnidadeDTO | null }>({
    aberto: false,
    unidade: null,
  });
  const [formLocal, setFormLocal] = useState<{ aberto: boolean; local: LocalDTO | null }>({
    aberto: false,
    local: null,
  });
  const [formCategoria, setFormCategoria] = useState<{ aberto: boolean; categoria: CategoriaDTO | null }>({
    aberto: false,
    categoria: null,
  });
  const [gestaoAberta, setGestaoAberta] = useState(false);
  const [alvoExclusao, setAlvoExclusao] = useState<AlvoExclusao | null>(null);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  const concluir = useCallback(
    (mensagem: string) => {
      setFeedback({ tipo: 'sucesso', texto: mensagem });
      setAnuncio(mensagem);
      recarregar();
    },
    [recarregar],
  );

  // Auxiliares (locais, categorias, materiais quantificaveis).
  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    Promise.all([
      listarLocais(undefined, c.signal),
      listarCategorias(c.signal),
      listarMateriais({ natureza: 'quantificavel', porPagina: 200 }, c.signal),
    ])
      .then(([l, cat, mat]) => {
        if (!ativo) return;
        setLocais(l.itens);
        setCategorias(cat.itens);
        setMateriaisQuant(mat.itens);
      })
      .catch(() => {
        /* auxiliares tolerantes: filtros ficam com menos opcoes, nao quebra a tela */
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [versao]);

  // Reset de pagina quando o filtro relevante muda.
  useEffect(() => {
    setPagina(1);
  }, [aba, filtros.unidade, filtros.local, filtros.estado, filtros.status, filtros.categoria, buscaDebounced]);

  // Carga da aba serializado.
  useEffect(() => {
    if (aba !== 'serializado') return;
    let ativo = true;
    const c = new AbortController();
    setCargaU({ fase: 'carregando' });
    listarUnidades(
      {
        unidade: filtros.unidade || undefined,
        local: filtros.local || undefined,
        estado: filtros.estado || undefined,
        status: filtros.status || undefined,
        busca: buscaDebounced.trim() || undefined,
        pagina,
        porPagina: POR_PAGINA,
      },
      c.signal,
    )
      .then((r) => {
        if (ativo) setCargaU({ fase: 'ok', itens: r.itens, total: r.total });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        setCargaU({
          fase: 'erro',
          mensagem: e instanceof ErroEstoque ? e.message : 'Não foi possível carregar os itens.',
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [aba, filtros.unidade, filtros.local, filtros.estado, filtros.status, buscaDebounced, pagina, versao]);

  // Resumo por situacao (serializado), no contexto de unidade/local/busca.
  useEffect(() => {
    if (aba !== 'serializado') return;
    let ativo = true;
    const c = new AbortController();
    const base = {
      unidade: filtros.unidade || undefined,
      local: filtros.local || undefined,
      busca: buscaDebounced.trim() || undefined,
    };
    Promise.all([
      contarUnidades(base, c.signal),
      contarUnidades({ ...base, status: 'ativo' }, c.signal),
      contarUnidades({ ...base, status: 'defeito' }, c.signal),
      contarUnidades({ ...base, status: 'descarte' }, c.signal),
    ])
      .then(([total, ativoC, defeito, descarte]) => {
        if (ativo) setResumo({ total, ativo: ativoC, defeito, descarte });
      })
      .catch(() => {
        if (ativo) setResumo(null);
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [aba, filtros.unidade, filtros.local, buscaDebounced, versao]);

  // Carga da aba quantificavel (saldos por unidade/local; busca+categoria no cliente).
  useEffect(() => {
    if (aba !== 'quantificavel') return;
    let ativo = true;
    const c = new AbortController();
    setCargaS({ fase: 'carregando' });
    listarSaldos(
      { unidade: filtros.unidade || undefined, local: filtros.local || undefined },
      c.signal,
    )
      .then((r) => {
        if (ativo) setCargaS({ fase: 'ok', saldos: r.itens });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        setCargaS({
          fase: 'erro',
          mensagem: e instanceof ErroEstoque ? e.message : 'Não foi possível carregar os saldos.',
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [aba, filtros.unidade, filtros.local, versao]);

  // Mapas de resolucao.
  const localPorId = useMemo(() => new Map(locais.map((l) => [l.id, l])), [locais]);
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  const materialQuantPorId = useMemo(
    () => new Map(materiaisQuant.map((m) => [m.id, m])),
    [materiaisQuant],
  );
  const nomeLocal = useCallback(
    (id: string | null) => (id ? (localPorId.get(id)?.rotulo ?? '—') : '—'),
    [localPorId],
  );
  const nomeCategoria = useCallback(
    (id: string | null) => (id ? (categoriaPorId.get(id)?.nome ?? '—') : '—'),
    [categoriaPorId],
  );

  // Filtro cliente dos quantificaveis (busca por descricao + categoria).
  const gruposQuant = useMemo(() => {
    if (cargaS.fase !== 'ok') return [];
    const termo = buscaDebounced.trim().toLocaleLowerCase('pt-BR');
    const catId = filtros.categoria;
    const saldosFiltrados = cargaS.saldos.filter((s) => {
      if (termo && !s.materialDescricao.toLocaleLowerCase('pt-BR').includes(termo)) return false;
      if (catId) {
        const mat = materialQuantPorId.get(s.materialId);
        if (!mat || mat.categoriaId !== catId) return false;
      }
      return true;
    });
    return agruparSaldos(saldosFiltrados, (id) => {
      const mat = materialQuantPorId.get(id);
      return mat
        ? { marca: mat.marca, modelo: mat.modelo, quantidadeMinima: mat.quantidadeMinima }
        : undefined;
    });
  }, [cargaS, buscaDebounced, filtros.categoria, materialQuantPorId]);

  // Quantos materiais precisam reposicao no conjunto filtrado (independe do toggle).
  const abaixoDoMinimoCount = useMemo(() => contarAbaixoDoMinimo(gruposQuant), [gruposQuant]);

  // Lista exibida: opcionalmente so os abaixo do minimo (toggle nos filtros).
  const gruposExibidos = useMemo(
    () => (filtros.somenteAbaixoMinimo ? filtrarAbaixoDoMinimo(gruposQuant) : gruposQuant),
    [filtros.somenteAbaixoMinimo, gruposQuant],
  );

  const resumoQuant = useMemo(() => {
    if (cargaS.fase !== 'ok') return null;
    const total = somarQuantidades(gruposExibidos.flatMap((g) => g.linhas));
    const locaisComSaldo = new Set(
      gruposExibidos.flatMap((g) => g.linhas.map((l) => l.localId)),
    ).size;
    return { materiais: gruposExibidos.length, total, locais: locaisComSaldo };
  }, [cargaS, gruposExibidos]);

  // ── Acoes de escrita ───────────────────────────────────────────────────────
  const abrirMovUnidade = useCallback((u: UnidadeDTO) => {
    setMovTamanhos([]);
    setMovAlvo({
      natureza: 'serializado',
      unidadeId: u.id,
      descricao: u.descricao,
      statusAtual: u.status,
      localAtualId: u.localId,
    });
  }, []);

  const abrirMovMaterialId = useCallback(
    (materialId: string) => {
      const grupo = gruposQuant.find((g) => g.materialId === materialId);
      const tamanhos = grupo
        ? [...new Set(grupo.linhas.map((l) => l.tamanho).filter((t): t is string => !!t))]
        : [];
      setMovTamanhos(tamanhos);
      setMovAlvo({
        natureza: 'quantificavel',
        materialId,
        descricao: grupo?.descricao ?? materialQuantPorId.get(materialId)?.descricao ?? 'Material',
      });
    },
    [gruposQuant, materialQuantPorId],
  );

  const abrirMovMaterial = useCallback((material: MaterialDTO, tamanhos: string[]) => {
    setMovTamanhos(tamanhos);
    setMovAlvo({ natureza: 'quantificavel', materialId: material.id, descricao: material.descricao });
  }, []);

  const editarMaterialId = useCallback(
    (materialId: string) => {
      const mat = materialQuantPorId.get(materialId);
      if (mat) setFormMaterial({ aberto: true, material: mat });
    },
    [materialQuantPorId],
  );

  async function confirmarExclusao() {
    if (!alvoExclusao) return;
    try {
      if (alvoExclusao.tipo === 'unidade') {
        await excluirUnidade(alvoExclusao.item.id);
        setAlvoExclusao(null);
        setDetalheUnidadeId(null);
        concluir(`Item "${alvoExclusao.item.descricao}" excluído.`);
      } else if (alvoExclusao.tipo === 'material') {
        const r = await excluirMaterial(alvoExclusao.item.id);
        setAlvoExclusao(null);
        setDetalheMaterialId(null);
        concluir(
          r.removido
            ? `Material "${alvoExclusao.item.descricao}" excluído.`
            : `Material "${alvoExclusao.item.descricao}" inativado (possuía vínculos e não pôde ser excluído).`,
        );
      } else if (alvoExclusao.tipo === 'local') {
        await excluirLocal(alvoExclusao.item.id);
        setAlvoExclusao(null);
        concluir(`Local "${alvoExclusao.item.rotulo}" excluído.`);
      } else {
        await excluirCategoria(alvoExclusao.item.id);
        setAlvoExclusao(null);
        concluir(`Categoria "${alvoExclusao.item.nome}" excluída.`);
      }
    } catch (e) {
      // Mantem o dialog aberto e mostra a mensagem (ex.: 409 unidade com movimentacao).
      throw new Error(
        e instanceof ErroEstoque ? e.message : 'Não foi possível excluir. Tente novamente.',
      );
    }
  }

  const descricaoExclusao = (): { titulo: string; descricao: React.ReactNode } => {
    if (!alvoExclusao) return { titulo: '', descricao: '' };
    switch (alvoExclusao.tipo) {
      case 'unidade':
        return {
          titulo: 'Excluir item serializado',
          descricao: (
            <>
              Excluir <strong>{alvoExclusao.item.descricao}</strong>? Itens com movimentação
              registrada não podem ser excluídos; nesse caso, use uma baixa.
            </>
          ),
        };
      case 'material':
        return {
          titulo: 'Excluir material',
          descricao: (
            <>
              Excluir <strong>{alvoExclusao.item.descricao}</strong>? Se houver vínculos, o material
              é inativado em vez de removido (preserva o histórico).
            </>
          ),
        };
      case 'local':
        return {
          titulo: 'Excluir local',
          descricao: (
            <>
              Excluir o local <strong>{alvoExclusao.item.rotulo}</strong>? Locais em uso por itens ou
              saldos não podem ser excluídos.
            </>
          ),
        };
      case 'categoria':
        return {
          titulo: 'Excluir categoria',
          descricao: (
            <>
              Excluir a categoria <strong>{alvoExclusao.item.nome}</strong>? Os materiais desta
              categoria ficam sem categoria.
            </>
          ),
        };
    }
  };

  const totalSerial = cargaU.fase === 'ok' ? cargaU.total : 0;
  const totalPaginas = Math.max(1, Math.ceil(totalSerial / POR_PAGINA));
  const infoExclusao = descricaoExclusao();

  return (
    <div className="space-y-4">
      <LiveRegion mensagem={anuncio} />

      {/* Cabecalho + acoes de gestao */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-app-fg">Estoque</h1>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            Almoxarifado e patrimônio das unidades Penha e Araraquara, com itens serializados,
            materiais quantificáveis e trilha de movimentação
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Exportacao Excel (LEITURA: aparece para qualquer usuario logado). */}
          {aba === 'serializado' ? (
            <BotaoExportarExcel
              url={urlExportarSerializado({
                unidade: filtros.unidade || undefined,
                local: filtros.local || undefined,
                estado: filtros.estado || undefined,
                status: filtros.status || undefined,
                busca: buscaDebounced.trim() || undefined,
              })}
              arquivoFallback="estoque-serializados"
              descricao="Exporta os itens serializados com os filtros aplicados nesta aba."
            />
          ) : (
            <BotaoExportarExcel
              url={urlExportarQuantificavel({
                unidade: filtros.unidade || undefined,
                local: filtros.local || undefined,
              })}
              arquivoFallback="estoque-quantificaveis"
              descricao="Exporta os materiais quantificáveis por unidade e local."
            />
          )}
          <BotaoExportarExcel
            url={urlExportarMovimentacoes()}
            rotulo="Exportar movimentações"
            arquivoFallback="estoque-movimentacoes"
            descricao="Exporta a trilha completa de movimentações (auditoria do almoxarifado)."
          />
          {podeGerenciar ? (
            <>
              <Button
                type="button"
                variante="secundario"
                onClick={() => setGestaoAberta(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                Cadastros
              </Button>
              {aba === 'serializado' ? (
                <Button
                  type="button"
                  onClick={() => setFormUnidade({ aberto: true, unidade: null })}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Novo item serializado
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => setFormMaterial({ aberto: true, material: null })}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Novo material
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <Alerta
          tipo={feedback.tipo === 'sucesso' ? 'sucesso' : 'erro'}
          titulo={feedback.tipo === 'sucesso' ? 'Tudo certo' : 'Não foi possível concluir'}
        >
          {feedback.texto}
        </Alerta>
      ) : null}

      {/* Alternancia por natureza. Botoes aria-pressed num grupo (mesmo padrao
          da alternancia mapa/lista do Monitor), evitando o padrao ARIA de
          abas incompleto (tab sem tabpanel). */}
      <div
        role="group"
        aria-label="Natureza dos itens"
        className="flex gap-1 border-b border-app-border-subtle"
      >
        <Aba
          ativa={aba === 'serializado'}
          onClick={() => setAba('serializado')}
          icone={Package}
          rotulo="Serializados"
        />
        <Aba
          ativa={aba === 'quantificavel'}
          onClick={() => setAba('quantificavel')}
          icone={Boxes}
          rotulo="Quantificáveis"
        />
      </div>

      {/* Resumo */}
      {aba === 'serializado' ? (
        <ResumoCards
          cards={[
            { rotulo: 'Itens no filtro', valor: resumo?.total ?? totalSerial },
            { rotulo: 'Ativos', valor: resumo?.ativo },
            { rotulo: 'Com defeito', valor: resumo?.defeito },
            { rotulo: 'Descartados', valor: resumo?.descarte },
          ]}
        />
      ) : (
        <ResumoCards
          cards={[
            { rotulo: 'Materiais', valor: resumoQuant?.materiais },
            { rotulo: 'Itens em estoque', valor: resumoQuant?.total },
            { rotulo: 'Locais com saldo', valor: resumoQuant?.locais },
            {
              rotulo: 'Abaixo do mínimo',
              valor: cargaS.fase === 'ok' ? abaixoDoMinimoCount : undefined,
              alerta: true,
            },
          ]}
        />
      )}

      {/* Filtros */}
      <div>
        <div className="mb-2 sm:hidden">
          <button
            type="button"
            onClick={() => setFiltrosAbertosMobile((v) => !v)}
            aria-expanded={filtrosAbertosMobile}
            aria-controls="painel-filtros-estoque"
            className="inline-flex items-center gap-1.5 rounded border border-app-border-input px-2.5 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Filtros
          </button>
        </div>
        <div
          id="painel-filtros-estoque"
          className={[
            'rounded-gov-card border border-app-border-subtle bg-app-surface p-3',
            filtrosAbertosMobile ? 'block' : 'hidden',
            'sm:block',
          ].join(' ')}
        >
          <FiltrosEstoque
            valor={filtros}
            aoMudar={setFiltros}
            natureza={aba}
            locais={locais}
            categorias={categorias}
          />
        </div>
      </div>

      {/* Conteudo da aba */}
      {aba === 'serializado' ? (
        <SecaoSerializado
          carga={cargaU}
          nomeLocal={nomeLocal}
          podeGerenciar={podeGerenciar}
          pagina={pagina}
          totalPaginas={totalPaginas}
          total={totalSerial}
          aoPaginar={setPagina}
          aoAbrir={(u) => setDetalheUnidadeId(u.id)}
          aoMovimentar={abrirMovUnidade}
          aoEditar={(u) => setFormUnidade({ aberto: true, unidade: u })}
          aoTentarNovamente={recarregar}
        />
      ) : (
        <SecaoQuantificavel
          carga={cargaS}
          grupos={gruposExibidos}
          filtroAbaixo={filtros.somenteAbaixoMinimo}
          podeGerenciar={podeGerenciar}
          aoAbrir={(id) => setDetalheMaterialId(id)}
          aoMovimentar={abrirMovMaterialId}
          aoEditar={editarMaterialId}
          aoTentarNovamente={recarregar}
        />
      )}

      {/* Drawers de detalhe */}
      {detalheUnidadeId ? (
        <UnidadeDetalhe
          unidadeId={detalheUnidadeId}
          versao={versao}
          podeGerenciar={podeGerenciar}
          nomeLocal={nomeLocal}
          aoFechar={() => setDetalheUnidadeId(null)}
          aoMovimentar={abrirMovUnidade}
          aoEditar={(u) => setFormUnidade({ aberto: true, unidade: u })}
          aoExcluir={(u) => setAlvoExclusao({ tipo: 'unidade', item: u })}
        />
      ) : null}
      {detalheMaterialId ? (
        <MaterialDetalhe
          materialId={detalheMaterialId}
          versao={versao}
          podeGerenciar={podeGerenciar}
          nomeCategoria={nomeCategoria}
          nomeLocal={nomeLocal}
          aoFechar={() => setDetalheMaterialId(null)}
          aoMovimentar={abrirMovMaterial}
          aoEditar={(m) => setFormMaterial({ aberto: true, material: m })}
          aoExcluir={(m) => setAlvoExclusao({ tipo: 'material', item: m })}
        />
      ) : null}

      {/* Dialog de movimentacao */}
      <MovimentacaoDialog
        aberto={movAlvo !== null}
        alvo={movAlvo}
        locais={locais}
        tamanhosDisponiveis={movTamanhos}
        aoFechar={() => setMovAlvo(null)}
        aoConcluir={(msg) => {
          setMovAlvo(null);
          concluir(msg);
        }}
      />

      {/* Formularios CRUD */}
      <UnidadeForm
        aberto={formUnidade.aberto}
        unidade={formUnidade.unidade}
        locais={locais}
        aoFechar={() => setFormUnidade({ aberto: false, unidade: null })}
        aoConcluir={(msg) => {
          setFormUnidade({ aberto: false, unidade: null });
          concluir(msg);
        }}
      />
      <MaterialForm
        aberto={formMaterial.aberto}
        material={formMaterial.material}
        naturezaInicial={aba}
        categorias={categorias}
        aoFechar={() => setFormMaterial({ aberto: false, material: null })}
        aoConcluir={(msg) => {
          setFormMaterial({ aberto: false, material: null });
          concluir(msg);
        }}
      />
      <LocalForm
        aberto={formLocal.aberto}
        local={formLocal.local}
        aoFechar={() => setFormLocal({ aberto: false, local: null })}
        aoConcluir={(msg) => {
          setFormLocal({ aberto: false, local: null });
          concluir(msg);
        }}
      />
      <CategoriaForm
        aberto={formCategoria.aberto}
        categoria={formCategoria.categoria}
        aoFechar={() => setFormCategoria({ aberto: false, categoria: null })}
        aoConcluir={(msg) => {
          setFormCategoria({ aberto: false, categoria: null });
          concluir(msg);
        }}
      />

      {/* Cadastros auxiliares */}
      <GestaoCadastros
        aberto={gestaoAberta}
        locais={locais}
        categorias={categorias}
        aoFechar={() => setGestaoAberta(false)}
        aoNovoLocal={() => setFormLocal({ aberto: true, local: null })}
        aoEditarLocal={(l) => setFormLocal({ aberto: true, local: l })}
        aoExcluirLocal={(l) => setAlvoExclusao({ tipo: 'local', item: l })}
        aoNovaCategoria={() => setFormCategoria({ aberto: true, categoria: null })}
        aoEditarCategoria={(c) => setFormCategoria({ aberto: true, categoria: c })}
        aoExcluirCategoria={(c) => setAlvoExclusao({ tipo: 'categoria', item: c })}
      />

      {/* Confirmacao de exclusao */}
      <ConfirmDialog
        aberto={alvoExclusao !== null}
        titulo={infoExclusao.titulo}
        descricao={infoExclusao.descricao}
        variante="perigo"
        rotuloConfirmar="Excluir"
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => setAlvoExclusao(null)}
      />
    </div>
  );
}

function Aba({
  ativa,
  onClick,
  icone: Icone,
  rotulo,
}: {
  ativa: boolean;
  onClick: () => void;
  icone: typeof Package;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={onClick}
      className={[
        '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul',
        ativa
          ? 'border-gov-azul text-gov-azul'
          : 'border-transparent text-app-fg-muted hover:text-app-fg',
      ].join(' ')}
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
      {rotulo}
    </button>
  );
}

function ResumoCards({
  cards,
}: {
  cards: { rotulo: string; valor: number | undefined; alerta?: boolean }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => {
        // Card de reposicao em destaque so quando ha material abaixo do minimo.
        const emAlerta = c.alerta === true && (c.valor ?? 0) > 0;
        return (
          <div
            key={c.rotulo}
            className={[
              'rounded-gov-card border px-3 py-2',
              emAlerta
                ? 'border-amber-300 bg-amber-50'
                : 'border-app-border-subtle bg-app-surface',
            ].join(' ')}
          >
            <dt className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
              {c.rotulo}
            </dt>
            <dd
              className={[
                'mt-0.5 text-lg font-semibold tabular',
                emAlerta ? 'text-amber-900' : 'text-app-fg',
              ].join(' ')}
            >
              {c.valor === undefined ? '—' : c.valor.toLocaleString('pt-BR')}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function SecaoSerializado({
  carga,
  nomeLocal,
  podeGerenciar,
  pagina,
  totalPaginas,
  total,
  aoPaginar,
  aoAbrir,
  aoMovimentar,
  aoEditar,
  aoTentarNovamente,
}: {
  carga: CargaUnidades;
  nomeLocal: (id: string | null) => string;
  podeGerenciar: boolean;
  pagina: number;
  totalPaginas: number;
  total: number;
  aoPaginar: (p: number) => void;
  aoAbrir: (u: UnidadeDTO) => void;
  aoMovimentar: (u: UnidadeDTO) => void;
  aoEditar: (u: UnidadeDTO) => void;
  aoTentarNovamente: () => void;
}) {
  if (carga.fase === 'carregando') {
    return <CarregandoTabela />;
  }
  if (carga.fase === 'erro') {
    return (
      <div className="space-y-3">
        <Alerta tipo="erro" titulo="Erro ao carregar">
          {carga.mensagem}
        </Alerta>
        <Button type="button" variante="secundario" onClick={aoTentarNovamente}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (carga.itens.length === 0) {
    return (
      <EstadoVazio
        icone={Package}
        titulo="Nenhum item serializado"
        descricao="Ajuste os filtros ou cadastre um novo item para começar."
      />
    );
  }
  return (
    <div className="space-y-3">
      <TabelaUnidades
        unidades={carga.itens}
        nomeLocal={nomeLocal}
        aoAbrir={aoAbrir}
        podeGerenciar={podeGerenciar}
        aoMovimentar={aoMovimentar}
        aoEditar={aoEditar}
      />
      <PaginacaoSimples pagina={pagina} totalPaginas={totalPaginas} total={total} aoPaginar={aoPaginar} />
    </div>
  );
}

function SecaoQuantificavel({
  carga,
  grupos,
  filtroAbaixo,
  podeGerenciar,
  aoAbrir,
  aoMovimentar,
  aoEditar,
  aoTentarNovamente,
}: {
  carga: CargaSaldos;
  grupos: ReturnType<typeof agruparSaldos>;
  filtroAbaixo: boolean;
  podeGerenciar: boolean;
  aoAbrir: (id: string) => void;
  aoMovimentar: (id: string) => void;
  aoEditar: (id: string) => void;
  aoTentarNovamente: () => void;
}) {
  if (carga.fase === 'carregando') {
    return <CarregandoTabela />;
  }
  if (carga.fase === 'erro') {
    return (
      <div className="space-y-3">
        <Alerta tipo="erro" titulo="Erro ao carregar">
          {carga.mensagem}
        </Alerta>
        <Button type="button" variante="secundario" onClick={aoTentarNovamente}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (grupos.length === 0) {
    return filtroAbaixo ? (
      <EstadoVazio
        icone={Boxes}
        titulo="Nenhum material abaixo do mínimo"
        descricao="Todos os materiais do filtro atual estão em nível adequado. Desmarque “Somente abaixo do mínimo” para ver todos."
      />
    ) : (
      <EstadoVazio
        icone={Boxes}
        titulo="Nenhum material quantificável"
        descricao="Ajuste os filtros ou cadastre um novo material para começar."
      />
    );
  }
  return (
    <SaldoTabela
      grupos={grupos}
      aoAbrir={aoAbrir}
      podeGerenciar={podeGerenciar}
      aoMovimentar={aoMovimentar}
      aoEditar={aoEditar}
    />
  );
}

function CarregandoTabela() {
  return (
    <SkeletonGrupo rotulo="Carregando itens do estoque">
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded bg-app-border-subtle" />
        ))}
      </div>
    </SkeletonGrupo>
  );
}

function PaginacaoSimples({
  pagina,
  totalPaginas,
  total,
  aoPaginar,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  aoPaginar: (p: number) => void;
}) {
  if (totalPaginas <= 1) return null;
  return (
    <nav
      aria-label="Paginação dos itens"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border-subtle pt-3"
    >
      <p className="text-xs text-app-fg-muted tabular">
        Página {pagina} de {totalPaginas} — {total.toLocaleString('pt-BR')} itens
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => aoPaginar(Math.max(1, pagina - 1))}
          disabled={pagina <= 1}
          className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => aoPaginar(Math.min(totalPaginas, pagina + 1))}
          disabled={pagina >= totalPaginas}
          className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Próxima
        </button>
      </div>
    </nav>
  );
}
