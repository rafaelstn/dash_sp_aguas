/**
 * Nomes das 22 UGRHIs do Estado de São Paulo.
 *
 * A API do mapa entrega só o número. O nome vem daqui, e é a MESMA lista que o
 * `scripts/geo/gerar-geometria-postos.mjs` grava em `public/geo/ugrhis-sp.json`;
 * o teste `tests/unit/components/postos-mapa-ugrhis.test.ts` reprova se as duas
 * divergirem. O GeoServer do SIBH traz dois nomes errados ("Mantiqueira" e
 * "Jundaí"), por isso nenhuma das duas cópias lê o nome de lá.
 */
export const NOMES_UGRHI: Readonly<Record<number, string>> = {
  1: 'Serra da Mantiqueira',
  2: 'Paraíba do Sul',
  3: 'Litoral Norte',
  4: 'Pardo',
  5: 'Piracicaba/Capivari/Jundiaí',
  6: 'Alto Tietê',
  7: 'Baixada Santista',
  8: 'Sapucaí/Grande',
  9: 'Mogi-Guaçu',
  10: 'Tietê/Sorocaba',
  11: 'Ribeira de Iguape e Litoral Sul',
  12: 'Baixo Pardo/Grande',
  13: 'Tietê/Jacaré',
  14: 'Alto Paranapanema',
  15: 'Turvo/Grande',
  16: 'Tietê/Batalha',
  17: 'Médio Paranapanema',
  18: 'São José dos Dourados',
  19: 'Baixo Tietê',
  20: 'Aguapeí',
  21: 'Peixe',
  22: 'Pontal do Paranapanema',
};

export const NUMEROS_UGRHI = Object.keys(NOMES_UGRHI).map(Number);

export function rotuloUgrhi(numero: number | null): string {
  if (numero === null) return 'Sem UGRHI';
  const nome = NOMES_UGRHI[numero];
  return nome ? `${numero} ${nome}` : `UGRHI ${numero}`;
}
