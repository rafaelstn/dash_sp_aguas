'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import type {
  ElementoDiagrama,
  ElementoLinha,
} from '@/domain/diagramas/tipos';
import type { Diagrama } from '@/domain/diagramas/diagrama';
import {
  inserirPonto,
  moverPonto,
  removerPonto,
} from '@/domain/diagramas/pontos';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DialogNomeDiagrama } from '../DialogNomeDiagrama';
import { ToolbarEditor } from './ToolbarEditor';
import { MenuExportar } from './MenuExportar';
import { useExportarDiagrama } from './useExportarDiagrama';
import { importarJson } from './exportar-diagrama';
import { IndicadorSalvamento } from './IndicadorSalvamento';
import { LegendaStatus } from './LegendaStatus';
import { DialogEditarElemento } from './DialogEditarElemento';
import { NodeReservatorio } from './nodes/NodeReservatorio';
import { NodeNivel } from './nodes/NodeNivel';
import { NodeChuva } from './nodes/NodeChuva';
import { NodeLinha } from './nodes/NodeLinha';
import { useAutoSave } from './useAutoSave';
import { elementosParaNodes, nodesParaElementos } from './mapeamento';
import {
  criarChuva,
  criarLinha,
  criarNivel,
  criarReservatorio,
} from './fabrica';
import { useHistoricoDiagrama } from './useHistoricoDiagrama';
import type { AcoesLinha, Ferramenta, NodeDiagrama } from './tipos-editor';

interface Props {
  diagrama: Diagrama;
}

const tiposDeNode = {
  reservatorio: NodeReservatorio,
  nivel: NodeNivel,
  chuva: NodeChuva,
  linha: NodeLinha,
} as const;

/**
 * Editor visual de diagramas unifilares (Fase A2 + A3), padrão SIBH/DAEE.
 *
 * Faixa azul no topo (nome + toolbar + indicador de save), canvas React Flow
 * com fundo claro, minimapa, controles e legenda de status. O array de
 * `ElementoDiagrama` é a fonte da verdade: os nodes são derivados dele e cada
 * ação significativa (adicionar/mover/excluir/editar/ajustar rio) reconstrói o
 * array, registra no histórico (undo/redo) e dispara o auto-save (PATCH).
 *
 * A11y: a toolbar é `role=toolbar` operável por teclado; o canvas tem uma
 * alternativa textual (lista dos elementos) para leitor de tela. Atalhos:
 * Delete remove o selecionado, Enter abre a edição do selecionado, Ctrl+Z
 * desfaz, Ctrl+Shift+Z / Ctrl+Y refaz. Exclusão via ConfirmDialog.
 */
function EditorInterno({ diagrama }: Props) {
  const router = useRouter();
  const { screenToFlowPosition } = useReactFlow();
  const instanciaRef = useRef<ReactFlowInstance<NodeDiagrama> | null>(null);
  // Container do React Flow, alvo da captura de imagem (PNG/SVG/PDF).
  const canvasRef = useRef<HTMLDivElement>(null);
  // Input file oculto para o fluxo de importação de JSON.
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const [nomeDiagrama, setNomeDiagrama] = useState(diagrama.nome);
  const [nodes, setNodes] = useState<NodeDiagrama[]>(() =>
    elementosParaNodes(diagrama.elementos),
  );
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [aExcluir, setAExcluir] = useState<NodeDiagrama | null>(null);
  const [emEdicao, setEmEdicao] = useState<ElementoDiagrama | null>(null);
  const [renomeando, setRenomeando] = useState(false);
  // Elementos pendentes de importação, aguardando confirmação de troca.
  const [importPendente, setImportPendente] = useState<ElementoDiagrama[] | null>(
    null,
  );
  // Erro de importação (JSON inválido ou fora do formato), exibido em alerta.
  const [erroImport, setErroImport] = useState<string | null>(null);

  const {
    estado: estadoSalvamento,
    agendar,
    tentarNovamente: tentarSalvarNovamente,
  } = useAutoSave(diagrama.id);

  // Histórico (undo/redo) sobre o array de elementos (hook useHistoricoDiagrama).
  // Em desfazer/refazer, `restaurarHistorico` re-renderiza os nodes e dispara
  // o auto-save com o estado restaurado.
  const restaurarHistorico = useCallback(
    (elementos: ElementoDiagrama[]) => {
      setNodes(elementosParaNodes(elementos));
      agendar(elementos);
    },
    [agendar, setNodes],
  );
  const {
    registrar: registrarHistorico,
    desfazer,
    refazer,
    podeDesfazer,
    podeRefazer,
  } = useHistoricoDiagrama(diagrama.elementos, restaurarHistorico);

  /**
   * Aplica um novo array de elementos: re-renderiza nodes, dispara auto-save e,
   * por padrão, registra no histórico. `registrar=false` para mutações
   * intermediárias (arrasto em andamento) que não devem virar passo de undo.
   */
  const aplicarElementos = useCallback(
    (proximos: ElementoDiagrama[], registrar = true) => {
      setNodes(elementosParaNodes(proximos));
      agendar(proximos);
      if (registrar) {
        registrarHistorico(proximos);
      }
    },
    [agendar, setNodes, registrarHistorico],
  );

  // Exportação client-side (PNG/SVG/PDF/JSON). Lê os elementos atuais via
  // getter para sempre exportar a edição mais recente sem recriar o hook.
  const {
    exportar,
    formatoEmAndamento,
    erro: erroExport,
    limparErro: limparErroExport,
  } = useExportarDiagrama({
    diagrama: {
      nome: nomeDiagrama,
      bacia: diagrama.bacia,
      descricao: diagrama.descricao,
    },
    elementos: () => nodesParaElementos(nodes),
    instancia: () => instanciaRef.current,
    alvo: () => canvasRef.current,
  });

  /** Abre o seletor de arquivo para importar um diagrama em JSON. */
  const abrirImportacao = useCallback(() => {
    setErroImport(null);
    inputArquivoRef.current?.click();
  }, []);

  /** Lê e valida o arquivo escolhido; em sucesso, pede confirmação da troca. */
  const aoEscolherArquivo = useCallback(
    async (evento: React.ChangeEvent<HTMLInputElement>) => {
      const arquivo = evento.target.files?.[0];
      // Limpa o valor para permitir reimportar o mesmo arquivo depois.
      evento.target.value = '';
      if (!arquivo) return;
      try {
        const texto = await arquivo.text();
        const resultado = importarJson(texto);
        if (!resultado.ok) {
          setErroImport(resultado.erro);
          return;
        }
        setErroImport(null);
        setImportPendente(resultado.elementos);
      } catch {
        setErroImport(
          'Não foi possível ler o arquivo selecionado. Tente novamente.',
        );
      }
    },
    [],
  );

  /** Confirma a importação: substitui os elementos e dispara o auto-save. */
  const confirmarImportacao = useCallback(() => {
    if (!importPendente) return;
    aplicarElementos(importPendente);
    setSelecionadoId(null);
    setImportPendente(null);
  }, [importPendente, aplicarElementos]);

  const aoMudarNodes = useCallback(
    (mudancas: NodeChange<NodeDiagrama>[]) => {
      setNodes((atuais) => {
        const proximos = applyNodeChanges(mudancas, atuais);
        // Só confirma (auto-save + histórico) quando o arrasto termina
        // (dragging=false) ou em remoção; evita PATCH/undo por pixel.
        const confirmar = mudancas.some(
          (m) =>
            (m.type === 'position' && m.dragging === false) ||
            m.type === 'remove',
        );
        if (confirmar) {
          const elementos = nodesParaElementos(proximos);
          agendar(elementos);
          registrarHistorico(elementos);
        }
        return proximos;
      });
    },
    [agendar, registrarHistorico],
  );

  /** Clique no canvas: adiciona o elemento da ferramenta ativa na posição. */
  const aoClicarCanvas = useCallback(
    (evento: React.MouseEvent) => {
      if (ferramenta === 'selecionar') {
        setSelecionadoId(null);
        return;
      }
      const posicao = screenToFlowPosition({
        x: evento.clientX,
        y: evento.clientY,
      });
      const ponto = { x: Math.round(posicao.x), y: Math.round(posicao.y) };

      let novo: ElementoDiagrama;
      switch (ferramenta) {
        case 'reservatorio':
          novo = criarReservatorio(ponto);
          break;
        case 'nivel':
          novo = criarNivel(ponto);
          break;
        case 'chuva':
          novo = criarChuva(ponto);
          break;
        case 'linha':
          novo = criarLinha(ponto);
          break;
      }
      aplicarElementos([...nodesParaElementos(nodes), novo]);
      setSelecionadoId(novo.id);
      setFerramenta('selecionar');
    },
    [ferramenta, nodes, aplicarElementos, screenToFlowPosition],
  );

  const aoDuploCliqueNode: NodeMouseHandler<NodeDiagrama> = useCallback(
    (_evento, node) => setEmEdicao(node.data.elemento),
    [],
  );

  const excluirNode = useCallback(
    (id: string) => {
      const proximos = nodesParaElementos(nodes).filter((e) => e.id !== id);
      aplicarElementos(proximos);
      setSelecionadoId(null);
    },
    [nodes, aplicarElementos],
  );

  const editarSelecionado = useCallback(() => {
    const node = nodes.find((n) => n.id === selecionadoId);
    if (node) setEmEdicao(node.data.elemento);
  }, [nodes, selecionadoId]);

  const salvarEdicao = useCallback(
    (atualizado: ElementoDiagrama) => {
      const proximos = nodesParaElementos(nodes).map((e) =>
        e.id === atualizado.id ? atualizado : e,
      );
      aplicarElementos(proximos);
      setEmEdicao(null);
    },
    [nodes, aplicarElementos],
  );

  /**
   * Ações de edição do traçado de um rio, injetadas no `data` do node-linha.
   * `moverPonto` com `persistir=false` atualiza só os nodes (arrasto fluido);
   * com `true` confirma no histórico/auto-save. Inserir e remover sempre
   * confirmam (são ações discretas).
   */
  const acoesLinha = useMemo<AcoesLinha>(
    () => ({
      moverPonto: (id, indice, ponto, persistir) => {
        setNodes((atuais) => {
          const proximos = atuais.map((n) =>
            n.id === id && n.data.elemento.tipo === 'linha'
              ? mapearLinha(n, (linha) => ({
                  ...linha,
                  pontos: moverPonto(linha.pontos, indice, ponto),
                }))
              : n,
          );
          if (persistir) {
            const elementos = nodesParaElementos(proximos);
            agendar(elementos);
            registrarHistorico(elementos);
          }
          return proximos;
        });
      },
      inserirPonto: (id, indiceSegmento, ponto) => {
        setNodes((atuais) => {
          const proximos = atuais.map((n) =>
            n.id === id && n.data.elemento.tipo === 'linha'
              ? mapearLinha(n, (linha) => ({
                  ...linha,
                  pontos: inserirPonto(linha.pontos, indiceSegmento, ponto),
                }))
              : n,
          );
          const elementos = nodesParaElementos(proximos);
          agendar(elementos);
          registrarHistorico(elementos);
          return proximos;
        });
      },
      removerPonto: (id, indice) => {
        setNodes((atuais) => {
          const proximos = atuais.map((n) =>
            n.id === id && n.data.elemento.tipo === 'linha'
              ? mapearLinha(n, (linha) => ({
                  ...linha,
                  pontos: removerPonto(linha.pontos, indice),
                }))
              : n,
          );
          const elementos = nodesParaElementos(proximos);
          agendar(elementos);
          registrarHistorico(elementos);
          return proximos;
        });
      },
    }),
    [agendar, registrarHistorico],
  );

  // Injeta as ações de edição do rio no data dos nodes-linha selecionados.
  const nodesRender = useMemo<NodeDiagrama[]>(
    () =>
      nodes.map((n) =>
        n.data.elemento.tipo === 'linha'
          ? ({ ...n, data: { ...n.data, acoes: acoesLinha } } as NodeDiagrama)
          : n,
      ),
    [nodes, acoesLinha],
  );

  // Atalhos de teclado globais do editor: undo/redo. (Delete/Enter no node
  // são tratados pelo React Flow / handlers do node para respeitar o foco.)
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      // Não captura quando o foco está num campo de formulário/diálogo.
      if (
        alvo &&
        (alvo.tagName === 'INPUT' ||
          alvo.tagName === 'TEXTAREA' ||
          alvo.tagName === 'SELECT' ||
          alvo.isContentEditable ||
          alvo.closest('dialog'))
      ) {
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl) {
        const tecla = e.key.toLowerCase();
        if (tecla === 'z' && !e.shiftKey) {
          e.preventDefault();
          desfazer();
        } else if ((tecla === 'z' && e.shiftKey) || tecla === 'y') {
          e.preventDefault();
          refazer();
        }
        return;
      }
      // Enter sobre um node focado (React Flow torna o node focável) abre a
      // edição. O node ativo expõe `data-id` com o id do elemento.
      if (e.key === 'Enter') {
        const node = alvo?.closest<HTMLElement>('.react-flow__node[data-id]');
        const idNode = node?.getAttribute('data-id');
        if (idNode) {
          const alvoNode = nodes.find((n) => n.id === idNode);
          if (alvoNode) {
            e.preventDefault();
            setSelecionadoId(idNode);
            setEmEdicao(alvoNode.data.elemento);
          }
        }
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [desfazer, refazer, nodes]);

  async function renomear(nome: string) {
    const resp = await fetch(`/api/diagramas/${diagrama.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome }),
    });
    if (!resp.ok) throw new Error('Não foi possível renomear o diagrama.');
    setNomeDiagrama(nome);
    setRenomeando(false);
    router.refresh();
  }

  const vazio = nodes.length === 0;

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3rem)] min-h-[28rem] flex-col overflow-hidden">
      {/* Faixa azul: identidade (voltar + nome) | toolbar | exportar + save.
          Blocos separados por divisória e com respiro pra não ficar encavalado.
          No mobile empilha; no desktop a toolbar fica no centro e o bloco de
          exportar/save vai pra direita. O bloco de identidade pode encolher
          (nome trunca) para nunca espremer a toolbar a ponto de quebrar. */}
      <div className="flex flex-col gap-3 bg-gov-azul px-4 py-2.5 lg:flex-row lg:items-center lg:gap-3">
        <div className="flex min-w-0 items-center gap-2 lg:max-w-[18rem] lg:flex-1">
          <Link
            href="/diagramas"
            aria-label="Voltar para a lista de diagramas"
            title="Voltar para a lista"
            className="inline-flex shrink-0 items-center rounded-md p-1.5 text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <h1 className="min-w-0 truncate text-sm font-semibold text-white">
            {nomeDiagrama}
          </h1>
          <button
            type="button"
            onClick={() => setRenomeando(true)}
            aria-label="Renomear diagrama"
            title="Renomear diagrama"
            className="inline-flex shrink-0 items-center rounded-md p-1.5 text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <span
          className="hidden h-7 w-px shrink-0 bg-white/25 lg:inline-block"
          aria-hidden="true"
        />

        <div className="shrink-0">
          <ToolbarEditor
            ferramenta={ferramenta}
            aoTrocarFerramenta={setFerramenta}
            temSelecao={selecionadoId !== null}
            aoEditar={editarSelecionado}
            aoExcluir={() => {
              const node = nodes.find((n) => n.id === selecionadoId);
              if (node) setAExcluir(node);
            }}
            podeDesfazer={podeDesfazer}
            podeRefazer={podeRefazer}
            aoDesfazer={desfazer}
            aoRefazer={refazer}
          />
        </div>

        <span
          className="hidden h-7 w-px shrink-0 bg-white/25 lg:inline-block"
          aria-hidden="true"
        />

        <div className="flex shrink-0 items-center gap-2 lg:flex-1 lg:justify-end">
          <MenuExportar
            aoExportar={(formato) => void exportar(formato)}
            aoImportar={abrirImportacao}
            formatoEmAndamento={formatoEmAndamento}
          />
          <IndicadorSalvamento
            estado={estadoSalvamento}
            aoTentarNovamente={tentarSalvarNovamente}
          />
        </div>
      </div>

      {/* Input oculto do fluxo de importação de JSON. */}
      <input
        ref={inputArquivoRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={aoEscolherArquivo}
      />

      {/* Falha de exportação ou de importação (formato/leitura). */}
      {erroExport || erroImport ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 border-b border-gov-perigo/30 bg-red-50 px-3 py-2 text-sm text-gov-perigo"
        >
          <span>{erroExport ?? erroImport}</span>
          <button
            type="button"
            onClick={() => {
              limparErroExport();
              setErroImport(null);
            }}
            className="shrink-0 rounded px-2 py-0.5 text-xs font-medium underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-perigo"
          >
            Dispensar
          </button>
        </div>
      ) : null}

      {/* Canvas (fundo blueprint: leitura de prancha técnica SIBH) */}
      <div ref={canvasRef} className="relative flex-1 bg-app">
        <ReactFlow<NodeDiagrama>
          nodes={nodesRender}
          edges={[]}
          nodeTypes={tiposDeNode}
          onInit={(inst) => {
            instanciaRef.current = inst;
          }}
          onNodesChange={aoMudarNodes}
          onNodeDoubleClick={aoDuploCliqueNode}
          onPaneClick={aoClicarCanvas}
          onSelectionChange={({ nodes: sel }) =>
            setSelecionadoId(sel[0]?.id ?? null)
          }
          onNodesDelete={(removidos) => {
            removidos.forEach((n) => {
              if (n.id === selecionadoId) setSelecionadoId(null);
            });
          }}
          deleteKeyCode={['Delete', 'Backspace']}
          nodesConnectable={false}
          fitView
          proOptions={{ hideAttribution: true }}
          className="[&_.react-flow__pane]:cursor-crosshair data-[ferramenta=selecionar]:[&_.react-flow__pane]:cursor-default"
          data-ferramenta={ferramenta}
        >
          {/* Grade blueprint em duas camadas: pontos finos densos + cruzes
              espaçadas mais marcadas. Move com o viewport (sensação de prancha
              técnica do SIBH). */}
          <Background
            id="grade-fina"
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="hsl(var(--border-default) / 0.55)"
          />
          <Background
            id="grade-mestra"
            variant={BackgroundVariant.Cross}
            gap={96}
            size={6}
            color="hsl(var(--gov-azul) / 0.18)"
          />
          <Controls
            aria-label="Controles de zoom do diagrama"
            showInteractive={false}
          />
          <MiniMap
            pannable
            zoomable
            ariaLabel="Mapa de visão geral do diagrama"
            className="!bg-white"
          />
        </ReactFlow>

        {nodes.length > 0 ? <LegendaStatus /> : null}

        {vazio ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-gov-card border border-dashed border-app-border-strong bg-white/90 p-6 text-center">
              <p className="font-medium text-app-fg">Diagrama em branco</p>
              <p className="mt-1 text-xs text-app-fg-muted">
                Escolha uma ferramenta na barra acima e clique no canvas para
                adicionar reservatórios, postos e rios. Tudo é salvo
                automaticamente.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Alternativa textual acessível ao canvas (WCAG): leitor de tela lê a
          lista de elementos do diagrama, que o canvas visual não expõe. */}
      <section aria-label="Elementos do diagrama (versão acessível)" className="sr-only">
        <h2>Elementos do diagrama</h2>
        {vazio ? (
          <p>Nenhum elemento no diagrama.</p>
        ) : (
          <ul>
            {nodes.map((n) => (
              <li key={n.id}>{descreverElemento(n.data.elemento)}</li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        aberto={aExcluir !== null}
        titulo="Excluir elemento"
        variante="perigo"
        rotuloConfirmar="Excluir"
        descricao={
          <span>
            Tem certeza que deseja excluir{' '}
            <strong>{aExcluir ? descreverElemento(aExcluir.data.elemento) : ''}</strong>?
            Esta ação pode ser desfeita com Ctrl+Z.
          </span>
        }
        aoConfirmar={() => {
          if (aExcluir) excluirNode(aExcluir.id);
          setAExcluir(null);
        }}
        aoCancelar={() => setAExcluir(null)}
      />

      <ConfirmDialog
        aberto={importPendente !== null}
        titulo="Importar diagrama"
        rotuloConfirmar="Substituir conteúdo"
        descricao={
          <span>
            Importar este arquivo vai <strong>substituir todo o conteúdo</strong>{' '}
            do diagrama atual por{' '}
            {importPendente
              ? `${importPendente.length} ${
                  importPendente.length === 1 ? 'elemento' : 'elementos'
                }`
              : 'o conteúdo do arquivo'}
            . Esta ação pode ser desfeita com Ctrl+Z.
          </span>
        }
        aoConfirmar={confirmarImportacao}
        aoCancelar={() => setImportPendente(null)}
      />

      <DialogEditarElemento
        elemento={emEdicao}
        aoSalvar={salvarEdicao}
        aoCancelar={() => setEmEdicao(null)}
      />

      <DialogNomeDiagrama
        aberto={renomeando}
        titulo="Renomear diagrama"
        rotuloConfirmar="Salvar"
        nomeInicial={nomeDiagrama}
        aoConfirmar={renomear}
        aoCancelar={() => setRenomeando(false)}
      />
    </div>
  );
}

/** Aplica uma transformação ao elemento-linha de um node, preservando o tipo. */
function mapearLinha(
  node: NodeDiagrama,
  fn: (linha: ElementoLinha) => ElementoLinha,
): NodeDiagrama {
  const elemento = node.data.elemento;
  if (elemento.tipo !== 'linha') return node;
  return {
    ...node,
    data: { ...node.data, elemento: fn(elemento) },
  } as NodeDiagrama;
}

/** Descrição curta de um elemento, para a lista acessível e o diálogo. */
function descreverElemento(elemento: ElementoDiagrama): string {
  switch (elemento.tipo) {
    case 'reservatorio':
      return `Reservatório ${elemento.nome}`;
    case 'nivel':
      return `Posto de nível ${elemento.codigo} ${elemento.nome}`;
    case 'chuva':
      return `Posto de chuva ${elemento.codigo} ${elemento.nome}`;
    case 'linha':
      return `Rio ${elemento.label ?? 'sem rótulo'}`;
  }
}

/** Provider do React Flow (necessário para `useReactFlow`/`screenToFlowPosition`). */
export function EditorDiagrama(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInterno {...props} />
    </ReactFlowProvider>
  );
}
