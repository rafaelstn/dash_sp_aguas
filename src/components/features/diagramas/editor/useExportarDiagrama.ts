'use client';

import { useCallback, useRef, useState } from 'react';
import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { ReactFlowInstance } from '@xyflow/react';
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';
import type { Diagrama } from '@/domain/diagramas/diagrama';
import type { NodeDiagrama } from './tipos-editor';
import {
  dataHoraPtBr,
  montarExportacaoJson,
  nomeArquivo,
  orientacaoPdf,
  serializarJson,
} from './exportar-diagrama';

/** Formatos de exportação de imagem/documento. */
export type FormatoExport = 'png' | 'svg' | 'pdf' | 'json';

interface ParametrosExport {
  diagrama: Pick<Diagrama, 'nome' | 'bacia' | 'descricao'>;
  /** Elementos atuais do editor (refletem a edição em andamento). */
  elementos: () => ElementoDiagrama[];
  /** Instância do React Flow, para `fitView` antes de capturar. */
  instancia: () => ReactFlowInstance<NodeDiagrama> | null;
  /** Elemento DOM a capturar (o container do `<ReactFlow>`). */
  alvo: () => HTMLElement | null;
}

/**
 * Filtra elementos de controle do React Flow para não saírem na imagem:
 * minimapa, painel de zoom, handles e a faixa de seleção. Mantém o viewport e
 * os nodes. Usado no `filter` do html-to-image.
 */
function semControles(node: HTMLElement): boolean {
  if (!(node instanceof HTMLElement)) return true;
  const classe = node.classList;
  return !(
    classe.contains('react-flow__minimap') ||
    classe.contains('react-flow__controls') ||
    classe.contains('react-flow__panel') ||
    classe.contains('react-flow__background') ||
    classe.contains('react-flow__attribution') ||
    classe.contains('react-flow__handle')
  );
}

const OPCOES_IMAGEM = {
  pixelRatio: 2,
  cacheBust: true,
  filter: semControles,
  backgroundColor: '#ffffff',
} as const;

/** Aciona o download de um Blob/URL no navegador. */
function baixar(href: string, nome: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Dispara o download de um texto como arquivo (libera a object URL depois). */
function baixarTexto(texto: string, nome: string, tipoMime: string): void {
  const blob = new Blob([texto], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  baixar(url, nome);
  URL.revokeObjectURL(url);
}

/** Dimensões da página A4 em milímetros, conforme a orientação. */
function paginaA4(orientacao: 'retrato' | 'paisagem'): {
  largura: number;
  altura: number;
} {
  return orientacao === 'paisagem'
    ? { largura: 297, altura: 210 }
    : { largura: 210, altura: 297 };
}

/**
 * Orquestra a exportação client-side do diagrama (PNG, SVG, PDF e JSON).
 *
 * Antes de capturar imagem, dá `fitView` para enquadrar todo o conteúdo
 * (inclusive nodes fora da viewport) e aguarda o próximo frame para a transição
 * assentar. A captura usa `pixelRatio: 2` (nitidez), `cacheBust` (evita falha
 * com fontes/CSS em cache) e filtra os controles do React Flow (minimapa,
 * zoom, background) para a imagem sair limpa.
 *
 * Expõe `exportar(formato)` e o `formatoEmAndamento` para a UI mostrar o estado
 * "gerando...". Erros voltam por `erro` (string PT-BR) sem quebrar o editor.
 */
export function useExportarDiagrama({
  diagrama,
  elementos,
  instancia,
  alvo,
}: ParametrosExport): {
  exportar: (formato: FormatoExport) => Promise<void>;
  formatoEmAndamento: FormatoExport | null;
  erro: string | null;
  limparErro: () => void;
} {
  const [formatoEmAndamento, setFormatoEmAndamento] =
    useState<FormatoExport | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const emAndamentoRef = useRef(false);

  const limparErro = useCallback(() => setErro(null), []);

  /** Enquadra o diagrama e espera o próximo frame antes de capturar. */
  const prepararCaptura = useCallback(async (): Promise<HTMLElement> => {
    const elementoAlvo = alvo();
    if (!elementoAlvo) {
      throw new Error('Não foi possível localizar o diagrama para exportar.');
    }
    const inst = instancia();
    if (inst) {
      inst.fitView({ padding: 0.1, duration: 0 });
    }
    // Aguarda dois frames: um para o fitView aplicar a transform, outro para
    // o layout assentar antes do html-to-image ler os estilos computados.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return elementoAlvo;
  }, [alvo, instancia]);

  const exportarPng = useCallback(async (): Promise<string> => {
    const elementoAlvo = await prepararCaptura();
    return toPng(elementoAlvo, OPCOES_IMAGEM);
  }, [prepararCaptura]);

  const exportarPdf = useCallback(async () => {
    const dataUrl = await exportarPng();
    const orientacao = orientacaoPdf(elementos());
    const { largura: larguraPagina, altura: alturaPagina } =
      paginaA4(orientacao);

    const pdf = new jsPDF({
      orientation: orientacao === 'paisagem' ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const margem = 12;
    const azul = { r: 0, g: 51, b: 102 };

    // Cabeçalho institucional.
    pdf.setTextColor(azul.r, azul.g, azul.b);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('SP Águas - DMO', margem, margem + 4);

    pdf.setTextColor(33, 33, 33);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(diagrama.nome, margem, margem + 12);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);
    const linhasInfo: string[] = [];
    if (diagrama.bacia) linhasInfo.push(`Bacia: ${diagrama.bacia}`);
    linhasInfo.push(`Gerado em ${dataHoraPtBr()}`);
    pdf.text(linhasInfo.join('   '), margem, margem + 18);

    // Linha divisória sob o cabeçalho.
    const yLinha = margem + 22;
    pdf.setDrawColor(azul.r, azul.g, azul.b);
    pdf.setLineWidth(0.4);
    pdf.line(margem, yLinha, larguraPagina - margem, yLinha);

    // Área disponível para a imagem do diagrama.
    const topoImagem = yLinha + 6;
    const larguraDisponivel = larguraPagina - margem * 2;
    const alturaDisponivel = alturaPagina - topoImagem - margem;

    const props = pdf.getImageProperties(dataUrl);
    const proporcao = props.width / props.height;
    let larguraImg = larguraDisponivel;
    let alturaImg = larguraImg / proporcao;
    if (alturaImg > alturaDisponivel) {
      alturaImg = alturaDisponivel;
      larguraImg = alturaImg * proporcao;
    }
    const xImg = margem + (larguraDisponivel - larguraImg) / 2;

    pdf.addImage(dataUrl, 'PNG', xImg, topoImagem, larguraImg, alturaImg);
    pdf.save(nomeArquivo(diagrama.nome, 'pdf'));
  }, [diagrama, elementos, exportarPng]);

  const exportar = useCallback(
    async (formato: FormatoExport) => {
      if (emAndamentoRef.current) return;
      emAndamentoRef.current = true;
      setFormatoEmAndamento(formato);
      setErro(null);
      try {
        switch (formato) {
          case 'png': {
            const dataUrl = await exportarPng();
            baixar(dataUrl, nomeArquivo(diagrama.nome, 'png'));
            break;
          }
          case 'svg': {
            const elementoAlvo = await prepararCaptura();
            const dataUrl = await toSvg(elementoAlvo, OPCOES_IMAGEM);
            baixar(dataUrl, nomeArquivo(diagrama.nome, 'svg'));
            break;
          }
          case 'pdf': {
            await exportarPdf();
            break;
          }
          case 'json': {
            const json = serializarJson(
              montarExportacaoJson(diagrama, elementos()),
            );
            baixarTexto(
              json,
              nomeArquivo(diagrama.nome, 'json'),
              'application/json',
            );
            break;
          }
        }
      } catch {
        setErro(
          'Não foi possível gerar o arquivo. Tente novamente em instantes.',
        );
      } finally {
        emAndamentoRef.current = false;
        setFormatoEmAndamento(null);
      }
    },
    [diagrama, elementos, exportarPdf, exportarPng, prepararCaptura],
  );

  return { exportar, formatoEmAndamento, erro, limparErro };
}
