/**
 * Casos de uso dos diagramas unifilares. Camada fina sobre o repositório:
 * cada função recebe o repo por injeção (testável com mock), aplica a regra
 * mínima e delega. As rotas chamam estes; nunca o repo direto.
 */

import type { DiagramasRepository } from '@/application/ports/diagramas-repository';
import type {
  Diagrama,
  DiagramaResumo,
  NovoDiagrama,
} from '@/domain/diagramas/diagrama';
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';

export async function listarDiagramas(
  repo: DiagramasRepository,
): Promise<DiagramaResumo[]> {
  return repo.listar();
}

export async function obterDiagrama(
  repo: DiagramasRepository,
  id: string,
): Promise<Diagrama | null> {
  return repo.obter(id);
}

export async function criarDiagrama(
  repo: DiagramasRepository,
  dados: NovoDiagrama,
  criadoPor: string | null,
): Promise<Diagrama> {
  return repo.criar(dados, criadoPor);
}

export async function renomearDiagrama(
  repo: DiagramasRepository,
  id: string,
  nome: string,
): Promise<void> {
  return repo.renomear(id, nome);
}

export async function duplicarDiagrama(
  repo: DiagramasRepository,
  id: string,
  criadoPor: string | null,
): Promise<Diagrama> {
  return repo.duplicar(id, criadoPor);
}

export async function salvarElementosDiagrama(
  repo: DiagramasRepository,
  id: string,
  elementos: ElementoDiagrama[],
): Promise<void> {
  return repo.salvarElementos(id, elementos);
}

export async function excluirDiagrama(
  repo: DiagramasRepository,
  id: string,
): Promise<void> {
  return repo.excluir(id);
}
