import 'server-only';
import type {
  FiltroCadastroMapa,
  MapaPostosRepository,
} from '@/application/ports/mapa-postos-repository';
import {
  UF_DO_ESTADO,
  coordenadaSuspeita,
  tipoDaDescricao,
  type FonteVazao,
  type PontoMapaPosto,
  type Transmissao,
} from '@/domain/mapa-postos';
import type { Posto } from '@/domain/posto';
import { POSTOS_FIXTURES } from './fixtures';
import { combinaTermo, normalizar } from './postos-repository.mock';

/**
 * Pontos do mapa em memória, para o MODO DEMO, derivados das fixtures de posto.
 *
 * Determinístico. A classificação segue as mesmas regras do adaptador `.mssql`
 * sobre os campos que as fixtures têm. Situação: `operacaoFimAno` anterior ao
 * ano passado é extinto, que é a leitura da planilha de origem das fixtures
 * (ver `ParametrosPesquisa.status`). Transmissão: campos `telemetrico`,
 * `loggerEqp` e `convencional` ou `nivel`. Vazão: campo `vazao` é aparelho
 * ativo; medição e curva vêm das listas abaixo, casadas com o mock de
 * `vazao-posto-repository`.
 *
 * `apenasFavoritos` devolve vazio: o demo não tem usuário com favorito.
 */

/** Postos de demonstração com medição de vazão em campo. */
export const POSTOS_DEMO_COM_MEDICAO: ReadonlySet<string> = new Set(['1D-008', '2D-006']);
/** Postos de demonstração com curva-chave. */
export const POSTOS_DEMO_COM_CURVA: ReadonlySet<string> = new Set(['2D-006']);

function situacao(p: Posto, anoAtual: number): PontoMapaPosto['situacao'] {
  return p.operacaoFimAno !== null && p.operacaoFimAno > 0 && p.operacaoFimAno < anoAtual - 1
    ? 'extinto'
    : 'em_operacao';
}

function ponto(p: Posto, anoAtual: number): PontoMapaPosto {
  const transmissao: Transmissao[] = [];
  if (p.telemetrico) transmissao.push('telemetrico');
  if (p.loggerEqp) transmissao.push('gravacao_local');
  if (p.convencional || p.nivel) transmissao.push('convencional');

  const vazao: FonteVazao[] = [];
  if (p.vazao) vazao.push('aparelho_ativo');
  if (POSTOS_DEMO_COM_MEDICAO.has(p.prefixo)) vazao.push('medicao');
  if (POSTOS_DEMO_COM_CURVA.has(p.prefixo)) vazao.push('curva');

  const temCoordenada = p.latitude !== null && p.longitude !== null;
  const ugrhi = p.ugrhiNumero === null ? null : Number(p.ugrhiNumero);
  const lat = temCoordenada ? Math.round(p.latitude! * 1e5) / 1e5 : null;
  const lon = temCoordenada ? Math.round(p.longitude! * 1e5) / 1e5 : null;
  return {
    prefixo: p.prefixo,
    nome: p.nomeEstacao,
    lat,
    lon,
    tipo: tipoDaDescricao(p.tipoPosto),
    situacao: situacao(p, anoAtual),
    transmissao,
    vazao,
    ugrhi: ugrhi !== null && Number.isFinite(ugrhi) ? ugrhi : null,
    municipio: p.municipio,
    // As fixtures saem da planilha da rede paulista, que só tem postos de SP.
    uf: UF_DO_ESTADO,
    coordenadaSuspeita: coordenadaSuspeita(lat, lon),
  };
}

function igual(valor: string | null, pedido: string): boolean {
  return valor !== null && normalizar(valor) === normalizar(pedido);
}

export const mapaPostosRepositoryMock: MapaPostosRepository = {
  async listarPontos(filtro: FiltroCadastroMapa): Promise<readonly PontoMapaPosto[]> {
    if (filtro.apenasFavoritos) return [];
    const anoAtual = new Date().getUTCFullYear();
    const termos = (filtro.termo ?? '').trim().split(/\s+/).filter(Boolean).map(normalizar);

    return POSTOS_FIXTURES.filter((p) => {
      if (
        filtro.prefixoComecaCom &&
        !p.prefixo.toUpperCase().startsWith(filtro.prefixoComecaCom.toUpperCase())
      ) {
        return false;
      }
      if (!termos.every((t) => combinaTermo(p, t))) return false;
      if (filtro.municipio && !igual(p.municipio, filtro.municipio)) return false;
      if (filtro.baciaHidrografica && !igual(p.baciaHidrografica, filtro.baciaHidrografica)) {
        return false;
      }
      if (filtro.mantenedor && !igual(p.mantenedor, filtro.mantenedor)) return false;
      return true;
    })
      .sort((a, b) => a.prefixo.localeCompare(b.prefixo))
      .map((p) => ponto(p, anoAtual));
  },
};
