import type { SibhGateway } from '@/application/ports/sibh-gateway';
import type { EstacoesPluviometricasRepository } from '@/application/ports/estacoes-pluviometricas-repository';
import type { LeiturasPluviometricasRepository } from '@/application/ports/leituras-pluviometricas-repository';
import type { PostosRepository } from '@/application/ports/postos-repository';
import { sincronizarEstacoesPluviometricas } from './sincronizar-estacoes-pluviometricas';
import { sincronizarLeiturasPluviometricas } from './sincronizar-leituras-pluviometricas';

/**
 * Sincronização completa do Monitor: cadastro de estações e leituras do
 * período.
 *
 * Existe para que a rota manual (`POST /api/monitor/sync`, disparada por um
 * aprovador pela tela) e o agendamento (`/api/cron/sincronizar-monitor`)
 * executem exatamente a mesma coisa. Antes esta orquestração vivia dentro do
 * handler HTTP, e duplicá-la no cron significaria duas definições do que é
 * "sincronizar", que divergem no primeiro ajuste que alguém fizer em só uma
 * delas.
 */

/** Janela padrão de leituras. Cobre fim de semana e atraso de transmissão. */
export const DIAS_DEFAULT = 7;
/** Teto da janela, para não disparar varredura histórica pesada por engano. */
export const DIAS_MAX = 31;

export interface DepsSincronizarMonitor {
  sibh: SibhGateway;
  estacoes: EstacoesPluviometricasRepository;
  leituras: LeiturasPluviometricasRepository;
  postos: PostosRepository;
}

export async function sincronizarMonitor(
  deps: DepsSincronizarMonitor,
  dias: number = DIAS_DEFAULT,
) {
  const estacoes = await sincronizarEstacoesPluviometricas(
    deps.sibh,
    deps.estacoes,
    deps.postos,
  );

  // Alvos das leituras: estações automáticas pluviométricas já persistidas
  // (inclui as que acabaram de ser upsertadas). Filtra por `tipo` para não
  // puxar leitura de estação manual cadastrada por operador numa fase futura,
  // E por `tipoEstacao` porque a leitura aqui é chuva acumulada (mm), válida
  // só para pluviométrica; fluviométrica e piezométrica medem nível (metros)
  // e terão sincronização própria na Fase 2.
  const persistidas = await deps.estacoes.listar({
    tipo: 'automatico',
    tipoEstacao: 'pluviometrico',
  });

  const ate = new Date();
  const desde = new Date(ate.getTime() - dias * 24 * 60 * 60 * 1000);

  const leituras = await sincronizarLeiturasPluviometricas(
    deps.sibh,
    deps.leituras,
    persistidas.map((e) => ({ id: e.id, prefixo: e.prefixo })),
    desde,
    ate,
  );

  return { dias, estacoes, leituras };
}
