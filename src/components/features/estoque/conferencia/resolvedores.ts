'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarLocais, listarMateriais, listarUnidades } from '../api';
import type { ConferenciaDTO, ConferenciaItemDTO } from '../conferencia-dtos';
import type { LocalDTO, MaterialDTO, UnidadeDTO } from '../dtos';

const POR_PAGINA = 200;
const TETO_PAGINAS = 12; // ~2400 itens: cobre a maior unidade fisica com folga.

/**
 * O `ConferenciaItemDTO` carrega apenas ids (unidade/material/local). Para a tela
 * ter sentido para o almoxarife, resolvemos os rotulos legiveis pelos endpoints
 * de listagem ja existentes (uma vez por sessao, com cache local). Serializado
 * resolve a unidade fisica inteira (cobre a sobra em local fora do escopo);
 * quantificavel resolve o catalogo de materiais quantificaveis. Locais sempre.
 */
export interface Resolvedores {
  carregando: boolean;
  /** Rotulo de um local pelo id ("—" quando ausente/nao resolvido). */
  nomeLocal: (id: string | null) => string;
  /** Titulo do item (descricao do equipamento/material) para exibir no card. */
  rotuloItem: (item: ConferenciaItemDTO) => string;
  /** Linha de contexto secundaria (patrimonio/serie, ou tamanho). */
  detalheItem: (item: ConferenciaItemDTO) => string | null;
  /** Locais carregados (para selects de "encontrado em outro local"/sobra). */
  locais: LocalDTO[];
}

async function listarTodasUnidades(unidade: 'PENHA' | 'ARARAQUARA', signal: AbortSignal) {
  const acc: UnidadeDTO[] = [];
  for (let pagina = 1; pagina <= TETO_PAGINAS; pagina += 1) {
    const r = await listarUnidades({ unidade, pagina, porPagina: POR_PAGINA }, signal);
    acc.push(...r.itens);
    if (acc.length >= r.total || r.itens.length === 0) break;
  }
  return acc;
}

async function listarTodosMateriaisQuant(signal: AbortSignal) {
  const acc: MaterialDTO[] = [];
  for (let pagina = 1; pagina <= TETO_PAGINAS; pagina += 1) {
    const r = await listarMateriais(
      { natureza: 'quantificavel', pagina, porPagina: POR_PAGINA },
      signal,
    );
    acc.push(...r.itens);
    if (acc.length >= r.total || r.itens.length === 0) break;
  }
  return acc;
}

/** Descricao curta de uma unidade serializada (identidade para a contagem). */
function labelUnidade(u: UnidadeDTO): string {
  return u.descricao || 'Item serializado';
}

function detalheUnidade(u: UnidadeDTO): string | null {
  const partes: string[] = [];
  const pat = u.codigoSpaguas || u.patDaee || u.codigo || u.outrosPat;
  if (pat) partes.push(`Patrimônio ${pat}`);
  if (u.numeroSerie) partes.push(`Série ${u.numeroSerie}`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

export function useResolvedores(conferencia: ConferenciaDTO | null): Resolvedores {
  const [locais, setLocais] = useState<LocalDTO[]>([]);
  const [unidadePorId, setUnidadePorId] = useState<Map<string, UnidadeDTO>>(new Map());
  const [materialPorId, setMaterialPorId] = useState<Map<string, MaterialDTO>>(new Map());
  const [carregando, setCarregando] = useState(true);

  const natureza = conferencia?.natureza ?? null;
  const unidadeFisica = conferencia?.unidade ?? null;

  useEffect(() => {
    if (!conferencia) return;
    let ativo = true;
    const c = new AbortController();
    setCarregando(true);
    (async () => {
      const [l, alvos] = await Promise.all([
        listarLocais(undefined, c.signal),
        natureza === 'serializado' && unidadeFisica
          ? listarTodasUnidades(unidadeFisica, c.signal)
          : natureza === 'quantificavel'
            ? listarTodosMateriaisQuant(c.signal)
            : Promise.resolve([]),
      ]);
      if (!ativo) return;
      setLocais(l.itens);
      if (natureza === 'serializado') {
        setUnidadePorId(new Map((alvos as UnidadeDTO[]).map((u) => [u.id, u])));
      } else if (natureza === 'quantificavel') {
        setMaterialPorId(new Map((alvos as MaterialDTO[]).map((m) => [m.id, m])));
      }
    })()
      .catch(() => {
        /* rotulos degradam para o id curto; a tela nao quebra */
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
      c.abort();
    };
    // Chaveado por primitivos (id/natureza/unidade), nao pelo objeto: refresh do
    // cabecalho troca a referencia da conferencia sem mudar o escopo, e nao deve
    // re-baixar o catalogo inteiro de unidades/materiais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferencia?.id, natureza, unidadeFisica]);

  const localPorId = useMemo(() => new Map(locais.map((l) => [l.id, l])), [locais]);

  const nomeLocal = useCallback(
    (id: string | null) => (id ? (localPorId.get(id)?.rotulo ?? '—') : '—'),
    [localPorId],
  );

  const rotuloItem = useCallback(
    (item: ConferenciaItemDTO) => {
      if (item.materialId) {
        return materialPorId.get(item.materialId)?.descricao ?? `Material ${item.materialId.slice(0, 8)}`;
      }
      if (item.unidadeId) {
        const u = unidadePorId.get(item.unidadeId);
        return u ? labelUnidade(u) : `Item ${item.unidadeId.slice(0, 8)}`;
      }
      return 'Item';
    },
    [materialPorId, unidadePorId],
  );

  const detalheItem = useCallback(
    (item: ConferenciaItemDTO) => {
      if (item.materialId) {
        return item.tamanho ? `Tamanho ${item.tamanho}` : null;
      }
      if (item.unidadeId) {
        const u = unidadePorId.get(item.unidadeId);
        return u ? detalheUnidade(u) : null;
      }
      return null;
    },
    [unidadePorId],
  );

  return { carregando, nomeLocal, rotuloItem, detalheItem, locais };
}
