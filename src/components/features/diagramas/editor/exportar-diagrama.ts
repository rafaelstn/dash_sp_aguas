/**
 * Helpers puros de exportação e importação de diagramas (Fase A4).
 *
 * Concentra a lógica testável, sem React, sem DOM e sem I/O de rede: montar o
 * nome de arquivo a partir do nome do diagrama, serializar o diagrama no
 * formato de troca (que bate com o `elementosSchema` do domínio) e validar o
 * JSON importado. O componente de toolbar só orquestra (captura de imagem,
 * download, confirmação) chamando estas funções.
 */

import { z } from 'zod';
import { elementosSchema } from '@/domain/diagramas/schemas';
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';
import type { Diagrama } from '@/domain/diagramas/diagrama';

/** Formato de troca de um diagrama (export/import JSON). */
export interface DiagramaExportado {
  nome: string;
  bacia: string | null;
  descricao: string | null;
  elementos: ElementoDiagrama[];
}

/**
 * Schema do arquivo importado. Aceita `bacia`/`descricao` ausentes ou nulos
 * (normalizados para `null`) e exige `elementos` válidos pelo schema do
 * domínio. `nome` é opcional no arquivo, pois o nome de destino é o do diagrama
 * atual sendo editado (importar troca o conteúdo, não renomeia).
 */
const diagramaImportadoSchema = z.object({
  nome: z.string().max(200).optional(),
  bacia: z.string().max(200).nullable().optional(),
  descricao: z.string().max(2000).nullable().optional(),
  elementos: elementosSchema,
});

/** Resultado da validação de um JSON importado. */
export type ResultadoImportacao =
  | { ok: true; elementos: ElementoDiagrama[] }
  | { ok: false; erro: string };

/**
 * Normaliza o nome do diagrama em um nome de arquivo seguro (sem extensão).
 * Remove acentos e caracteres inválidos de sistema de arquivos, colapsa
 * espaços em hífen e limita o tamanho. Cai para `diagrama` se vazio.
 */
export function nomeBaseArquivo(nome: string): string {
  const semAcento = nome
    .normalize('NFD')
    // Remove os diacríticos combinantes (faixa Unicode "Combining Diacritical
    // Marks"), escritos com escape ASCII para não inserir char invisível no fonte.
    .replace(/[̀-ͯ]/g, '');
  const limpo = semAcento
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
  return limpo || 'diagrama';
}

/** Monta o nome do arquivo de download com a extensão dada (sem o ponto). */
export function nomeArquivo(nome: string, extensao: string): string {
  return `${nomeBaseArquivo(nome)}.${extensao}`;
}

/**
 * Serializa o diagrama no formato de troca: descarta metadados internos
 * (id, datas, autor) e mantém apenas o que define o conteúdo, alinhado ao
 * schema de importação. Os elementos atuais do editor vêm por parâmetro
 * (refletem a edição em andamento), não os do agregado carregado.
 */
export function montarExportacaoJson(
  diagrama: Pick<Diagrama, 'nome' | 'bacia' | 'descricao'>,
  elementos: ElementoDiagrama[],
): DiagramaExportado {
  return {
    nome: diagrama.nome,
    bacia: diagrama.bacia,
    descricao: diagrama.descricao,
    elementos,
  };
}

/** Serializa a exportação em texto JSON identado (pronto para download). */
export function serializarJson(exportado: DiagramaExportado): string {
  return JSON.stringify(exportado, null, 2);
}

/**
 * Valida e extrai os elementos de um JSON importado. Nunca lança: devolve um
 * resultado discriminado para o chamador exibir o erro sem quebrar o editor.
 * Mensagens em PT-BR, claras o suficiente para o usuário corrigir o arquivo.
 */
export function importarJson(texto: string): ResultadoImportacao {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return {
      ok: false,
      erro: 'O arquivo não é um JSON válido. Verifique se selecionou o arquivo correto.',
    };
  }

  const resultado = diagramaImportadoSchema.safeParse(dados);
  if (!resultado.success) {
    const primeiro = resultado.error.issues[0];
    const caminho = primeiro?.path.join('.') ?? '';
    const detalhe = caminho ? ` (campo: ${caminho})` : '';
    return {
      ok: false,
      erro: `O arquivo não está no formato esperado de um diagrama${detalhe}. Exporte um diagrama por aqui para ver o formato correto.`,
    };
  }

  return { ok: true, elementos: resultado.data.elementos };
}

/**
 * Caixa delimitadora dos elementos no canvas, em coordenadas de fluxo. Usada
 * para decidir a orientação (retrato/paisagem) do PDF conforme a proporção do
 * diagrama. Diagrama vazio devolve `null`.
 */
export function calcularLimites(
  elementos: ElementoDiagrama[],
): { largura: number; altura: number } | null {
  const pontos: Array<{ x: number; y: number }> = [];
  for (const el of elementos) {
    if (el.tipo === 'linha') {
      pontos.push(...el.pontos);
    } else {
      pontos.push(el.posicao);
    }
  }
  if (pontos.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pontos) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { largura: maxX - minX, altura: maxY - minY };
}

/**
 * Orientação do PDF conforme a proporção do diagrama. Mais largo que alto vira
 * paisagem; caso contrário, retrato. Sem elementos, retrato por padrão.
 */
export function orientacaoPdf(
  elementos: ElementoDiagrama[],
): 'retrato' | 'paisagem' {
  const limites = calcularLimites(elementos);
  if (!limites || limites.altura === 0) return 'retrato';
  return limites.largura > limites.altura ? 'paisagem' : 'retrato';
}

/** Data e hora de geração formatadas em PT-BR (para o cabeçalho do PDF). */
export function dataHoraPtBr(data: Date = new Date()): string {
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
