import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { PostosRepository } from '@/application/ports/postos-repository';
import type { EntradaSubmeterTriagem } from '@/application/ports/triagem-repository';
import type { Posto } from '@/domain/posto';

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
    async obterPapel(id: string) {
      return aprovadores.has(id) ? 'admin' : 'user';
    },
    async ehAprovador(id: string) {
      return aprovadores.has(id);
    },
  };
}

/**
 * Cadastro de posto de mentira, para os testes de aprovação.
 *
 * A aprovação pergunta "este posto existe e está ativo?" ao `postosRepository`
 * desde 10/09/2026, porque a nossa tabela `postos` está vazia por desenho
 * (ADR-0023) e a resposta é do órgão. As três respostas possíveis viram os três
 * modos daqui, e o nome de cada um diz QUEM está respondendo o quê:
 *
 *   'ativo'    → a origem devolve o posto, sem soft delete. Aprovação segue.
 *   'ausente'  → a origem não tem aquele posto ativo. É como o adaptador do
 *                `Dbfch` responde a posto excluído: `Excluido = 0` no WHERE faz
 *                a linha simplesmente não voltar.
 *   'removido' → a origem devolve o posto com `deletedAt` preenchido. Só
 *                acontece com a origem PostgreSQL, onde soft delete existe.
 *
 * Só `buscarPorPrefixo` é implementado. Os outros métodos jogam, e isso é
 * proposital: se um dia a aprovação passar a chamar outra coisa do cadastro,
 * o teste tem de dizer isso em voz alta em vez de seguir com `undefined`.
 */
export function postosFake(
  modo: 'ativo' | 'ausente' | 'removido' = 'ativo',
): PostosRepository {
  const naoUsado = (metodo: string) => () => {
    throw new Error(`postosFake: ${metodo} não deveria ser chamado na aprovação`);
  };

  return {
    async buscarPorPrefixo(prefixo: string): Promise<Posto | null> {
      if (modo === 'ausente') return null;
      return {
        id: '99999999-9999-4999-8999-999999999999',
        prefixo,
        deletedAt: modo === 'removido' ? new Date('2026-01-01') : null,
      } as Posto;
    },
    mapaIdsPorPrefixo: naoUsado('mapaIdsPorPrefixo'),
    pesquisar: naoUsado('pesquisar'),
    autocompletar: naoUsado('autocompletar'),
    atualizar: naoUsado('atualizar'),
    criar: naoUsado('criar'),
    remover: naoUsado('remover'),
    restaurar: naoUsado('restaurar'),
    listarEventos: naoUsado('listarEventos'),
  } as PostosRepository;
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
      tipo_inspecao: 'fluviometrica',
      escala_acesso: 'bom',
      escala_limpeza: 'bom',
      controle_nivelamento: 'sim',
    },
    origem: 'app_campo',
    fichaOrigemId: null,
    idempotencyKey: null,
    ...override,
  };
}

export const META = { ip: '127.0.0.1', userAgent: 'vitest' };
