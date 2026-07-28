'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { listarMateriais, listarUnidades } from '../api';
import { adicionarSobra } from '../conferencia-api';
import { ErroEstoque } from '../erros';
import type { ConferenciaDTO, SobraPayload } from '../conferencia-dtos';
import type { LocalDTO, MaterialDTO, UnidadeDTO } from '../dtos';

interface Props {
  aberto: boolean;
  conferencia: ConferenciaDTO;
  locais: readonly LocalDTO[];
  aoFechar: () => void;
  aoAdicionar: (mensagem: string) => void;
}

const CLASSE_CAMPO =
  'w-full rounded border border-app-border-input bg-app-surface px-3 py-2.5 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul';
const CLASSE_SELECT = `${CLASSE_CAMPO} appearance-none pr-8`;

/**
 * Dialog de adicionar item "sobra" (admin, sessão aberta): um item físico contado
 * fora do snapshot, com o alvo JÁ cadastrado. Serializado: uma unidade encontrada
 * num local (vira transferência na reconciliação). Quantificável: material sem
 * saldo no snapshot, com quantidade (vira entrada). Item físico ainda não
 * cadastrado fica para a Fase 2: cadastre a unidade/material antes.
 */
export function AdicionarSobraDialog({ aberto, conferencia, locais, aoFechar, aoAdicionar }: Props) {
  const serializado = conferencia.natureza === 'serializado';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const baseId = useId();

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Falha ao carregar catalogo/busca, separada do erro de validacao do formulario. */
  const [erroCatalogo, setErroCatalogo] = useState<string | null>(null);

  // Serializado
  const [buscaUnidade, setBuscaUnidade] = useState('');
  const [resultados, setResultados] = useState<UnidadeDTO[]>([]);
  const [unidadeId, setUnidadeId] = useState('');
  const [localEncontradoId, setLocalEncontradoId] = useState('');

  // Quantificavel
  const [materiais, setMateriais] = useState<MaterialDTO[]>([]);
  const [buscaMaterial, setBuscaMaterial] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [localId, setLocalId] = useState('');
  const [tamanho, setTamanho] = useState('');
  const [quantidade, setQuantidade] = useState('');

  const locaisUnidade = useMemo(
    () => locais.filter((l) => l.unidade === conferencia.unidade),
    [locais, conferencia.unidade],
  );

  useEffect(() => {
    if (!aberto) return;
    setEnviando(false);
    setErro(null);
    setErroCatalogo(null);
    setBuscaUnidade('');
    setResultados([]);
    setUnidadeId('');
    setLocalEncontradoId('');
    setBuscaMaterial('');
    setMaterialId('');
    setLocalId('');
    setTamanho('');
    setQuantidade('');
  }, [aberto]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => {
        dlg.querySelector<HTMLInputElement>('input[data-inicial]')?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  // Materiais quantificaveis (catalogo) para o select, carregado ao abrir.
  useEffect(() => {
    if (!aberto || serializado) return;
    let ativo = true;
    const c = new AbortController();
    setErroCatalogo(null);
    listarMateriais({ natureza: 'quantificavel', apenasAtivos: true, porPagina: 200 }, c.signal)
      .then((r) => {
        if (ativo) setMateriais(r.itens);
      })
      .catch((e) => {
        // Sem isto, uma falha de rede virava "Selecione" com a lista vazia e o
        // operador concluia que o material nao existe no catalogo.
        if (!ativo || c.signal.aborted) return;
        setMateriais([]);
        setErroCatalogo(
          e instanceof ErroEstoque
            ? e.message
            : 'Não foi possível carregar o catálogo de materiais.',
        );
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [aberto, serializado]);

  // Busca de unidade serializada (debounced, no servidor).
  useEffect(() => {
    if (!aberto || !serializado) return;
    const termo = buscaUnidade.trim();
    if (termo.length < 2) {
      setResultados([]);
      return;
    }
    let ativo = true;
    const c = new AbortController();
    setErroCatalogo(null);
    const t = setTimeout(() => {
      listarUnidades({ unidade: conferencia.unidade, busca: termo, porPagina: 20 }, c.signal)
        .then((r) => {
          if (ativo) setResultados(r.itens);
        })
        .catch((e) => {
          // Busca que falha nao pode se parecer com busca sem resultado: aqui a
          // conclusao errada e "a unidade nao esta cadastrada".
          if (!ativo || c.signal.aborted) return;
          setResultados([]);
          setErroCatalogo(
            e instanceof ErroEstoque ? e.message : 'Não foi possível buscar as unidades.',
          );
        });
    }, 300);
    return () => {
      ativo = false;
      c.abort();
      clearTimeout(t);
    };
  }, [aberto, serializado, buscaUnidade, conferencia.unidade]);

  const materiaisFiltrados = useMemo(() => {
    const termo = buscaMaterial.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return materiais;
    return materiais.filter((m) => m.descricao.toLocaleLowerCase('pt-BR').includes(termo));
  }, [materiais, buscaMaterial]);

  function validar(): SobraPayload | null {
    if (serializado) {
      if (!unidadeId) {
        setErro('Busque e selecione a unidade encontrada.');
        return null;
      }
      if (!localEncontradoId) {
        setErro('Selecione o local onde a unidade foi encontrada.');
        return null;
      }
      return { unidadeId, localEncontradoId };
    }
    if (!materialId) {
      setErro('Selecione o material.');
      return null;
    }
    if (!localId) {
      setErro('Selecione o local.');
      return null;
    }
    const q = Number(quantidade);
    if (!Number.isInteger(q) || q < 1) {
      setErro('Informe uma quantidade inteira de pelo menos 1.');
      return null;
    }
    return {
      materialId,
      localId,
      quantidadeContada: q,
      ...(tamanho.trim() ? { tamanho: tamanho.trim() } : {}),
    };
  }

  async function enviar() {
    const payload = validar();
    if (!payload) return;
    setEnviando(true);
    setErro(null);
    try {
      await adicionarSobra(conferencia.id, payload);
      aoAdicionar('Item sobra adicionado à conferência.');
    } catch (e) {
      setErro(
        e instanceof ErroEstoque ? e.message : 'Não foi possível adicionar o item. Tente novamente.',
      );
      setEnviando(false);
    }
  }

  function labelUnidade(u: UnidadeDTO): string {
    const pat = u.codigoSpaguas || u.patDaee || u.codigo || u.outrosPat;
    return pat ? `${u.descricao} (${pat})` : u.descricao;
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        if (enviando) {
          e.preventDefault();
          return;
        }
        aoFechar();
      }}
      onClose={() => {
        if (aberto) aoFechar();
      }}
      aria-modal="true"
      aria-labelledby={`${baseId}-titulo`}
      className="m-0 w-full max-w-lg rounded-gov-card border border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="flex max-h-[85vh] flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={`${baseId}-titulo`} className="text-lg font-semibold">
            Adicionar sobra
          </h2>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            Item físico contado fora do retrato inicial. O alvo precisa já estar cadastrado no
            sistema
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {serializado ? (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${baseId}-busca`} className="text-sm font-medium text-app-fg">
                  Buscar unidade (descrição, patrimônio ou série)
                </label>
                <input
                  id={`${baseId}-busca`}
                  data-inicial
                  type="text"
                  value={buscaUnidade}
                  onChange={(e) => {
                    setBuscaUnidade(e.target.value);
                    setUnidadeId('');
                  }}
                  className={CLASSE_CAMPO}
                  placeholder="Digite ao menos 2 caracteres"
                />
              </div>

              {buscaUnidade.trim().length >= 2 ? (
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${baseId}-unidade`} className="text-sm font-medium text-app-fg">
                    Unidade encontrada
                  </label>
                  <div className="relative">
                    <select
                      id={`${baseId}-unidade`}
                      value={unidadeId}
                      onChange={(e) => setUnidadeId(e.target.value)}
                      className={CLASSE_SELECT}
                    >
                      <option value="">
                        {resultados.length === 0 ? 'Nenhuma unidade encontrada' : 'Selecione'}
                      </option>
                      {resultados.map((u) => (
                        <option key={u.id} value={u.id}>
                          {labelUnidade(u)}
                        </option>
                      ))}
                    </select>
                    <Seta />
                  </div>
                </div>
              ) : null}

              <CampoLocal
                id={`${baseId}-local-enc`}
                rotulo="Local onde foi encontrada"
                valor={localEncontradoId}
                locais={locaisUnidade}
                aoMudar={setLocalEncontradoId}
              />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${baseId}-busca-mat`} className="text-sm font-medium text-app-fg">
                  Filtrar material
                </label>
                <input
                  id={`${baseId}-busca-mat`}
                  data-inicial
                  type="text"
                  value={buscaMaterial}
                  onChange={(e) => setBuscaMaterial(e.target.value)}
                  className={CLASSE_CAMPO}
                  placeholder="Descrição do material"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${baseId}-material`} className="text-sm font-medium text-app-fg">
                  Material
                </label>
                <div className="relative">
                  <select
                    id={`${baseId}-material`}
                    value={materialId}
                    onChange={(e) => setMaterialId(e.target.value)}
                    className={CLASSE_SELECT}
                  >
                    <option value="">Selecione</option>
                    {materiaisFiltrados.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.descricao}
                      </option>
                    ))}
                  </select>
                  <Seta />
                </div>
              </div>

              <CampoLocal
                id={`${baseId}-local`}
                rotulo="Local"
                valor={localId}
                locais={locaisUnidade}
                aoMudar={setLocalId}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${baseId}-tamanho`} className="text-sm font-medium text-app-fg">
                    Tamanho (opcional)
                  </label>
                  <input
                    id={`${baseId}-tamanho`}
                    type="text"
                    value={tamanho}
                    onChange={(e) => setTamanho(e.target.value)}
                    className={CLASSE_CAMPO}
                    placeholder="Bitola, medida ou lote"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${baseId}-qtd`} className="text-sm font-medium text-app-fg">
                    Quantidade contada
                  </label>
                  <input
                    id={`${baseId}-qtd`}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    className={`${CLASSE_CAMPO} tabular`}
                  />
                </div>
              </div>
            </>
          )}

          {erroCatalogo ? (
            <div
              role="status"
              className="rounded border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {erroCatalogo} A lista pode estar incompleta; feche e abra o diálogo para tentar de
              novo.
            </div>
          ) : null}

          {erro ? (
            <div
              role="alert"
              className="rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
            >
              {erro}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={aoFechar}
            disabled={enviando}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {enviando ? 'Adicionando…' : 'Adicionar item'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function CampoLocal({
  id,
  rotulo,
  valor,
  locais,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  valor: string;
  locais: readonly LocalDTO[];
  aoMudar: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      <div className="relative">
        <select
          id={id}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className={CLASSE_SELECT}
        >
          <option value="">Selecione o local</option>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>
              {l.rotulo}
            </option>
          ))}
        </select>
        <Seta />
      </div>
    </div>
  );
}

function Seta() {
  return (
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
  );
}
