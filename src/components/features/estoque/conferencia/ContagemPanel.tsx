'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardList, MapPin, PackageSearch, Trash2 } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { carregarItensCompleto, registrarContagem, removerSobra } from '../conferencia-api';
import { ErroEstoque } from '../erros';
import {
  avisoOutraUnidadeFisica,
  itemContado,
  montarContagemQuantidade,
  montarContagemSerializado,
  progressoContagem,
  separarLocaisParaContagem,
} from '../conferencia-ui';
import type { ConferenciaDTO, ConferenciaItemDTO } from '../conferencia-dtos';
import type { Resolvedores } from './resolvedores';
import { BadgeSituacaoItem } from './BadgeConferencia';

interface Props {
  conferencia: ConferenciaDTO;
  podeGerenciar: boolean;
  resolvedores: Resolvedores;
  aoMudar: () => void;
  aoNotificar: (tipo: 'sucesso' | 'erro', texto: string) => void;
}

const POR_PAGINA_CLIENTE = 25;

type Vista = 'pendentes' | 'contados' | 'todos';

type Carga =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; itens: ConferenciaItemDTO[]; total: number; parcial: boolean };

/**
 * Tela de CONTAGEM (sessao aberta), mobile-first. Carrega os itens do escopo e
 * deixa o almoxarife contar um a um, com alvos de toque grandes. Serializado:
 * botoes "Conferido" / "Não encontrado" / "Em outro local" (este abre a seleção
 * de local). Quantificável: campo de quantidade contada com a do sistema
 * visível. Progresso ao vivo. Filtro Pendentes / Contados / Todos. Escrita só
 * para quem gerencia (o backend é a autoridade).
 */
export function ContagemPanel({
  conferencia,
  podeGerenciar,
  resolvedores,
  aoMudar,
  aoNotificar,
}: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });
  const [vista, setVista] = useState<Vista>('pendentes');
  const [pagina, setPagina] = useState(1);
  const conferenciaId = conferencia.id;

  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    setCarga({ fase: 'carregando' });
    carregarItensCompleto(conferenciaId, {}, c.signal)
      .then((carregado) => {
        if (ativo) setCarga({ fase: 'ok', ...carregado });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        setCarga({
          fase: 'erro',
          mensagem: e instanceof ErroEstoque ? e.message : 'Não foi possível carregar os itens.',
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [conferenciaId]);

  useEffect(() => {
    setPagina(1);
  }, [vista]);

  // Substitui um item na lista apos a contagem (PATCH retorna o item atualizado).
  const aoContar = useCallback(
    (atualizado: ConferenciaItemDTO) => {
      setCarga((prev) =>
        prev.fase === 'ok'
          ? {
              ...prev,
              itens: prev.itens.map((i) => (i.id === atualizado.id ? atualizado : i)),
            }
          : prev,
      );
      aoMudar();
    },
    [aoMudar],
  );

  const aoRemover = useCallback(
    (itemId: string) => {
      setCarga((prev) =>
        prev.fase === 'ok'
          ? {
              ...prev,
              itens: prev.itens.filter((i) => i.id !== itemId),
              total: Math.max(0, prev.total - 1),
            }
          : prev,
      );
      aoMudar();
    },
    [aoMudar],
  );

  const itens = useMemo(() => (carga.fase === 'ok' ? carga.itens : []), [carga]);
  const contados = useMemo(() => itens.filter(itemContado).length, [itens]);
  const prog = progressoContagem(contados, itens.length);

  const filtrados = useMemo(() => {
    if (vista === 'todos') return itens;
    const querContado = vista === 'contados';
    return itens.filter((i) => itemContado(i) === querContado);
  }, [itens, vista]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA_CLIENTE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice(
    (paginaSegura - 1) * POR_PAGINA_CLIENTE,
    paginaSegura * POR_PAGINA_CLIENTE,
  );

  if (carga.fase === 'carregando') {
    return (
      <SkeletonGrupo rotulo="Carregando itens para contagem">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-gov-card bg-app-border-subtle" />
          ))}
        </div>
      </SkeletonGrupo>
    );
  }

  if (carga.fase === 'erro') {
    return (
      <Alerta tipo="erro" titulo="Erro ao carregar itens">
        {carga.mensagem}
      </Alerta>
    );
  }

  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={PackageSearch}
        titulo="Nenhum item no escopo"
        descricao="Não há itens congelados no snapshot desta conferência. Se houver itens físicos não previstos, use “Adicionar sobra”."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Progresso */}
      <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-app-fg">Progresso da contagem</span>
          <span className="tabular text-app-fg-muted">{prog.texto}</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-app-surface-2"
          role="progressbar"
          aria-valuenow={prog.pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso da contagem: ${prog.texto}`}
        >
          <div
            className="h-full rounded-full bg-gov-azul transition-[width]"
            style={{ width: `${prog.pct}%` }}
          />
        </div>
      </div>

      {carga.parcial ? (
        <Alerta tipo="aviso" titulo="Lista parcial">
          Esta conferência tem {carga.total.toLocaleString('pt-BR')} itens e a tela carregou os{' '}
          {itens.length.toLocaleString('pt-BR')} primeiros. O progresso acima considera apenas os
          itens listados. Abra conferências com escopo por local para contar o inventário inteiro.
        </Alerta>
      ) : null}

      {/* Filtro de vista */}
      <div role="group" aria-label="Filtrar itens" className="flex flex-wrap gap-1">
        <FiltroChip ativo={vista === 'pendentes'} onClick={() => setVista('pendentes')}>
          Pendentes ({itens.length - contados})
        </FiltroChip>
        <FiltroChip ativo={vista === 'contados'} onClick={() => setVista('contados')}>
          Contados ({contados})
        </FiltroChip>
        <FiltroChip ativo={vista === 'todos'} onClick={() => setVista('todos')}>
          Todos ({itens.length})
        </FiltroChip>
      </div>

      {!podeGerenciar ? (
        <Alerta tipo="info" titulo="Somente leitura">
          Você pode acompanhar a contagem, mas apenas um administrador pode registrar contagens.
        </Alerta>
      ) : null}

      {filtrados.length === 0 ? (
        <EstadoVazio
          icone={vista === 'pendentes' ? Check : ClipboardList}
          titulo={vista === 'pendentes' ? 'Tudo contado' : 'Nada aqui'}
          descricao={
            vista === 'pendentes'
              ? 'Todos os itens deste escopo já foram contados. Conclua a conferência para tratar as divergências.'
              : 'Nenhum item corresponde a este filtro.'
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {visiveis.map((item) => (
              <li key={item.id}>
                {item.materialId ? (
                  <ItemQuantificavel
                    item={item}
                    conferenciaId={conferenciaId}
                    podeGerenciar={podeGerenciar}
                    resolvedores={resolvedores}
                    aoContar={aoContar}
                    aoRemover={aoRemover}
                    aoNotificar={aoNotificar}
                  />
                ) : (
                  <ItemSerializado
                    item={item}
                    conferencia={conferencia}
                    podeGerenciar={podeGerenciar}
                    resolvedores={resolvedores}
                    aoContar={aoContar}
                    aoRemover={aoRemover}
                    aoNotificar={aoNotificar}
                  />
                )}
              </li>
            ))}
          </ul>
          <PaginacaoCliente
            pagina={paginaSegura}
            totalPaginas={totalPaginas}
            total={filtrados.length}
            aoPaginar={setPagina}
          />
        </>
      )}
    </div>
  );
}

// ── Cartao serializado ─────────────────────────────────────────────────────────

function ItemSerializado({
  item,
  conferencia,
  podeGerenciar,
  resolvedores,
  aoContar,
  aoRemover,
  aoNotificar,
}: {
  item: ConferenciaItemDTO;
  conferencia: ConferenciaDTO;
  podeGerenciar: boolean;
  resolvedores: Resolvedores;
  aoContar: (i: ConferenciaItemDTO) => void;
  aoRemover: (itemId: string) => void;
  aoNotificar: (tipo: 'sucesso' | 'erro', texto: string) => void;
}) {
  const [salvando, setSalvando] = useState<'conferido' | 'nao_encontrado' | 'outro' | null>(null);
  const [escolhendoLocal, setEscolhendoLocal] = useState(false);
  const [localEncontrado, setLocalEncontrado] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const contado = itemContado(item);

  const opcoesLocal = separarLocaisParaContagem(
    resolvedores.locais,
    conferencia.unidade,
    item.localEsperadoId,
  );
  const avisoUnidade = localEncontrado
    ? avisoOutraUnidadeFisica(resolvedores.locais, conferencia.unidade, localEncontrado)
    : null;

  async function registrar(
    situacao: 'conferido' | 'nao_encontrado' | 'encontrado_em_outro_local',
    localId: string | null,
    chave: 'conferido' | 'nao_encontrado' | 'outro',
  ) {
    const { payload, erro: erroValidacao } = montarContagemSerializado(situacao, localId);
    if (!payload) {
      setErro(erroValidacao);
      return;
    }
    setSalvando(chave);
    setErro(null);
    try {
      const atualizado = await registrarContagem(conferencia.id, item.id, payload);
      aoContar(atualizado);
      setEscolhendoLocal(false);
      setLocalEncontrado('');
    } catch (e) {
      const msg =
        e instanceof ErroEstoque ? e.message : 'Não foi possível registrar a contagem.';
      setErro(msg);
      aoNotificar('erro', msg);
    } finally {
      setSalvando(null);
    }
  }

  const desabilitado = !podeGerenciar || salvando !== null;

  return (
    <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-app-fg">{resolvedores.rotuloItem(item)}</p>
          {resolvedores.detalheItem(item) ? (
            <p className="truncate text-2xs text-app-fg-muted">{resolvedores.detalheItem(item)}</p>
          ) : null}
          <p className="mt-0.5 flex items-center gap-1 text-2xs text-app-fg-muted">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            Esperado em {resolvedores.nomeLocal(item.localEsperadoId)}
            {item.origem === 'sobra' ? ' · Sobra' : ''}
          </p>
        </div>
        {contado && item.situacao ? <BadgeSituacaoItem situacao={item.situacao} /> : null}
      </div>

      {podeGerenciar ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <BotaoContagem
            ativo={item.situacao === 'conferido'}
            carregando={salvando === 'conferido'}
            desabilitado={desabilitado}
            variante="ok"
            onClick={() => registrar('conferido', null, 'conferido')}
          >
            Conferido
          </BotaoContagem>
          <BotaoContagem
            ativo={item.situacao === 'nao_encontrado'}
            carregando={salvando === 'nao_encontrado'}
            desabilitado={desabilitado}
            variante="perigo"
            onClick={() => registrar('nao_encontrado', null, 'nao_encontrado')}
          >
            Não encontrado
          </BotaoContagem>
          <BotaoContagem
            ativo={item.situacao === 'encontrado_em_outro_local'}
            carregando={false}
            desabilitado={desabilitado}
            variante="aviso"
            onClick={() => {
              setErro(null);
              setEscolhendoLocal((v) => !v);
              setLocalEncontrado(item.localEncontradoId ?? '');
            }}
          >
            Em outro local
          </BotaoContagem>
        </div>
      ) : contado && item.situacao ? null : (
        <p className="mt-2 text-2xs text-app-fg-muted">Aguardando contagem.</p>
      )}

      {escolhendoLocal && podeGerenciar ? (
        <div className="mt-3 rounded border border-app-border-subtle bg-app-surface-2 p-3">
          <label
            htmlFor={`local-${item.id}`}
            className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
          >
            Onde o item foi encontrado?
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <select
                id={`local-${item.id}`}
                value={localEncontrado}
                onChange={(e) => setLocalEncontrado(e.target.value)}
                className="w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2.5 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
              >
                <option value="">Selecione o local</option>
                <optgroup label={`Nesta unidade (${conferencia.unidade})`}>
                  {opcoesLocal.nesta.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.rotulo}
                    </option>
                  ))}
                </optgroup>
                {opcoesLocal.outras.length > 0 ? (
                  <optgroup label="Em outra unidade física">
                    {opcoesLocal.outras.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.rotulo} ({l.unidade})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-app-fg-muted"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
            <button
              type="button"
              disabled={desabilitado}
              onClick={() =>
                registrar('encontrado_em_outro_local', localEncontrado || null, 'outro')
              }
              className="min-h-11 rounded bg-gov-azul px-4 py-2 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              {salvando === 'outro' ? 'Salvando…' : 'Confirmar local'}
            </button>
          </div>
          {avisoUnidade ? (
            <p className="mt-2 text-2xs font-medium text-amber-900">{avisoUnidade}</p>
          ) : null}
        </div>
      ) : null}

      {erro ? (
        <p role="alert" className="mt-2 text-sm text-gov-perigo">
          {erro}
        </p>
      ) : null}

      {/* Sobra adicionada por engano tem saída; item de snapshot, não. */}
      {podeGerenciar && item.origem === 'sobra' && item.reconciliadoEm === null ? (
        <div className="mt-2 flex justify-end">
          <RemoverSobra
            item={item}
            conferenciaId={conferencia.id}
            aoRemover={aoRemover}
            aoNotificar={aoNotificar}
          />
        </div>
      ) : null}
    </div>
  );
}

// ── Cartao quantificavel ────────────────────────────────────────────────────────

function ItemQuantificavel({
  item,
  conferenciaId,
  podeGerenciar,
  resolvedores,
  aoContar,
  aoRemover,
  aoNotificar,
}: {
  item: ConferenciaItemDTO;
  conferenciaId: string;
  podeGerenciar: boolean;
  resolvedores: Resolvedores;
  aoContar: (i: ConferenciaItemDTO) => void;
  aoRemover: (itemId: string) => void;
  aoNotificar: (tipo: 'sucesso' | 'erro', texto: string) => void;
}) {
  const [valor, setValor] = useState<string>(
    item.quantidadeContada !== null ? String(item.quantidadeContada) : '',
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ultimoSalvo = useRef<number | null>(item.quantidadeContada);

  // Sincroniza o campo se o item mudar por outra via (ex.: recarga).
  useEffect(() => {
    if (item.quantidadeContada !== ultimoSalvo.current) {
      setValor(item.quantidadeContada !== null ? String(item.quantidadeContada) : '');
      ultimoSalvo.current = item.quantidadeContada;
    }
  }, [item.quantidadeContada]);

  const sistema = item.quantidadeSistema ?? 0;
  const contadaNum = valor.trim() === '' ? null : Number(valor);
  const previa =
    contadaNum !== null && Number.isFinite(contadaNum) ? contadaNum - sistema : null;

  async function salvar() {
    if (contadaNum === null) {
      setErro('Informe a quantidade contada.');
      return;
    }
    const { payload, erro: erroValidacao } = montarContagemQuantidade(contadaNum);
    if (!payload) {
      setErro(erroValidacao);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await registrarContagem(conferenciaId, item.id, payload);
      ultimoSalvo.current = atualizado.quantidadeContada;
      aoContar(atualizado);
    } catch (e) {
      const msg = e instanceof ErroEstoque ? e.message : 'Não foi possível salvar a contagem.';
      setErro(msg);
      aoNotificar('erro', msg);
    } finally {
      setSalvando(false);
    }
  }

  const contado = itemContado(item);
  const alterado = contadaNum !== item.quantidadeContada;

  return (
    <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-app-fg">{resolvedores.rotuloItem(item)}</p>
          <p className="mt-0.5 flex items-center gap-1 text-2xs text-app-fg-muted">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {resolvedores.nomeLocal(item.localEsperadoId)}
            {item.tamanho ? ` · Tamanho ${item.tamanho}` : ''}
            {item.origem === 'sobra' ? ' · Sobra' : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
            Sistema
          </span>
          <p className="text-lg font-semibold tabular text-app-fg">
            {sistema.toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      {podeGerenciar ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor={`qtd-${item.id}`}
              className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Quantidade contada
            </label>
            <input
              id={`qtd-${item.id}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setErro(null);
              }}
              className="mt-1 w-full rounded border border-app-border-input bg-app-surface px-3 py-2.5 text-base text-app-fg tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
            />
          </div>
          <button
            type="button"
            disabled={salvando || !alterado}
            onClick={() => void salvar()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-gov-azul px-4 py-2 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {salvando ? 'Salvando…' : contado && !alterado ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-2xs text-app-fg-muted">
          {contado
            ? `Contado: ${(item.quantidadeContada ?? 0).toLocaleString('pt-BR')}`
            : 'Aguardando contagem.'}
        </p>
      )}

      {previa !== null && previa !== 0 && alterado ? (
        <p
          className={[
            'mt-2 text-2xs font-medium tabular',
            previa > 0 ? 'text-blue-900' : 'text-amber-900',
          ].join(' ')}
        >
          {previa > 0
            ? `Sobra de ${previa.toLocaleString('pt-BR')} em relação ao sistema.`
            : `Falta de ${Math.abs(previa).toLocaleString('pt-BR')} em relação ao sistema.`}
        </p>
      ) : null}

      {erro ? (
        <p role="alert" className="mt-2 text-sm text-gov-perigo">
          {erro}
        </p>
      ) : null}

      {/* Sobra adicionada por engano tem saída; item de snapshot, não. */}
      {podeGerenciar && item.origem === 'sobra' && item.reconciliadoEm === null ? (
        <div className="mt-2 flex justify-end">
          <RemoverSobra
            item={item}
            conferenciaId={conferenciaId}
            aoRemover={aoRemover}
            aoNotificar={aoNotificar}
          />
        </div>
      ) : null}
    </div>
  );
}

// ── Auxiliares de UI ────────────────────────────────────────────────────────────

/**
 * Excluir item de SOBRA adicionado por engano (ex.: a unidade errada, entre duas
 * de descricao parecida). So aparece para sobra: item do escopo conferido e
 * evidencia e nao se apaga. Sem `window.confirm`: ConfirmDialog do projeto.
 */
function RemoverSobra({
  item,
  conferenciaId,
  aoRemover,
  aoNotificar,
}: {
  item: ConferenciaItemDTO;
  conferenciaId: string;
  aoRemover: (itemId: string) => void;
  aoNotificar: (tipo: 'sucesso' | 'erro', texto: string) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  async function remover() {
    setRemovendo(true);
    try {
      await removerSobra(conferenciaId, item.id);
      aoNotificar('sucesso', 'Item de sobra removido da conferência.');
      aoRemover(item.id);
    } catch (e) {
      aoNotificar(
        'erro',
        e instanceof ErroEstoque ? e.message : 'Não foi possível remover o item.',
      );
      setRemovendo(false);
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        disabled={removendo}
        className="inline-flex min-h-11 items-center gap-1.5 rounded px-2 py-1 text-2xs font-medium text-gov-perigo hover:bg-red-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-perigo"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Excluir sobra
      </button>
      <ConfirmDialog
        aberto={confirmando}
        titulo="Excluir item de sobra"
        descricao={
          <>
            Remover este item da conferência? Ele foi adicionado como sobra e ainda não gerou
            movimentação no estoque. Esta ação não pode ser desfeita.
          </>
        }
        rotuloConfirmar="Excluir"
        variante="perigo"
        aoConfirmar={remover}
        aoCancelar={() => setConfirmando(false)}
      />
    </>
  );
}

function BotaoContagem({
  children,
  ativo,
  carregando,
  desabilitado,
  variante,
  onClick,
}: {
  children: React.ReactNode;
  ativo: boolean;
  carregando: boolean;
  desabilitado: boolean;
  variante: 'ok' | 'perigo' | 'aviso';
  onClick: () => void;
}) {
  const cor = ativo
    ? {
        ok: 'border-gov-sucesso bg-green-50 text-gov-sucesso',
        perigo: 'border-gov-perigo bg-red-50 text-gov-perigo',
        aviso: 'border-amber-400 bg-amber-50 text-amber-900',
      }[variante]
    : 'border-app-border-input bg-app-surface text-app-fg hover:bg-app-surface-2';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      aria-pressed={ativo}
      className={[
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
        cor,
      ].join(' ')}
    >
      {ativo ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
      {carregando ? 'Salvando…' : children}
    </button>
  );
}

function FiltroChip({
  children,
  ativo,
  onClick,
}: {
  children: React.ReactNode;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
        ativo
          ? 'border-gov-azul bg-gov-azul text-white'
          : 'border-app-border-input bg-app-surface text-app-fg hover:bg-app-surface-2',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function PaginacaoCliente({
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
        Página {pagina} de {totalPaginas}, {total.toLocaleString('pt-BR')} itens
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => aoPaginar(Math.max(1, pagina - 1))}
          disabled={pagina <= 1}
          className="min-h-11 rounded border border-app-border-subtle bg-app-surface px-4 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => aoPaginar(Math.min(totalPaginas, pagina + 1))}
          disabled={pagina >= totalPaginas}
          className="min-h-11 rounded border border-app-border-subtle bg-app-surface px-4 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Próxima
        </button>
      </div>
    </nav>
  );
}
