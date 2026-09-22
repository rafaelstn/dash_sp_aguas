/**
 * Caso de uso do mapa: roteamento do termo (mesma regra da busca), favoritos
 * sem usuário, filtro sobre os candidatos e facetas sobre os candidatos (não
 * sobre os filtrados, senão a contagem cruzada viraria espelho da seleção).
 */
import { describe, expect, it, vi } from 'vitest';
import type { MapaPostosRepository } from '@/application/ports/mapa-postos-repository';
import { listarPontosMapa } from '@/application/use-cases/listar-pontos-mapa';
import { TermoBuscaInvalido } from '@/domain/errors';
import type { PontoMapaPosto } from '@/domain/mapa-postos';

const PONTOS: PontoMapaPosto[] = [
  {
    prefixo: '2D-006',
    nome: 'Rio A',
    lat: -22.1,
    lon: -47.2,
    tipo: 'flu',
    situacao: 'em_operacao',
    transmissao: ['convencional'],
    vazao: ['medicao', 'curva'],
    ugrhi: 2,
    municipio: 'CRUZEIRO',
    uf: 'SP',
    coordenadaSuspeita: false,
  },
  {
    prefixo: 'A6-001',
    nome: 'Chuva B',
    lat: null,
    lon: null,
    tipo: 'plu',
    situacao: 'extinto',
    transmissao: [],
    vazao: [],
    ugrhi: 15,
    municipio: null,
    uf: 'PR',
    coordenadaSuspeita: false,
  },
];

function repo() {
  const listarPontos = vi.fn<MapaPostosRepository['listarPontos']>(async () => PONTOS);
  return { repo: { listarPontos } satisfies MapaPostosRepository, listarPontos };
}

describe('listarPontosMapa', () => {
  it('sem termo e sem filtro devolve a base inteira, não vazio', async () => {
    const { repo: r } = repo();
    const res = await listarPontosMapa(r, {});
    expect(res.total).toBe(2);
    expect(res.pontos.map((p) => p.prefixo)).toEqual(['2D-006', 'A6-001']);
    expect(res.semCoordenada).toBe(1);
  });

  it('termo de um caractere é recusado antes de ir ao banco', async () => {
    const { repo: r, listarPontos } = repo();
    await expect(listarPontosMapa(r, { termo: 'a' })).rejects.toBeInstanceOf(TermoBuscaInvalido);
    expect(listarPontos).not.toHaveBeenCalled();
  });

  it('código de posto vira início de prefixo; texto livre vira termo', async () => {
    const { repo: r, listarPontos } = repo();
    await listarPontosMapa(r, { termo: '2d-006' });
    expect(listarPontos.mock.calls[0]![0]).toMatchObject({
      prefixoComecaCom: '2D-006',
      termo: undefined,
    });
    await listarPontosMapa(r, { termo: 'piracicaba' });
    expect(listarPontos.mock.calls[1]![0]).toMatchObject({
      prefixoComecaCom: undefined,
      termo: 'piracicaba',
    });
  });

  it('favoritos sem usuário devolve vazio sem consultar', async () => {
    const { repo: r, listarPontos } = repo();
    const res = await listarPontosMapa(r, { apenasFavoritos: true, usuarioId: null });
    expect(res.total).toBe(0);
    expect(listarPontos).not.toHaveBeenCalled();
  });

  it('filtra os pontos e conta as facetas sobre os candidatos', async () => {
    const { repo: r } = repo();
    const res = await listarPontosMapa(r, { tipo: ['flu'] });
    expect(res.pontos.map((p) => p.prefixo)).toEqual(['2D-006']);
    expect(res.total).toBe(1);
    expect(res.semCoordenada).toBe(0);
    // A opção não marcada continua com a contagem dela.
    expect(res.facetas.tipo).toMatchObject({ flu: 1, plu: 1 });
    expect(res.facetas.vazao.qualquer).toBe(1);
  });

  it('uf e ugrhi repassam `null` para selecionar quem não tem valor', async () => {
    const { repo: r } = repo();
    const soSp = await listarPontosMapa(r, { uf: ['SP'] });
    expect(soSp.pontos.map((p) => p.prefixo)).toEqual(['2D-006']);
    const outro = await listarPontosMapa(r, { uf: ['PR'] });
    expect(outro.pontos.map((p) => p.prefixo)).toEqual(['A6-001']);
    // A faceta de UF conta a base, com SP primeiro.
    expect(soSp.facetas.uf).toEqual([
      { uf: 'SP', total: 1 },
      { uf: 'PR', total: 1 },
    ]);
  });
});
