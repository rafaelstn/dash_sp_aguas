/**
 * Séries históricas de medição contra o SQL SERVER REAL do órgão.
 *
 * Roda apenas com `SQLSERVER_HOST` definido e a VPN ligada. SOMENTE LEITURA: não
 * há INSERT, UPDATE, DDL nem criação de índice em lugar nenhum deste arquivo.
 * Se a VPN cair o sintoma é TIMEOUT, e não erro de credencial.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * A RÉGUA É CONTAGEM, E O NÚMERO ESPERADO VEM DO BANCO NA MESMA EXECUÇÃO
 * ═════════════════════════════════════════════════════════════════════════
 * O projeto já pagou por um ZERO que parecia resposta: o painel devolvia zero e
 * passou por 875 testes, porque todos conferiam a FORMA do objeto. Aqui quase
 * todo `expect` compara o que a porta devolve com o mesmo número apurado por uma
 * consulta que ESTE arquivo dispara. As poucas constantes escritas à mão são as
 * MEDIDAS de 03/09/2026, e existem para um papel só: pegar zero e ordem de
 * grandeza errada. Se o órgão voltar a alimentar a base, elas falham dizendo
 * qual número mudou, que é o alarme certo.
 *
 * Os postos apontados por constante são ponteiros, e não valores esperados:
 * cada um é o pior caso de uma série, escolhido pela medição do catálogo.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { SeriesMedicaoRepository } from '@/application/ports/series-medicao-repository';
import type { SerieMedicao } from '@/domain/monitor/serie-medicao';

const rodar = process.env.SQLSERVER_HOST ? describe : describe.skip;

/** Maior série de chuva manual da base: 41.002 leituras, de 1888 a 2004. */
const POSTO_GRANDE = 'E3-036';
/** Maior série de cota: 70.068 leituras, de 1929 a 2025. */
const POSTO_COTA = '3D-006';
/** Maior série de registrador de chuva: 71.734 leituras. */
const POSTO_LOGGER = 'C5-125';
/** Maior série de piezômetro eletrônico: 57.899 leituras. */
const POSTO_PIEZO = '4C-506Z';
/** Único posto da base com data futura na chuva manual: 30 linhas até 30/11/2026. */
const POSTO_COM_DATA_FUTURA = 'B6-026';
/** Posto com dias de duas leituras na chuva manual, que é 1 por dia no resto. */
const POSTO_COM_DIA_DUPLICADO = 'D4-016';

/** Leituras de chuva manual do `E3-036`, MEDIDO em 03/09/2026. */
const LEITURAS_E3_036 = 41002;

/**
 * Teto de tempo do resumo, que é a operação que a tela dispara ao abrir.
 *
 * MEDIDO em 03/09/2026, pela VPN: 197, 182 e 179 ms no `E3-036`, e o pior de
 * todos foi 289 ms no maior posto de cota. O teto é folgado de propósito, porque
 * a VPN varia e teste que reprova por rede lenta vira teste que alguém desliga.
 * O que ele existe para pegar não é lentidão de 100 ms: é a mudança de plano que
 * transforma a busca por posto em varredura de 27 milhões de linhas, e essa
 * mudança sai da casa dos milissegundos.
 */
const TETO_RESUMO_MS = 5000;

async function porta(): Promise<SeriesMedicaoRepository> {
  const m = await import('@/infrastructure/db/series-medicao-repository.mssql');
  return m.seriesMedicaoRepositoryMssql;
}

/** Consulta de conferência: é ela que produz o número esperado, não a memória. */
async function contar(sqlTexto: string, prefixo: string): Promise<number> {
  const { consultarMssql, TiposMssql } = await import('@/infrastructure/db/mssql-client');
  const r = await consultarMssql<{ n: number }>(sqlTexto, [
    { nome: 'prefixo', tipo: TiposMssql.texto, valor: prefixo },
  ]);
  const linha = r.recordset[0];
  if (!linha) throw new Error('consulta de conferência sem linha');
  return Number(linha.n);
}

/** Sub-consulta do posto, para as conferências não repetirem a tradução. */
const ID_DO_POSTO =
  '(SELECT TOP 1 p.Id FROM dbo.Postos p WHERE p.Excluido = 0 AND p.Prefixo = @prefixo)';

afterAll(async () => {
  if (!process.env.SQLSERVER_HOST) return;
  const { encerrarPoolMssql } = await import('@/infrastructure/db/mssql-client');
  await encerrarPoolMssql();
});

rodar('resumo das séries do posto', () => {
  it('o total de leituras é o total do banco, contado agora', async () => {
    const r = await (await porta()).resumoPorPosto(POSTO_GRANDE);
    expect(r).not.toBeNull();

    const doBanco = await contar(
      `SELECT n = COUNT(*) FROM dbo.MedicaoPluviometricas m
        WHERE m.Excluido = 0 AND m.PostoId = ${ID_DO_POSTO}`,
      POSTO_GRANDE,
    );
    const chuva = r?.find((s) => s.serie === 'chuva_manual');
    expect(chuva?.leituras).toBe(doBanco);
    // A ordem de grandeza também: um adaptador que devolvesse 0 passaria no
    // `toBe` acima se a consulta de conferência também estivesse quebrada.
    expect(chuva?.leituras).toBe(LEITURAS_E3_036);
  });

  it('devolve SEMPRE as cinco séries, inclusive as que não existem no posto', async () => {
    // Omitir a série vazia faria a tela não distinguir "este posto não mede rio"
    // de "não conseguimos consultar o rio". As duas pedem ação diferente.
    const r = await (await porta()).resumoPorPosto(POSTO_GRANDE);
    expect(r).toHaveLength(5);
    expect(r?.map((s) => s.serie).sort()).toEqual(
      [
        'chuva_logger',
        'chuva_manual',
        'cota_rio',
        'piezo_eletronico',
        'piezo_manual',
      ].sort(),
    );
    // O `E3-036` só tem chuva manual: as outras quatro voltam zeradas e
    // explícitas, com as datas nulas.
    for (const s of r ?? []) {
      if (s.serie === 'chuva_manual') continue;
      expect(s.leituras).toBe(0);
      expect(s.primeiraData).toBeNull();
      expect(s.ultimaData).toBeNull();
    }
  });

  it('prefixo inexistente devolve null, e NÃO cinco séries zeradas', async () => {
    // A distinção é o núcleo desta tela: cinco zeros dizem "o posto existe e não
    // tem série"; `null` diz "não há esse posto". Colapsar as duas faria um erro
    // de digitação parecer um posto sem histórico.
    expect(await (await porta()).resumoPorPosto('ZZ-999')).toBeNull();
  });

  it('acha o posto com prefixo em minúscula, como a busca do cadastro', async () => {
    const r = await (await porta()).resumoPorPosto(POSTO_GRANDE.toLowerCase());
    expect(r).not.toBeNull();
    expect(r?.find((s) => s.serie === 'chuva_manual')?.leituras).toBe(LEITURAS_E3_036);
  });

  it('a data mais recente IGNORA leitura com data no futuro, e conta quantas ignorou', async () => {
    // MEDIDO: este é o único posto da base com data futura na chuva manual, e
    // sem este cuidado a ficha dele anunciaria série "até novembro de 2026" numa
    // base que parou em agosto de 2025.
    const r = await (await porta()).resumoPorPosto(POSTO_COM_DATA_FUTURA);
    const chuva = r?.find((s) => s.serie === 'chuva_manual');

    const futurasNoBanco = await contar(
      `SELECT n = COUNT(*) FROM dbo.MedicaoPluviometricas m
        WHERE m.Excluido = 0 AND m.PostoId = ${ID_DO_POSTO} AND m.Data > GETDATE()`,
      POSTO_COM_DATA_FUTURA,
    );

    expect(futurasNoBanco).toBeGreaterThan(0);
    expect(chuva?.leiturasComDataFutura).toBe(futurasNoBanco);
    expect(chuva?.ultimaData).not.toBeNull();
    expect(chuva!.ultimaData! < new Date().toISOString().slice(0, 10)).toBe(true);
    // E a contagem total CONTINUA incluindo as futuras: elas existem na origem,
    // e sumir com elas seria esconder o dado sujo em vez de mostrá-lo.
    const totalNoBanco = await contar(
      `SELECT n = COUNT(*) FROM dbo.MedicaoPluviometricas m
        WHERE m.Excluido = 0 AND m.PostoId = ${ID_DO_POSTO}`,
      POSTO_COM_DATA_FUTURA,
    );
    expect(chuva?.leituras).toBe(totalNoBanco);
  });

  it('conta a sentinela da cota, e o número é o do banco', async () => {
    const r = await (await porta()).resumoPorPosto(POSTO_COTA);
    const cota = r?.find((s) => s.serie === 'cota_rio');

    const sentinelaNoBanco = await contar(
      `SELECT n = COUNT(*) FROM dbo.CotaEscalaFluviometricas m
        WHERE m.Excluido = 0 AND m.PostoId = ${ID_DO_POSTO} AND m.Valor = 9999`,
      POSTO_COTA,
    );

    expect(cota?.leiturasSemValor).toBe(sentinelaNoBanco);
    // E não é o total: as leituras com medida continuam sendo a maioria neste
    // posto. Um adaptador que descartasse tudo passaria no `toBe` acima se a
    // conferência também estivesse errada.
    expect(cota!.leituras).toBeGreaterThan(cota!.leiturasSemValor);
  });

  it('as duas séries de piezômetro aparecem separadas, com contagens próprias', async () => {
    // Juntá-las seria erro de dado: MEDIDO, a manual vai de 0 a 41.500 e a
    // eletrônica de -3 a 1.033, ordens de grandeza distintas na mesma unidade
    // declarada.
    const r = await (await porta()).resumoPorPosto(POSTO_PIEZO);
    const manual = r?.find((s) => s.serie === 'piezo_manual');
    const eletronico = r?.find((s) => s.serie === 'piezo_eletronico');
    expect(manual?.leituras).toBeGreaterThan(0);
    expect(eletronico?.leituras).toBeGreaterThan(0);
    expect(eletronico!.leituras).toBeGreaterThan(manual!.leituras);
  });

  it('responde rápido E sem carregar as 41 mil leituras', async () => {
    // Duas afirmações, porque uma só não fecha. O tempo pega a mudança de plano
    // que transformaria a busca por posto em varredura da tabela. O TAMANHO da
    // resposta pega o desenho: um resumo que trouxesse as leituras responderia
    // dentro do teto pela VPN boa e mataria o navegador em produção.
    const inicio = Date.now();
    const r = await (await porta()).resumoPorPosto(POSTO_GRANDE);
    const decorrido = Date.now() - inicio;

    expect(decorrido).toBeLessThan(TETO_RESUMO_MS);
    expect(r?.find((s) => s.serie === 'chuva_manual')?.leituras).toBe(LEITURAS_E3_036);
    // Cinco resumos cabem em poucas centenas de bytes. Quarenta e um mil
    // leituras não cabem em cem mil.
    expect(JSON.stringify(r).length).toBeLessThan(3000);
  });

  it('o pior posto de cada série responde dentro do mesmo teto', async () => {
    for (const prefixo of [POSTO_COTA, POSTO_LOGGER, POSTO_PIEZO]) {
      const inicio = Date.now();
      const r = await (await porta()).resumoPorPosto(prefixo);
      expect(Date.now() - inicio).toBeLessThan(TETO_RESUMO_MS);
      expect(r?.some((s) => s.leituras > 0)).toBe(true);
    }
  });
});

rodar('leituras paginadas', () => {
  const JANELA_1950 = {
    desde: new Date(Date.UTC(1950, 0, 1)),
    ate: new Date(Date.UTC(1959, 11, 31)),
  };

  it('o total da janela é o total do banco na mesma janela', async () => {
    const p = await (await porta()).listarLeituras(
      POSTO_GRANDE,
      'chuva_manual',
      JANELA_1950,
      { pagina: 1, porPagina: 50 },
    );

    const { consultarMssql, TiposMssql } = await import('@/infrastructure/db/mssql-client');
    const r = await consultarMssql<{ n: number }>(
      `SELECT n = COUNT(*) FROM dbo.MedicaoPluviometricas m
        WHERE m.Excluido = 0 AND m.PostoId = ${ID_DO_POSTO}
          AND m.Data >= @de AND m.Data < @ate`,
      [
        { nome: 'prefixo', tipo: TiposMssql.texto, valor: POSTO_GRANDE },
        { nome: 'de', tipo: TiposMssql.dataHora, valor: JANELA_1950.desde },
        { nome: 'ate', tipo: TiposMssql.dataHora, valor: new Date(Date.UTC(1960, 0, 1)) },
      ],
    );

    expect(p.total).toBe(Number(r.recordset[0]?.n));
    expect(p.total).toBeGreaterThan(3000);
    expect(p.itens).toHaveLength(50);
  });

  it('o último dia da janela ENTRA, e é o caso que mais fácil se perde', async () => {
    // `ate` é inclusivo no dia. Comparar `Data <= @ate` com a meia-noite
    // excluiria toda leitura feita depois dela, e a cota tem até seis leituras
    // por dia. O caso mede um único dia, então erro de borda zera o resultado.
    const p = await (await porta()).resumoPorPosto(POSTO_GRANDE);
    const ultima = p?.find((s) => s.serie === 'chuva_manual')?.ultimaData;
    expect(ultima).not.toBeNull();

    const dia = new Date(`${ultima}T00:00:00.000Z`);
    const umDiaSo = await (await porta()).listarLeituras(
      POSTO_GRANDE,
      'chuva_manual',
      { desde: dia, ate: dia },
      { pagina: 1, porPagina: 10 },
    );
    expect(umDiaSo.total).toBeGreaterThan(0);
    expect(umDiaSo.itens[0]?.momento.slice(0, 10)).toBe(ultima);
  });

  it('páginas seguidas não repetem leitura e vêm em ordem crescente', async () => {
    const p = await porta();
    const um = await p.listarLeituras(POSTO_GRANDE, 'chuva_manual', JANELA_1950, {
      pagina: 1,
      porPagina: 100,
    });
    const dois = await p.listarLeituras(POSTO_GRANDE, 'chuva_manual', JANELA_1950, {
      pagina: 2,
      porPagina: 100,
    });

    const momentosUm = um.itens.map((i) => i.momento);
    const momentosDois = dois.itens.map((i) => i.momento);
    expect(new Set([...momentosUm, ...momentosDois]).size).toBe(200);
    expect([...momentosUm].sort()).toEqual(momentosUm);
    expect(momentosUm[momentosUm.length - 1]! <= momentosDois[0]!).toBe(true);
  });

  it('a sentinela vira valor nulo e o bruto CONTINUA visível', async () => {
    // Quem confere o dado com o órgão precisa ver o que está gravado lá, e não a
    // nossa interpretação. Sem `bruto`, "o sistema não mostra a leitura" e "a
    // leitura não existe" viram a mesma frase.
    const p = await (await porta()).listarLeituras(
      POSTO_COTA,
      'cota_rio',
      { desde: new Date(Date.UTC(1929, 9, 1)), ate: new Date(Date.UTC(1930, 0, 31)) },
      { pagina: 1, porPagina: 200 },
    );
    const sentinelas = p.itens.filter((i) => i.bruto === 9999);
    expect(sentinelas.length).toBeGreaterThan(0);
    for (const s of sentinelas) expect(s.valor).toBeNull();
  });

  it('série que o posto não tem devolve página vazia, sem estourar', async () => {
    const p = await (await porta()).listarLeituras(
      POSTO_GRANDE,
      'piezo_eletronico',
      JANELA_1950,
      { pagina: 1, porPagina: 10 },
    );
    expect(p.total).toBe(0);
    expect(p.itens).toHaveLength(0);
  });

  it('prefixo inexistente devolve página vazia em vez de estourar', async () => {
    const p = await (await porta()).listarLeituras('ZZ-999', 'chuva_manual', JANELA_1950, {
      pagina: 1,
      porPagina: 10,
    });
    expect(p.total).toBe(0);
  });

  it('a vazão da cota vem preenchida, e a sentinela dela some', async () => {
    const p = await (await porta()).listarLeituras(
      POSTO_COTA,
      'cota_rio',
      { desde: new Date(Date.UTC(2020, 0, 1)), ate: new Date(Date.UTC(2020, 11, 31)) },
      { pagina: 1, porPagina: 300 },
    );
    expect(p.itens.length).toBeGreaterThan(0);
    for (const i of p.itens) {
      // 99999,999 é marcador, e cem mil metros cúbicos por segundo é cinco vezes
      // o Amazonas: se algum passar, a régua da sentinela quebrou.
      expect(i.vazaoM3s).not.toBe(99999.999);
    }
  });

  it('série sem vazão devolve vazão nula em todas as leituras', async () => {
    const p = await (await porta()).listarLeituras(
      POSTO_GRANDE,
      'chuva_manual',
      JANELA_1950,
      { pagina: 1, porPagina: 20 },
    );
    for (const i of p.itens) expect(i.vazaoM3s).toBeNull();
  });
});

rodar('resumo diário', () => {
  it('a soma dos dias de chuva é a soma das leituras COM medida, do banco', async () => {
    // A régua que importa: se a sentinela entrasse na soma, este número estouraria
    // em centenas de milhares de milímetros e o caso reprovaria.
    const janela = {
      desde: new Date(Date.UTC(1950, 0, 1)),
      ate: new Date(Date.UTC(1959, 11, 31)),
    };
    const dias = await (await porta()).agregarPorDia(POSTO_GRANDE, 'chuva_manual', janela);

    const { consultarMssql, TiposMssql } = await import('@/infrastructure/db/mssql-client');
    const r = await consultarMssql<{ soma: number; comMedida: number }>(
      `SELECT soma = SUM(CASE WHEN m.Medicao = 999.9 THEN 0 ELSE m.Medicao END),
              comMedida = SUM(CASE WHEN m.Medicao = 999.9 THEN 0 ELSE 1 END)
         FROM dbo.MedicaoPluviometricas m
        WHERE m.Excluido = 0 AND m.PostoId = ${ID_DO_POSTO}
          AND m.Data >= @de AND m.Data < @ate`,
      [
        { nome: 'prefixo', tipo: TiposMssql.texto, valor: POSTO_GRANDE },
        { nome: 'de', tipo: TiposMssql.dataHora, valor: janela.desde },
        { nome: 'ate', tipo: TiposMssql.dataHora, valor: new Date(Date.UTC(1960, 0, 1)) },
      ],
    );

    const somaDaPorta = dias.reduce((acc, d) => acc + (d.valor ?? 0), 0);
    expect(Math.round(somaDaPorta * 10)).toBe(Math.round(Number(r.recordset[0]?.soma) * 10));
    expect(Number(r.recordset[0]?.comMedida)).toBeGreaterThan(0);
  });

  it('dia cujas leituras são todas sentinela vem com valor NULO, e não zero', async () => {
    // É a diferença entre "não choveu" e "não sabemos", e é a razão de a porta
    // não preencher lacuna com zero.
    const dias = await (await porta()).agregarPorDia(
      POSTO_COTA,
      'cota_rio',
      { desde: new Date(Date.UTC(1929, 9, 1)), ate: new Date(Date.UTC(1929, 9, 31)) },
    );
    const semMedida = dias.filter((d) => d.leiturasSemValor === d.leituras);
    expect(semMedida.length).toBeGreaterThan(0);
    for (const d of semMedida) {
      expect(d.valor).toBeNull();
      expect(d.minimo).toBeNull();
      expect(d.maximo).toBeNull();
    }
  });

  it('dia sem NENHUMA leitura não aparece na lista', async () => {
    // Preencher lacuna com zero transformaria ausência de medição em medição de
    // ausência. A janela pedida tem 31 dias e a série do posto começa depois.
    const dias = await (await porta()).agregarPorDia(
      POSTO_GRANDE,
      'chuva_manual',
      { desde: new Date(Date.UTC(1880, 0, 1)), ate: new Date(Date.UTC(1880, 0, 31)) },
    );
    expect(dias).toHaveLength(0);
  });

  it('a cota usa média com mínimo e máximo, e a média fica entre os dois', async () => {
    const dias = await (await porta()).agregarPorDia(
      POSTO_COTA,
      'cota_rio',
      { desde: new Date(Date.UTC(2020, 0, 1)), ate: new Date(Date.UTC(2020, 2, 31)) },
    );
    const comMedida = dias.filter((d) => d.valor !== null);
    expect(comMedida.length).toBeGreaterThan(0);
    for (const d of comMedida) {
      expect(d.minimo).not.toBeNull();
      expect(d.maximo).not.toBeNull();
      expect(d.valor!).toBeGreaterThanOrEqual(d.minimo!);
      expect(d.valor!).toBeLessThanOrEqual(d.maximo!);
    }
  });

  it('expõe o dia com DUAS leituras onde a série é de uma por dia', async () => {
    // MEDIDO na base inteira: 145 dias trazem duas linhas para o mesmo posto na
    // chuva manual, com valor e hora idênticos. São 290 linhas em 27 milhões, e
    // pontuais não quer dizer invisíveis: a soma daquele dia sai dobrada, então
    // a contagem por dia precisa chegar à tela para alguém poder ver.
    const dias = await (await porta()).agregarPorDia(
      POSTO_COM_DIA_DUPLICADO,
      'chuva_manual',
      { desde: new Date(Date.UTC(2023, 8, 1)), ate: new Date(Date.UTC(2023, 8, 30)) },
    );
    const duplicados = dias.filter((d) => d.leituras > 1);
    expect(duplicados.length).toBeGreaterThan(0);
  });

  it('série que o posto não tem devolve lista vazia', async () => {
    const dias = await (await porta()).agregarPorDia(
      POSTO_GRANDE,
      'cota_rio',
      { desde: new Date(Date.UTC(1950, 0, 1)), ate: new Date(Date.UTC(1959, 11, 31)) },
    );
    expect(dias).toHaveLength(0);
  });
});

rodar('as cinco séries respondem, cada uma no seu pior posto', () => {
  const CASOS: ReadonlyArray<[SerieMedicao, string]> = [
    ['chuva_manual', POSTO_GRANDE],
    ['chuva_logger', POSTO_LOGGER],
    ['cota_rio', POSTO_COTA],
    ['piezo_manual', POSTO_PIEZO],
    ['piezo_eletronico', POSTO_PIEZO],
  ];

  it.each(CASOS)('%s tem leitura no posto %s', async (serie, prefixo) => {
    // Sem este bloco, um erro de nome de coluna numa das cinco passaria: os
    // outros casos deste arquivo exercitam duas séries, e as outras três só
    // apareceriam no dia em que alguém abrisse aquele posto na tela.
    const resumo = await (await porta()).resumoPorPosto(prefixo);
    const daSerie = resumo?.find((s) => s.serie === serie);
    expect(daSerie?.leituras).toBeGreaterThan(0);
    expect(daSerie?.primeiraData).not.toBeNull();

    const janela = {
      desde: new Date(`${daSerie!.primeiraData}T00:00:00.000Z`),
      ate: new Date(`${daSerie!.primeiraData}T00:00:00.000Z`),
    };
    const pagina = await (await porta()).listarLeituras(prefixo, serie, janela, {
      pagina: 1,
      porPagina: 10,
    });
    expect(pagina.total).toBeGreaterThan(0);
  });
});
