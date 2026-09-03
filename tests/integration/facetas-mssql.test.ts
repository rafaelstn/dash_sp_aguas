/**
 * Facetas de filtro agregadas AO VIVO sobre o SQL Server do órgão.
 *
 * Roda apenas com `SQLSERVER_HOST` definido e a VPN ligada. Somente leitura.
 *
 * A asserção que mais importa aqui não é o formato: é a COERÊNCIA entre a lista
 * de filtros e a busca que ela filtra. Faceta que aparece na tela e devolve
 * zero resultado é o defeito clássico deste par, e ele não quebra nada.
 */
import { afterAll, describe, expect, it } from 'vitest';

const rodar = process.env.SQLSERVER_HOST ? describe : describe.skip;

const POSTOS_ATIVOS = 5790;

async function facetas() {
  const m = await import('@/infrastructure/db/facetas-repository.mssql');
  m._limparCacheFacetasMssql();
  return m.facetasRepository.listar();
}

afterAll(async () => {
  if (!process.env.SQLSERVER_HOST) return;
  const { encerrarPoolMssql } = await import('@/infrastructure/db/mssql-client');
  await encerrarPoolMssql();
});

rodar('facetas lidas do Dbfch', () => {
  it('devolve as cinco listas, todas preenchidas', async () => {
    const f = await facetas();
    expect(f.ugrhis.length).toBeGreaterThan(0);
    expect(f.municipios.length).toBeGreaterThan(0);
    expect(f.bacias.length).toBeGreaterThan(0);
    expect(f.tiposPosto.length).toBeGreaterThan(0);
    expect(f.mantenedores.length).toBeGreaterThan(0);
  });

  it('os tipos de posto cobrem exatamente o universo ativo', async () => {
    const f = await facetas();
    // `TipoMedicoesID` é NOT NULL na origem, então todo posto ativo tem tipo:
    // a soma tem de fechar com os 5.790. Se não fechar, alguma junção está
    // perdendo linha, e é aqui que isso aparece antes de virar tela.
    const soma = f.tiposPosto.reduce((acc, t) => acc + t.total, 0);
    expect(soma).toBe(POSTOS_ATIVOS);
    expect(f.tiposPosto.map((t) => t.codigo).sort()).toEqual([
      'FLUVIOMÉTRICO',
      'METEOROLÓGICO',
      'PIEZOMÉTRICO',
      'PLUVIOMÉTRICO',
    ]);
  });

  it('as UGRHIs saem no formato do contrato e nenhuma passa de 22', async () => {
    const f = await facetas();
    // `numero` é texto no contrato e `int` na origem. E a faceta agrega o nível
    // 1: se uma sub-UGRHI vazar para cá, ela apareceria como "202" na tela.
    for (const u of f.ugrhis) {
      expect(typeof u.numero).toBe('string');
      const n = Number(u.numero);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(22);
      expect(u.nome.length).toBeGreaterThan(0);
      expect(u.total).toBeGreaterThan(0);
    }
    // Cobertura MEDIDA em 02/09/2026: 4.042 dos 5.790.
    //
    // Este número corrige um erro meu, e o erro vale mais que o número. Eu
    // tinha medido 4.070 perguntando "quantos postos têm alguma UGRHI, direta
    // ou pelo município", e usei a resposta para uma pergunta diferente:
    // "quantos têm UGRHI de nível 1 DETERMINÁVEL". A diferença de 28 é exata e
    // tem nome: são os postos cujo município aponta para a sub-UGRHI sentinela
    // `9999 FORA DO E.DE S.PAULO (DOMINIO FEDERAL)`, cujo pai seria a UGRHI 99,
    // que não existe e não deve existir. As UGRHIs são as 22 unidades de São
    // Paulo, e posto fora do estado não tem uma.
    const soma = f.ugrhis.reduce((acc, u) => acc + u.total, 0);
    expect(soma).toBe(4042);
  });

  it('a sentinela de fora do estado não vira faceta de UGRHI', async () => {
    // Se o 99 aparecer aqui, a tela ofereceria "UGRHI 99" como se fosse uma
    // unidade de gestão. O caso existe porque a derivação do pai é aritmética
    // (`Codigo / 100`) e aritmética não sabe distinguir código de sentinela.
    const f = await facetas();
    expect(f.ugrhis.map((u) => u.numero)).not.toContain('99');
  });

  it('nenhum rótulo vem vazio, nulo ou com espaço em volta', async () => {
    const f = await facetas();
    const rotulos = [
      ...f.municipios.map((m) => m.nome),
      ...f.bacias.map((b) => b.nome),
      ...f.mantenedores.map((m) => m.nome),
      ...f.ugrhis.map((u) => u.nome),
      ...f.tiposPosto.map((t) => t.codigo),
    ];
    for (const r of rotulos) {
      expect(r).toBeTruthy();
      expect(r).toBe(r.trim());
    }
  });

  it('cada faceta oferecida devolve resultado na busca, com o total que promete', async () => {
    // Este é o caso que prova que a lista e a busca falam do mesmo cadastro.
    // Uma amostra de cada dimensão basta: o defeito que ele pega (faceta
    // montada por um caminho, filtro aplicado por outro) atinge a dimensão
    // inteira, não um valor isolado.
    const f = await facetas();
    const { postosRepository } = await import(
      '@/infrastructure/db/postos-repository.mssql'
    );

    const ugrhi = f.ugrhis[0]!;
    const porUgrhi = await postosRepository.pesquisar({
      ugrhiNumero: ugrhi.numero,
      pagina: 1,
      porPagina: 1,
    });
    expect(porUgrhi.total).toBe(ugrhi.total);

    const municipio = f.municipios[0]!;
    const porMunicipio = await postosRepository.pesquisar({
      municipio: municipio.nome,
      pagina: 1,
      porPagina: 1,
    });
    expect(porMunicipio.total).toBe(municipio.total);

    const tipo = f.tiposPosto[0]!;
    const porTipo = await postosRepository.pesquisar({
      tipoPosto: tipo.codigo,
      pagina: 1,
      porPagina: 1,
    });
    expect(porTipo.total).toBe(tipo.total);

    const mantenedor = f.mantenedores[0]!;
    const porMantenedor = await postosRepository.pesquisar({
      mantenedor: mantenedor.nome,
      pagina: 1,
      porPagina: 1,
    });
    expect(porMantenedor.total).toBe(mantenedor.total);

    const bacia = f.bacias[0]!;
    const porBacia = await postosRepository.pesquisar({
      baciaHidrografica: bacia.nome,
      pagina: 1,
      porPagina: 1,
    });
    expect(porBacia.total).toBe(bacia.total);
  });
});
