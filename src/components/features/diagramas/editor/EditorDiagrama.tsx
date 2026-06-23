'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useRef, useState } from 'react';
import {
  Background,
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
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';
import type { Diagrama } from '@/domain/diagramas/diagrama';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DialogNomeDiagrama } from '../DialogNomeDiagrama';
import { ToolbarEditor } from './ToolbarEditor';
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
import type { Ferramenta, NodeDiagrama } from './tipos-editor';

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
 * Editor visual de diagramas unifilares (Fase A2), padrão SIBH/DAEE.
 *
 * Faixa azul no topo (nome + toolbar + indicador de save), canvas React Flow
 * com fundo claro, minimapa, controles e legenda de status. Os elementos do
 * banco viram nodes via `elementosParaNodes`; ao mover/adicionar/excluir, o
 * array é reconstruído e enviado por auto-save (PATCH com debounce).
 *
 * A11y: a faixa de toolbar é `role=toolbar` operável por teclado; o canvas tem
 * uma alternativa textual (lista dos elementos) para leitor de tela, já que o
 * arrasto visual não é acessível por si. Exclusão via ConfirmDialog (sem
 * window.confirm). Tecla Delete remove o selecionado.
 */
function EditorInterno({ diagrama }: Props) {
  const router = useRouter();
  const { screenToFlowPosition } = useReactFlow();
  const instanciaRef = useRef<ReactFlowInstance<NodeDiagrama> | null>(null);

  const [nomeDiagrama, setNomeDiagrama] = useState(diagrama.nome);
  const [nodes, setNodes] = useState<NodeDiagrama[]>(() =>
    elementosParaNodes(diagrama.elementos),
  );
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [aExcluir, setAExcluir] = useState<NodeDiagrama | null>(null);
  const [emEdicao, setEmEdicao] = useState<ElementoDiagrama | null>(null);
  const [renomeando, setRenomeando] = useState(false);

  const { estado: estadoSalvamento, agendar } = useAutoSave(diagrama.id);

  /** Atualiza nodes e dispara o auto-save com o array reconstruído. */
  const aplicarNodes = useCallback(
    (proximos: NodeDiagrama[]) => {
      setNodes(proximos);
      agendar(nodesParaElementos(proximos));
    },
    [agendar],
  );

  const aoMudarNodes = useCallback(
    (mudancas: NodeChange<NodeDiagrama>[]) => {
      setNodes((atuais) => {
        const proximos = applyNodeChanges(mudancas, atuais);
        // Só persiste quando o arrasto termina (dragging=false) ou em
        // remoção; evita um PATCH por pixel durante o movimento.
        const persistir = mudancas.some(
          (m) =>
            (m.type === 'position' && m.dragging === false) ||
            m.type === 'remove',
        );
        if (persistir) agendar(nodesParaElementos(proximos));
        return proximos;
      });
    },
    [agendar],
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
      const proximos = [...nodes, ...elementosParaNodes([novo])];
      aplicarNodes(proximos);
      setSelecionadoId(novo.id);
      setFerramenta('selecionar');
    },
    [ferramenta, nodes, aplicarNodes, screenToFlowPosition],
  );

  const aoSelecionarNode: NodeMouseHandler<NodeDiagrama> = useCallback(
    (_evento, node) => setSelecionadoId(node.id),
    [],
  );

  const aoDuploCliqueNode: NodeMouseHandler<NodeDiagrama> = useCallback(
    (_evento, node) => setEmEdicao(node.data.elemento),
    [],
  );

  const excluirNode = useCallback(
    (id: string) => {
      const proximos = nodes.filter((n) => n.id !== id);
      aplicarNodes(proximos);
      setSelecionadoId(null);
    },
    [nodes, aplicarNodes],
  );

  const salvarEdicao = useCallback(
    (atualizado: ElementoDiagrama) => {
      const proximos = nodes.map((n) =>
        n.id === atualizado.id
          ? ({ ...n, data: { elemento: atualizado } } as NodeDiagrama)
          : n,
      );
      aplicarNodes(proximos);
      setEmEdicao(null);
    },
    [nodes, aplicarNodes],
  );

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
    <div className="flex h-[calc(100vh-var(--row-h-normal)-1rem)] min-h-[32rem] flex-col overflow-hidden rounded-gov-card border border-app-border-subtle">
      {/* Faixa azul: voltar + nome + toolbar + indicador de save */}
      <div className="flex flex-col gap-2 bg-gov-azul px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/diagramas"
            aria-label="Voltar para a lista de diagramas"
            title="Voltar para a lista"
            className="inline-flex shrink-0 items-center rounded p-1 text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <h1 className="truncate text-sm font-semibold text-white">
            {nomeDiagrama}
          </h1>
          <button
            type="button"
            onClick={() => setRenomeando(true)}
            aria-label="Renomear diagrama"
            title="Renomear diagrama"
            className="inline-flex shrink-0 items-center rounded p-1 text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="sm:flex-1">
          <ToolbarEditor
            ferramenta={ferramenta}
            aoTrocarFerramenta={setFerramenta}
            temSelecao={selecionadoId !== null}
            aoExcluir={() => {
              const node = nodes.find((n) => n.id === selecionadoId);
              if (node) setAExcluir(node);
            }}
          />
        </div>

        <div className="flex shrink-0 items-center sm:ml-auto">
          <IndicadorSalvamento estado={estadoSalvamento} />
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 bg-app-surface-2">
        <ReactFlow<NodeDiagrama>
          nodes={nodes}
          edges={[]}
          nodeTypes={tiposDeNode}
          onInit={(inst) => {
            instanciaRef.current = inst;
          }}
          onNodesChange={aoMudarNodes}
          onNodeClick={aoSelecionarNode}
          onNodeDoubleClick={aoDuploCliqueNode}
          onPaneClick={aoClicarCanvas}
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
          <Background color="hsl(var(--border-default))" gap={20} />
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
            Esta ação não pode ser desfeita.
          </span>
        }
        aoConfirmar={() => {
          if (aExcluir) excluirNode(aExcluir.id);
          setAExcluir(null);
        }}
        aoCancelar={() => setAExcluir(null)}
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
