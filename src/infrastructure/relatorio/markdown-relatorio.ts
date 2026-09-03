import type { Posto } from '@/domain/posto';

/**
 * Monta o markdown do relatório oficial de um posto hidrológico a partir da
 * entidade de domínio. Texto em PT-BR formal (cliente governo). Campos sem
 * valor aparecem como "Não informado" para não deixar lacuna na ficha oficial.
 */

function valor(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return 'Não informado';
  const s = String(v).trim();
  return s === '' ? 'Não informado' : s;
}

function periodo(inicio: string | null, fim: string | null): string {
  if (!inicio && !fim) return 'Não informado';
  return `${valor(inicio)} a ${valor(fim)}`;
}

function linhaTabela(campo: string, conteudo: string): string {
  // Escapa pipe pra não quebrar a tabela markdown.
  return `| ${campo} | ${conteudo.replace(/\|/g, '\\|')} |`;
}

export function montarMarkdownRelatorioPosto(
  posto: Posto,
  geradoEm: Date = new Date(),
): string {
  const dataBr = geradoEm.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const coords =
    posto.latitude !== null && posto.longitude !== null
      ? `${posto.latitude}, ${posto.longitude}`
      : 'Não informado';

  const identificacao = [
    linhaTabela('Prefixo', valor(posto.prefixo)),
    linhaTabela('Prefixo ANA', valor(posto.prefixoAna)),
    linhaTabela('Nome da estação', valor(posto.nomeEstacao)),
    linhaTabela('Tipo de posto', valor(posto.tipoPosto)),
    linhaTabela('Mantenedor', valor(posto.mantenedor)),
    linhaTabela('Proprietário', valor(posto.proprietario)),
  ].join('\n');

  const localizacao = [
    linhaTabela('Município', valor(posto.municipio)),
    linhaTabela('Coordenadas (lat, lon)', coords),
    linhaTabela('Altimetria (m)', valor(posto.altimetria)),
    linhaTabela('Bacia hidrográfica', valor(posto.baciaHidrografica)),
    linhaTabela('UGRHI', `${valor(posto.ugrhiNumero)} ${valor(posto.ugrhiNome)}`.trim()),
    linhaTabela('Sub-UGRHI', `${valor(posto.subUgrhiNumero)} ${valor(posto.subUgrhiNome)}`.trim()),
    linhaTabela('Área de drenagem (km²)', valor(posto.areaKm2)),
    linhaTabela('Aquífero', valor(posto.aquifero)),
  ].join('\n');

  // `Status PCD` e `Última transmissão` saíram em 03/09/2026: eram ESTADO da
  // telemetria, e o `Dbfch` cadastra EQUIPAMENTO, não estado. As duas linhas
  // que ficam vêm do vínculo de aparelho ativo e são preenchidas de verdade.
  const operacao = [
    linhaTabela('Início de operação', valor(posto.operacaoInicioAno)),
    linhaTabela('Fim de operação', valor(posto.operacaoFimAno)),
    linhaTabela('Telemétrico', valor(posto.telemetrico)),
    linhaTabela('Convencional', valor(posto.convencional)),
  ].join('\n');

  const medicoesAna = [
    linhaTabela('Escala', periodo(posto.anaEscalaInicio, posto.anaEscalaFim)),
    linhaTabela(
      'Descarga líquida',
      periodo(posto.anaDescargaLiquidaInicio, posto.anaDescargaLiquidaFim),
    ),
    linhaTabela('Sedimentos', periodo(posto.anaSedimentosInicio, posto.anaSedimentosFim)),
    linhaTabela('Qualidade', periodo(posto.anaQualidadeInicio, posto.anaQualidadeFim)),
    linhaTabela('Pluviômetro', periodo(posto.anaPluviometroInicio, posto.anaPluviometroFim)),
    linhaTabela('Telemetria', periodo(posto.anaTelemetriaInicio, posto.anaTelemetriaFim)),
  ].join('\n');

  return `# Relatório do posto ${valor(posto.prefixo)}

Governo do Estado de São Paulo. SP Águas - DMO.

Documento gerado em ${dataBr}.

## Identificação

| Campo | Valor |
| --- | --- |
${identificacao}

## Localização

| Campo | Valor |
| --- | --- |
${localizacao}

## Operação

| Campo | Valor |
| --- | --- |
${operacao}

## Períodos de medição (inventário ANA)

| Medição | Período |
| --- | --- |
${medicoesAna}
`;
}
