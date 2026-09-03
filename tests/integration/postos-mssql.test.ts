/**
 * Integração do adaptador de postos contra o SQL SERVER REAL do órgão (`Dbfch`).
 *
 * Roda apenas quando `SQLSERVER_HOST` está definido no ambiente, com a VPN do
 * governo ligada. Sem a variável o arquivo inteiro é pulado. **Toda consulta
 * aqui é somente leitura**, e a barreira que garante isso não é a boa vontade
 * deste arquivo: é `conferirConsultaDeLeitura`, que roda dentro de
 * `consultarMssql` e recusa verbo de escrita antes de a consulta sair do
 * processo (exercitada em `tests/unit/mssql-guarda-somente-leitura.test.ts`).
 *
 * Se a VPN cair, o sintoma é TIMEOUT, e não erro de credencial. Vale ler a
 * mensagem antes de procurar senha trocada.
 *
 * Os números esperados abaixo foram MEDIDOS em 02/09/2026 e estão escritos como
 * constante nomeada de propósito: se o órgão cadastrar postos, o teste falha
 * dizendo qual número mudou, que é informação, e não ruído.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { PostosRepository } from '@/application/ports/postos-repository';
import { EscritaIndisponivel } from '@/domain/errors';
import { POSTOS_FIXTURES } from '@/infrastructure/mock/fixtures';

const rodar = process.env.SQLSERVER_HOST ? describe : describe.skip;

/** Contagem de `dbo.Postos` com `Excluido = 0`. Existem 13 excluídos. */
const POSTOS_ATIVOS = 5790;

/**
 * Posto de coordenada conhecida, usado como âncora da conversão sexagesimal.
 * Bruto: 223533 / 445758. Município CRUZEIRO, no Vale do Paraíba.
 */
const ANCORA = {
  prefixo: '1D-008',
  nome: 'CRUZEIRO',
  municipio: 'CRUZEIRO',
  tipo: 'FLUVIOMÉTRICO',
  latitude: -22.5925,
  longitude: -44.966111,
  ugrhiNumero: '2',
  ugrhiNome: 'PARAIBA DO SUL',
  subUgrhiNumero: '2_2',
} as const;

/** Um dos 62 nomes acentuados. Prova a decodificação do `varchar` pelo tedious. */
const ACENTUADO = { prefixo: '2E-049', nome: 'RIBEIRÃO DO CHAPÉU' } as const;

/** Postos com aparelho telemétrico ATIVO (`DataDesativacao IS NULL`). */
const POSTOS_TELEMETRICOS = 149;

async function repo(): Promise<PostosRepository> {
  const m = await import('@/infrastructure/db/postos-repository.mssql');
  return m.postosRepository;
}

afterAll(async () => {
  if (!process.env.SQLSERVER_HOST) return;
  const { encerrarPoolMssql } = await import('@/infrastructure/db/mssql-client');
  await encerrarPoolMssql();
});

rodar('leitura ao vivo do Dbfch', () => {
  it('busca posto por prefixo e devolve a ficha com os campos derivados de junção', async () => {
    const posto = await (await repo()).buscarPorPrefixo(ANCORA.prefixo);
    expect(posto).not.toBeNull();
    expect(posto!.prefixo).toBe(ANCORA.prefixo);
    expect(posto!.nomeEstacao).toBe(ANCORA.nome);
    // Junções: as três que o ADR §10.4 resolveu por medição.
    expect(posto!.municipio).toBe(ANCORA.municipio);
    expect(posto!.tipoPosto).toBe(ANCORA.tipo);
    expect(posto!.ugrhiNumero).toBe(ANCORA.ugrhiNumero);
    expect(posto!.ugrhiNome).toBe(ANCORA.ugrhiNome);
    // Formato da sub-UGRHI: eles escrevem 202, o nosso cadastro escreve 2_2.
    expect(posto!.subUgrhiNumero).toBe(ANCORA.subUgrhiNumero);
    expect(posto!.subUgrhiNome).toContain('SUB-UGRHI');
    // GUID sai maiúsculo do SQL Server e é normalizado na fronteira.
    expect(posto!.id).toBe(posto!.id.toLowerCase());
    expect(posto!.origem).toBe('dbfch');
  });

  it('converte a coordenada sexagesimal com o sinal certo e no eixo certo', async () => {
    const posto = await (await repo()).buscarPorPrefixo(ANCORA.prefixo);
    // Latitude e longitude são conferidas SEPARADAMENTE contra valores
    // conhecidos: trocar os eixos passaria por qualquer asserção que só
    // checasse "os dois são negativos".
    expect(posto!.latitude).toBeCloseTo(ANCORA.latitude, 4);
    expect(posto!.longitude).toBeCloseTo(ANCORA.longitude, 4);
    // São Paulo está a sul e a oeste, e os inteiros da origem são magnitudes
    // SEM sinal: se alguém remover o sinal, o posto vai parar no hemisfério
    // errado sem nada quebrar.
    expect(posto!.latitude!).toBeLessThan(0);
    expect(posto!.longitude!).toBeLessThan(0);
    // Longitude de São Paulo é mais a oeste que a latitude é ao sul. Se os dois
    // eixos forem trocados, este par de faixas denuncia.
    expect(posto!.latitude!).toBeGreaterThan(-26);
    expect(posto!.longitude!).toBeLessThan(-43);
  });

  it('devolve o acento íntegro, sem tratamento manual de code page', async () => {
    // Esta é a HIPÓTESE que o ADR §3 deixou para a implementação decidir: o
    // `tedious` decodifica `varchar` pela code page da collation, dispensando o
    // `cp1252` explícito que a sondagem em Python precisou. Confirmada aqui.
    const posto = await (await repo()).buscarPorPrefixo(ACENTUADO.prefixo);
    expect(posto!.nomeEstacao).toBe(ACENTUADO.nome);
    // Nem "RIBEIRAO", nem "RIBEIR?O", nem mojibake.
    expect(posto!.nomeEstacao).toContain('Ã');
    expect(posto!.nomeEstacao).toContain('É');
  });

  it('não devolve os 13 postos excluídos', async () => {
    const r = await (await repo()).pesquisar({ pagina: 1, porPagina: 1 });
    expect(r.total).toBe(POSTOS_ATIVOS);
  });

  it('busca textual ignora acento nos dois sentidos (COLLATE CI_AI)', async () => {
    const p = await repo();
    // A collation do banco é `..._CI_AS`, sensível a acento: sem o COLLATE
    // explícito, procurar CHAPEU não acharia CHAPÉU, e o defeito atingiria
    // exatamente os 62 registros acentuados, de forma imprevisível.
    const semAcento = await p.pesquisar({ termo: 'CHAPEU', pagina: 1, porPagina: 20 });
    const comAcento = await p.pesquisar({ termo: 'CHAPÉU', pagina: 1, porPagina: 20 });
    expect(semAcento.total).toBeGreaterThan(0);
    expect(semAcento.total).toBe(comAcento.total);
    expect(semAcento.itens.map((i) => i.prefixo)).toContain(ACENTUADO.prefixo);
  });

  it('trata curinga de LIKE como texto, e não como padrão', async () => {
    // Sem escapar, quem digita "%" recebe a tabela inteira.
    const r = await (await repo()).pesquisar({ termo: '%', pagina: 1, porPagina: 5 });
    expect(r.total).toBeLessThan(POSTOS_ATIVOS);
  });

  it('pagina sem sobreposição e com total estável', async () => {
    const p = await repo();
    const pagina1 = await p.pesquisar({ pagina: 1, porPagina: 25 });
    const pagina2 = await p.pesquisar({ pagina: 2, porPagina: 25 });
    expect(pagina1.itens).toHaveLength(25);
    expect(pagina2.itens).toHaveLength(25);
    expect(pagina1.total).toBe(pagina2.total);
    const prefixos = new Set([
      ...pagina1.itens.map((i) => i.prefixo),
      ...pagina2.itens.map((i) => i.prefixo),
    ]);
    expect(prefixos.size).toBe(50);
  });

  it('filtra por UGRHI usando o caminho direto e o caminho pelo município', async () => {
    const r = await (await repo()).pesquisar({
      ugrhiNumero: '2',
      pagina: 1,
      porPagina: 10,
    });
    expect(r.total).toBeGreaterThan(0);
    for (const item of r.itens) expect(item.ugrhiNumero).toBe('2');
  });

  it('deriva instrumentação por vínculo de aparelho ATIVO', async () => {
    const r = await (await repo()).pesquisar({
      temTelemetrico: true,
      pagina: 1,
      porPagina: 10,
    });
    // A contagem é a resposta à pendência 12.4 do ADR: com o filtro de
    // `DataDesativacao` são 149 postos, e sem ele seriam 150. O campo responde
    // "o posto TEM", e não "o posto já teve".
    expect(r.total).toBe(POSTOS_TELEMETRICOS);
    for (const item of r.itens) {
      expect(item.telemetrico).not.toBeNull();
      expect(item.telemetrico).toMatch(/TELEMETRICO/);
    }
  });

  it('autocompleta por prefixo, ordenado, respeitando o limite', async () => {
    const sugestoes = await (await repo()).autocompletar('1D-0', 5);
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(sugestoes.length).toBeLessThanOrEqual(5);
    const prefixos = sugestoes.map((s) => s.prefixo);
    expect([...prefixos].sort()).toEqual(prefixos);
    for (const s of prefixos) expect(s.startsWith('1D-0')).toBe(true);
  });

  it('ignora termo curto no autocomplete sem ir ao banco', async () => {
    expect(await (await repo()).autocompletar('1', 5)).toEqual([]);
  });

  it('monta o mapa prefixo/id com todos os ativos e casa com a busca unitária', async () => {
    const p = await repo();
    const mapa = await p.mapaIdsPorPrefixo();
    expect(mapa.size).toBe(POSTOS_ATIVOS);
    const posto = await p.buscarPorPrefixo(ANCORA.prefixo);
    expect(mapa.get(ANCORA.prefixo)).toBe(posto!.id);
  });

  it('devolve null para prefixo inexistente, em vez de estourar', async () => {
    expect(await (await repo()).buscarPorPrefixo('NAO-EXISTE-999')).toBeNull();
  });
});

rodar('a porta não mudou: a forma da resposta é a mesma do contrato', () => {
  it('o posto lido do Dbfch tem exatamente as chaves do tipo de domínio', async () => {
    // O mock implementa a MESMA porta e não depende de banco nenhum, então
    // serve de referência da forma canônica. Comparar o conjunto de chaves é o
    // caso que passa nos dois adaptadores e prova que a troca de origem não
    // vazou o schema do órgão para dentro do domínio.
    const doMock = POSTOS_FIXTURES[0];
    expect(doMock).toBeDefined();
    const doOrgao = await (await repo()).buscarPorPrefixo(ANCORA.prefixo);

    const chavesObrigatorias = Object.keys(doMock!).filter(
      // Os dois campos de indexação são opcionais na porta e populados pelo
      // use case, não pelo repositório.
      (k) => k !== 'indexadoEm' && k !== 'indexExpiraEm',
    );
    for (const chave of chavesObrigatorias) {
      expect(Object.hasOwn(doOrgao!, chave)).toBe(true);
    }
    // E o inverso: nada além do contrato entrou na resposta.
    const extras = Object.keys(doOrgao!).filter((k) => !Object.keys(doMock!).includes(k));
    expect(extras).toEqual([]);
  });

  it('os doze campos sem origem em Dbfch não voltam nem como chave nula', async () => {
    // Este caso mediu, até 03/09/2026, que os doze vinham `null` em vez de
    // ausentes. Eles saíram do domínio naquele dia, e o caso passou a medir o
    // sucessor da mesma pergunta: chave que a origem nunca preenche não deve
    // reaparecer. É a guarda que impede alguém de "reconectar" `Grupos` a
    // `rede` ou `Historicos` a `observacoes` sem passar pela decisão.
    const posto = await (await repo()).buscarPorPrefixo(ANCORA.prefixo);
    const chaves = Object.keys(posto!);
    const ressuscitados = [
      'rede',
      'btl',
      'ciaAmbiental',
      'cobacia',
      'observacoes',
      'tempoTransmissao',
      'statusPcd',
      'ultimaTransmissao',
      'fichaInspecao',
      'ultimaDataFi',
      'fichaDescritiva',
      'ultimaAtualizacaoFd',
    ].filter((c) => chaves.includes(c));
    expect(ressuscitados).toEqual([]);

    // `municipioAlt` continua no contrato e continua sem origem, e por isso
    // continua provando a distinção original: `null` é "o órgão não informou",
    // e ausente seria "o sistema não busca". O que decide entre remover e
    // manter nulo não é a taxa de preenchimento: é existir origem.
    expect(Object.hasOwn(posto!, 'municipioAlt')).toBe(true);
    expect(posto!.municipioAlt).toBeNull();
  });

  it('telemetrico NÃO saiu, porque é derivado e tem origem de verdade', async () => {
    // Escrito junto da remoção dos doze, e o motivo é que ele quase foi junto.
    // `telemetrico` não aparece em `sys.columns` (não é coluna, é derivado de
    // `AparelhoPostos` x `Aparelhos`) e preenche 2,6% da base, então some de
    // qualquer amostra pequena. Os dois sinais que sugeriam removê-lo são os
    // mesmos de `aquifero`, que também ficou. Este caso existe para que a
    // próxima varredura por campo vazio esbarre no fato, e não na impressão.
    const r = await (await repo()).pesquisar({
      temTelemetrico: true,
      pagina: 1,
      porPagina: 5,
    });
    expect(r.total).toBe(POSTOS_TELEMETRICOS);
    expect(r.itens.every((i) => i.telemetrico !== null)).toBe(true);
  });
});

rodar('escrita: indisponível, e em voz alta', () => {
  it('os quatro métodos de escrita lançam EscritaIndisponivel', async () => {
    const p = await repo();
    const ator = { usuarioId: 'u1', ip: null, userAgent: null };
    await expect(p.atualizar(ANCORA.prefixo, { nomeEstacao: 'X' }, ator)).rejects.toThrow(
      EscritaIndisponivel,
    );
    await expect(p.criar({ prefixo: 'ZZ-999' }, ator)).rejects.toThrow(EscritaIndisponivel);
    await expect(p.remover(ANCORA.prefixo, ator)).rejects.toThrow(EscritaIndisponivel);
    await expect(p.restaurar(ANCORA.prefixo, ator)).rejects.toThrow(EscritaIndisponivel);
  });

  it('e o banco do órgão continua intacto depois das quatro tentativas', async () => {
    // O efeito colateral se mede pelo ESTADO, e não pelo tipo do erro: um
    // método que escrevesse E jogasse depois passaria na asserção acima.
    const p = await repo();
    const antes = await p.pesquisar({ pagina: 1, porPagina: 1 });
    const ator = { usuarioId: 'u1', ip: null, userAgent: null };
    for (const tentativa of [
      () => p.criar({ prefixo: 'ZZ-999' }, ator),
      () => p.remover(ANCORA.prefixo, ator),
    ]) {
      await expect(tentativa()).rejects.toThrow(EscritaIndisponivel);
    }
    const depois = await p.pesquisar({ pagina: 1, porPagina: 1 });
    expect(depois.total).toBe(antes.total);
    expect(depois.total).toBe(POSTOS_ATIVOS);
    // E o posto que a remoção teria apagado continua legível.
    expect(await p.buscarPorPrefixo(ANCORA.prefixo)).not.toBeNull();
  });
});
