/**
 * Mapa de postos, medições de vazão e curvas-chave contra o SQL SERVER REAL do
 * órgão. Roda apenas com `SQLSERVER_HOST` definido e a VPN ligada. SOMENTE
 * LEITURA.
 *
 * Mesma régua de `series-medicao-mssql.test.ts`: o número esperado vem de uma
 * consulta de conferência disparada NESTE arquivo, escrita de outro jeito que o
 * adaptador (contagem direta, sem `FROM_POSTOS` e sem `OUTER APPLY`). As
 * constantes são as MEDIDAS do diagnóstico de 17/09/2026 e existem para pegar
 * zero e ordem de grandeza errada; se o órgão mexer na base, elas falham
 * dizendo qual número mudou.
 *
 * As transmissões e o aparelho de vazão não têm conferência independente
 * aqui: a única definição deles é a lista de designações, e reescrevê-la no
 * teste seria conferir a lista contra ela mesma. Para esses, a régua são os
 * números do diagnóstico, que foi feito por consulta escrita à parte.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';

const rodar = process.env.SQLSERVER_HOST ? describe : describe.skip;

/** Diagnóstico de 17/09/2026. */
const MEDIDO = {
  postos: 5790,
  extintos: 1376,
  tipos: { plu: 3943, flu: 1588, meteo: 156, piezo: 103 },
  telemetrico: 149,
  gravacaoLocal: 380,
  aparelhoVazao: 326,
  medicao: 519,
  curva: 375,
  qualquerVazao: 595,
  /** Sem UF no posto nem no município. */
  semUf: 297,
  /** Graus inteiros nos dois eixos (ex.: 4G-002, bruto 250000/470000). */
  coordenadaSuspeita: 30,
  /** Sem UGRHI no posto nem herdada do município (número da tela da Fernanda). */
  semUgrhi: 1748,
} as const;

async function contar(sqlTexto: string, prefixo?: string): Promise<number> {
  const { consultarMssql, TiposMssql } = await import('@/infrastructure/db/mssql-client');
  const r = await consultarMssql<{ n: number }>(
    sqlTexto,
    prefixo === undefined ? [] : [{ nome: 'prefixo', tipo: TiposMssql.texto, valor: prefixo }],
  );
  const linha = r.recordset[0];
  if (!linha) throw new Error('consulta de conferência sem linha');
  return Number(linha.n);
}

async function prefixoCom(sqlTexto: string): Promise<string> {
  const { consultarMssql } = await import('@/infrastructure/db/mssql-client');
  const r = await consultarMssql<{ Prefixo: string }>(sqlTexto, []);
  const linha = r.recordset[0];
  if (!linha) throw new Error('nenhum posto para o caso');
  return linha.Prefixo.trim();
}

afterAll(async () => {
  if (!process.env.SQLSERVER_HOST) return;
  const { encerrarPoolMssql } = await import('@/infrastructure/db/mssql-client');
  await encerrarPoolMssql();
});

rodar('mapa de postos', () => {
  it('base inteira, com contagens conferidas e tamanho medido', async () => {
    const { mapaPostosRepositoryMssql } = await import(
      '@/infrastructure/db/mapa-postos-repository.mssql'
    );
    const { listarPontosMapa } = await import('@/application/use-cases/listar-pontos-mapa');

    const tempos: number[] = [];
    let resultado = await listarPontosMapa(mapaPostosRepositoryMssql, {});
    for (let i = 0; i < 3; i += 1) {
      const t0 = performance.now();
      resultado = await listarPontosMapa(mapaPostosRepositoryMssql, {});
      tempos.push(Math.round(performance.now() - t0));
    }

    const postos = await contar('SELECT n = COUNT(*) FROM dbo.Postos p WHERE p.Excluido = 0');
    const extintos = await contar(
      `SELECT n = COUNT(*) FROM dbo.Postos p
        WHERE p.Excluido = 0 AND p.DataExtincao IS NOT NULL AND p.DataExtincao <= GETDATE()`,
    );
    const comMedicao = await contar(
      `SELECT n = COUNT(DISTINCT r.PostoId) FROM dbo.ResumoMedicaoVazoes r
         JOIN dbo.Postos p ON p.Id = r.PostoId
        WHERE r.Excluido = 0 AND p.Excluido = 0`,
    );
    const comCurva = await contar(
      `SELECT n = COUNT(DISTINCT c.PostoId) FROM dbo.CurvaChaveFluviometricas c
         JOIN dbo.Postos p ON p.Id = c.PostoId
        WHERE c.Excluido = 0 AND p.Excluido = 0`,
    );

    const f = resultado.facetas;
    expect(resultado.total).toBe(postos);
    expect(resultado.total).toBe(MEDIDO.postos);
    expect(f.situacao.extinto).toBe(extintos);
    expect(f.situacao.extinto).toBe(MEDIDO.extintos);
    expect(f.situacao.em_operacao).toBe(postos - extintos);
    expect(f.tipo).toEqual(MEDIDO.tipos);
    expect(f.vazao.medicao).toBe(comMedicao);
    expect(f.vazao.medicao).toBe(MEDIDO.medicao);
    expect(f.vazao.curva).toBe(comCurva);
    expect(f.vazao.curva).toBe(MEDIDO.curva);
    expect(f.vazao.aparelho_ativo).toBe(MEDIDO.aparelhoVazao);
    expect(f.vazao.qualquer).toBe(MEDIDO.qualquerVazao);
    expect(f.transmissao.telemetrico).toBe(MEDIDO.telemetrico);
    expect(f.transmissao.gravacao_local).toBe(MEDIDO.gravacaoLocal);

    // Tamanho do corpo que a rota devolve, cru e comprimido.
    const corpo = JSON.stringify(resultado);
    const bruto = Buffer.byteLength(corpo);
    const gzip = gzipSync(corpo).length;

    // Quanto o GUID custaria se entrasse em cada ponto (medido com os ids reais).
    const { consultarMssql } = await import('@/infrastructure/db/mssql-client');
    const ids = await consultarMssql<{ Prefixo: string; Id: string }>(
      'SELECT p.Prefixo, p.Id FROM dbo.Postos p WHERE p.Excluido = 0',
      [],
    );
    const idPorPrefixo = new Map(ids.recordset.map((l) => [l.Prefixo.trim(), l.Id]));
    const comId = JSON.stringify({
      ...resultado,
      pontos: resultado.pontos.map((p) => ({ id: idPorPrefixo.get(p.prefixo), ...p })),
    });

    const transmissaoVazia = resultado.pontos.filter(
      (p) => p.situacao === 'em_operacao' && p.transmissao.length === 0,
    ).length;
    const ambos = resultado.pontos.filter(
      (p) => p.transmissao.includes('telemetrico') && p.transmissao.includes('gravacao_local'),
    ).length;

    console.log(
      JSON.stringify({
        medicao: 'mapa',
        tempos_ms: tempos,
        bytes_bruto: bruto,
        bytes_gzip: gzip,
        bytes_bruto_com_guid: Buffer.byteLength(comId),
        bytes_gzip_com_guid: gzipSync(comId).length,
        sem_coordenada: resultado.semCoordenada,
        em_operacao_sem_transmissao: transmissaoVazia,
        telemetrico_e_gravacao_local: ambos,
        exemplo: resultado.pontos.find((p) => p.vazao.length === 3 && p.transmissao.length > 1),
        facetas: f,
      }),
    );
    expect(bruto).toBeGreaterThan(0);
  });

  it('postos fora de SP: UF conferida, coordenada suspeita e contagem sobre o polígono', async () => {
    const { mapaPostosRepositoryMssql } = await import(
      '@/infrastructure/db/mapa-postos-repository.mssql'
    );
    const { listarPontosMapa } = await import('@/application/use-cases/listar-pontos-mapa');
    const r = await listarPontosMapa(mapaPostosRepositoryMssql, {});

    // Conferência da UF escrita de outro jeito: CASE sobre o comprimento, sem
    // COALESCE e sem NULLIF, com o JOIN do município direto.
    const { consultarMssql } = await import('@/infrastructure/db/mssql-client');
    const ufs = await consultarMssql<{ Uf: string | null; n: number }>(
      `SELECT Uf = CASE
                     WHEN LEN(LTRIM(RTRIM(ISNULL(p.CodigoEstadoMainframe, '')))) > 0
                       THEN UPPER(LTRIM(RTRIM(p.CodigoEstadoMainframe)))
                     WHEN LEN(LTRIM(RTRIM(ISNULL(md.CodigoUnidadeFederacaoMainframe, '')))) > 0
                       THEN UPPER(LTRIM(RTRIM(md.CodigoUnidadeFederacaoMainframe)))
                   END,
              n = COUNT(*)
         FROM dbo.Postos p
         LEFT JOIN dbo.MunicipioDistritos md ON md.Id = p.MunicipioDistritoId
        WHERE p.Excluido = 0
        GROUP BY CASE
                   WHEN LEN(LTRIM(RTRIM(ISNULL(p.CodigoEstadoMainframe, '')))) > 0
                     THEN UPPER(LTRIM(RTRIM(p.CodigoEstadoMainframe)))
                   WHEN LEN(LTRIM(RTRIM(ISNULL(md.CodigoUnidadeFederacaoMainframe, '')))) > 0
                     THEN UPPER(LTRIM(RTRIM(md.CodigoUnidadeFederacaoMainframe)))
                 END`,
      [],
    );
    const esperado = ufs.recordset
      .map((l) => ({ uf: l.Uf, total: Number(l.n) }))
      .sort((a, b) => (a.uf ?? '~').localeCompare(b.uf ?? '~'));
    const devolvido = [...r.facetas.uf].sort((a, b) => (a.uf ?? '~').localeCompare(b.uf ?? '~'));
    expect(devolvido).toEqual(esperado);
    expect(r.facetas.uf[0]).toMatchObject({ uf: 'SP' });
    expect(r.facetas.uf.find((u) => u.uf === null)?.total).toBe(MEDIDO.semUf);

    // Graus inteiros nos dois eixos, conferido no bruto: GGMMSS com MMSS zero.
    const suspeitasNoBanco = await contar(
      `SELECT n = COUNT(*) FROM dbo.Postos p
        WHERE p.Excluido = 0
          AND p.CoordenadaGrausLatitudade IS NOT NULL AND p.CoordenadaGrausLongitude IS NOT NULL
          AND ((p.CoordenadaGrausLatitudade BETWEEN 10000 AND 999999 AND p.CoordenadaGrausLatitudade % 10000 = 0)
            OR (p.CoordenadaGrausLatitudade >= 10000000 AND p.CoordenadaGrausLatitudade % 1000000 = 0))
          AND ((p.CoordenadaGrausLongitude BETWEEN 10000 AND 999999 AND p.CoordenadaGrausLongitude % 10000 = 0)
            OR (p.CoordenadaGrausLongitude >= 10000000 AND p.CoordenadaGrausLongitude % 1000000 = 0))`,
    );
    const suspeitas = r.pontos.filter((p) => p.coordenadaSuspeita);
    expect(suspeitas.length).toBe(suspeitasNoBanco);
    expect(suspeitas.length).toBe(MEDIDO.coordenadaSuspeita);
    expect(suspeitas.map((p) => p.prefixo)).toContain('4G-002');

    const semUgrhi = await listarPontosMapa(mapaPostosRepositoryMssql, { ugrhi: [null] });
    expect(semUgrhi.total).toBe(MEDIDO.semUgrhi);
    expect(semUgrhi.pontos.every((p) => p.ugrhi === null)).toBe(true);

    // Fora do Estado: ponto fora da união das 22 UGRHIs (a mesma geometria que
    // a tela desenha). Ray casting no anel externo de cada polígono.
    const geo = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'public/geo/ugrhis-sp.json'), 'utf8'),
    ) as { features: { geometry: { coordinates: number[][][][] } }[] };
    const aneis = geo.features.flatMap((f) => f.geometry.coordinates.map((poli) => poli[0]!));
    const dentroDoAnel = (lon: number, lat: number, anel: number[][]) => {
      let dentro = false;
      for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
        const [xi, yi] = anel[i]!;
        const [xj, yj] = anel[j]!;
        if (yi! > lat !== yj! > lat && lon < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) {
          dentro = !dentro;
        }
      }
      return dentro;
    };
    const comCoordenada = r.pontos.filter((p) => p.lat !== null && p.lon !== null);
    const fora = comCoordenada.filter((p) => !aneis.some((a) => dentroDoAnel(p.lon!, p.lat!, a)));
    // Âncora de presença: um posto medido dentro (1D-008, CRUZEIRO) e um fora
    // (02650009, PAULA FREITAS, PR), para a régua não aprovar "tudo fora".
    expect(fora.map((p) => p.prefixo)).toContain('02650009');
    expect(fora.map((p) => p.prefixo)).not.toContain('1D-008');
    expect(comCoordenada.map((p) => p.prefixo)).toContain('1D-008');
    const foraPorUf: Record<string, number> = {};
    for (const p of fora) foraPorUf[p.uf ?? 'sem'] = (foraPorUf[p.uf ?? 'sem'] ?? 0) + 1;
    const foraSp = fora.filter((p) => p.uf === 'SP');

    // Nomes de UGRHI do banco contra os da tela: toda palavra do banco aparece
    // no nome da tela (o banco grava sem acento e em caixa alta).
    const { NOMES_UGRHI } = await import('@/components/features/postos/mapa/ugrhis');
    const nomes = await consultarMssql<{ Codigo: number; Descricao: string }>(
      'SELECT u.Codigo, u.Descricao FROM dbo.UGRHIs u WHERE u.Excluido = 0 AND u.Codigo BETWEEN 1 AND 22',
      [],
    );
    const semAcento = (t: string) =>
      t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const divergentes = nomes.recordset.filter((l) => {
      const tela = semAcento(NOMES_UGRHI[Number(l.Codigo)] ?? '');
      return semAcento(l.Descricao)
        .split(/[^A-Z]+/)
        .filter((palavra) => palavra.length > 2)
        .some((palavra) => !tela.includes(palavra));
    });
    expect(nomes.recordset.length).toBe(22);

    // Tamanho do corpo com e sem os três campos novos, na mesma execução.
    const corpo = JSON.stringify(r);
    const antes = JSON.stringify({
      ...r,
      pontos: r.pontos.map((p) => {
        const resto: Record<string, unknown> = { ...p };
        delete resto.municipio;
        delete resto.uf;
        delete resto.coordenadaSuspeita;
        return resto;
      }),
    });

    console.log(
      JSON.stringify({
        medicao: 'fora_de_sp',
        com_coordenada: comCoordenada.length,
        fora_do_estado: fora.length,
        fora_por_uf: foraPorUf,
        fora_declarando_sp: foraSp.length,
        fora_declarando_sp_exemplos: foraSp.slice(0, 10).map((p) => [p.prefixo, p.lat, p.lon]),
        coordenada_suspeita: suspeitas.map((p) => `${p.prefixo} (${p.uf ?? 'sem UF'})`),
        sem_ugrhi: semUgrhi.total,
        facetas_uf: r.facetas.uf,
        ugrhi_nome_divergente: divergentes,
        bytes_bruto_antes: Buffer.byteLength(antes),
        bytes_gzip_antes: gzipSync(antes).length,
        bytes_bruto_depois: Buffer.byteLength(corpo),
        bytes_gzip_depois: gzipSync(corpo).length,
      }),
    );
  });

  it('contagem cruzada: filtrar vazão não muda a própria faceta e restringe as outras', async () => {
    const { mapaPostosRepositoryMssql } = await import(
      '@/infrastructure/db/mapa-postos-repository.mssql'
    );
    const { listarPontosMapa } = await import('@/application/use-cases/listar-pontos-mapa');
    const r = await listarPontosMapa(mapaPostosRepositoryMssql, { vazao: ['qualquer'] });
    expect(r.total).toBe(MEDIDO.qualquerVazao);
    expect(r.facetas.vazao.qualquer).toBe(MEDIDO.qualquerVazao);
    const somaTipos = Object.values(r.facetas.tipo).reduce((a, b) => a + b, 0);
    const semTipo = r.pontos.filter((p) => p.tipo === null).length;
    expect(somaTipos + semTipo).toBe(MEDIDO.qualquerVazao);
  });
});

rodar('medições de vazão e curvas-chave', () => {
  it('medições: total do posto com mais medições é o COUNT do banco', async () => {
    const { vazaoPostoRepositoryMssql } = await import(
      '@/infrastructure/db/vazao-posto-repository.mssql'
    );
    const prefixo = await prefixoCom(
      `SELECT TOP 1 p.Prefixo FROM dbo.ResumoMedicaoVazoes r
         JOIN dbo.Postos p ON p.Id = r.PostoId
        WHERE r.Excluido = 0 AND p.Excluido = 0
        GROUP BY p.Prefixo ORDER BY COUNT(*) DESC, p.Prefixo`,
    );
    const esperado = await contar(
      `SELECT n = COUNT(*) FROM dbo.ResumoMedicaoVazoes r
        WHERE r.Excluido = 0
          AND r.PostoId = (SELECT TOP 1 p.Id FROM dbo.Postos p
                            WHERE p.Excluido = 0 AND p.Prefixo = @prefixo)`,
      prefixo,
    );
    const t0 = performance.now();
    const pagina = await vazaoPostoRepositoryMssql.listarMedicoes(prefixo, {
      pagina: 1,
      porPagina: 50,
    });
    const ms = Math.round(performance.now() - t0);
    expect(pagina?.total).toBe(esperado);
    expect(pagina?.itens).toHaveLength(Math.min(50, esperado));
    const datas = pagina!.itens.map((m) => m.dataInicial);
    expect(datas).toEqual([...datas].sort().reverse());
    console.log(
      JSON.stringify({ medicao: 'medicoes', prefixo, total: pagina?.total, ms, exemplo: pagina?.itens[0] }),
    );
  });

  it('curvas: posto com mais curvas devolve todas, com os trechos gravados', async () => {
    const { vazaoPostoRepositoryMssql } = await import(
      '@/infrastructure/db/vazao-posto-repository.mssql'
    );
    const prefixo = await prefixoCom(
      `SELECT TOP 1 p.Prefixo FROM dbo.CurvaChaveFluviometricas c
         JOIN dbo.Postos p ON p.Id = c.PostoId
        WHERE c.Excluido = 0 AND p.Excluido = 0
        GROUP BY p.Prefixo ORDER BY COUNT(*) DESC, p.Prefixo`,
    );
    const idPosto = `(SELECT TOP 1 p.Id FROM dbo.Postos p WHERE p.Excluido = 0 AND p.Prefixo = @prefixo)`;
    const curvasNoBanco = await contar(
      `SELECT n = COUNT(*) FROM dbo.CurvaChaveFluviometricas c
        WHERE c.Excluido = 0 AND c.PostoId = ${idPosto}`,
      prefixo,
    );
    const trechosNoBanco = await contar(
      `SELECT n = COUNT(*) FROM dbo.EquacoesCurvaChaveFluviometricas e
         JOIN dbo.CurvaChaveFluviometricas c ON c.Id = e.CurvaChaveId
        WHERE e.Excluido = 0 AND c.Excluido = 0 AND c.PostoId = ${idPosto}`,
      prefixo,
    );
    const t0 = performance.now();
    const curvas = await vazaoPostoRepositoryMssql.listarCurvasChave(prefixo);
    const ms = Math.round(performance.now() - t0);
    expect(curvas?.length).toBe(curvasNoBanco);
    expect(curvas?.length).toBe(60);
    expect(curvas?.reduce((s, c) => s + c.trechos.length, 0)).toBe(trechosNoBanco);
    expect(curvas?.filter((c) => c.vigente)).toHaveLength(0);
    console.log(
      JSON.stringify({
        medicao: 'curvas',
        prefixo,
        total: curvas?.length,
        trechos: trechosNoBanco,
        ms,
        bytes: Buffer.byteLength(JSON.stringify(curvas)),
        exemplo: curvas?.[0],
      }),
    );
  });

  it('prefixo inexistente devolve null nas duas leituras', async () => {
    const { vazaoPostoRepositoryMssql } = await import(
      '@/infrastructure/db/vazao-posto-repository.mssql'
    );
    expect(
      await vazaoPostoRepositoryMssql.listarMedicoes('ZZ-999', { pagina: 1, porPagina: 10 }),
    ).toBeNull();
    expect(await vazaoPostoRepositoryMssql.listarCurvasChave('ZZ-999')).toBeNull();
  });
});
