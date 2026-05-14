import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { EntradaSubmeterTriagem } from '@/application/ports/triagem-repository';

/**
 * Helpers compartilhados pelos testes de use case de triagem.
 *
 * Não usamos os mocks reais (`infrastructure/mock/papeis-repository.mock.ts`)
 * pra evitar acoplamento via env vars (`DEV_APROVADOR_USUARIO_ID`). Aqui
 * temos controle direto via factory.
 *
 * Bug conhecido do mock (gap em docs/qa/regression-sprint-1.md):
 * `listarEventos` quebra com TypeError porque `clonar` (JSON.parse/stringify)
 * transforma Date em string, e o `.sort` chama `.getTime()`. Os asserts
 * dos testes evitam `listarEventos` e validam o efeito do evento via
 * estado observável da ficha (motivoDecisao, decididaPor, fichaVisitaId).
 * Owner do fix: Lucas, trocar `clonar` por versão que preserve Date.
 */

export const TECNICO_ID_PADRAO = '11111111-1111-4111-8111-111111111111';
export const APROVADOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const APROVADOR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface OpcoesPapeis {
  aprovadores?: string[];
}

export function papeisFake(opts: OpcoesPapeis = {}): PapeisRepository {
  const aprovadores = new Set(opts.aprovadores ?? []);
  return {
    async ehAprovador(id: string) {
      return aprovadores.has(id);
    },
  };
}

export function entradaSubmissaoValida(
  override: Partial<EntradaSubmeterTriagem> = {},
): EntradaSubmeterTriagem {
  return {
    prefixo: '3D-001',
    codTipoDocumento: 3,
    dataVisita: new Date('2026-05-08'),
    horaInicio: '08:30',
    horaFim: '10:15',
    tecnicoId: TECNICO_ID_PADRAO,
    tecnicoNome: 'Técnico Demo',
    latitudeCapturada: -23.5489,
    longitudeCapturada: -46.6388,
    precisaoGpsM: 8.5,
    observacoes: 'Ficha de teste',
    dados: {
      tipo_manutencao: 'preventiva',
      acesso: 'boa',
      limpeza: 'boa',
    },
    origem: 'app_campo',
    fichaOrigemId: null,
    idempotencyKey: null,
    ...override,
  };
}

export const META = { ip: '127.0.0.1', userAgent: 'vitest' };
