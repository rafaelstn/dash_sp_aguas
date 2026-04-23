import 'server-only';

import type { Posto } from '@/domain/posto';
import type { ArquivoIndexado } from '@/domain/arquivo-indexado';
import type { ArquivoDesconforme } from '@/domain/desconformidade';
import type { RevisaoDesconformidade } from '@/domain/revisao-desconformidade';
import type { TipoDocumento } from '@/domain/tipo-documento';
import type { TipoDado } from '@/domain/tipo-dado';
import { TIPOS_DOCUMENTO } from '@/domain/tipo-documento';
import { TIPOS_DADO } from '@/domain/tipo-dado';

/**
 * Fixtures em memória para MODO DEMO.
 *
 * Os postos são copiados literalmente do CSV oficial
 * `data/Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-18-03-26a-csv.csv`.
 * Dois registros propositalmente desconformes foram adicionados para permitir
 * que a aba "Desconformidades cadastrais" apresente dados em modo demo:
 *   - `B6-007A`  → prefixo com letra-dígito invertidos (suspeita_troca_letra_digito)
 *   - `FLU001?`  → placeholder de interrogação (placeholder_interrogacao)
 *
 * Nenhum dado sensível está presente: a base é pública SPÁguas.
 */

const AGORA = new Date('2026-04-22T10:00:00Z');

/**
 * Helper para reduzir repetição: preenche campos ausentes com defaults
 * coerentes com o contrato do domínio (todos opcionais exceto prefixo).
 */
function posto(p: Partial<Posto> & { id: string; prefixo: string }): Posto {
  return {
    mantenedor: null,
    prefixoAna: null,
    nomeEstacao: null,
    operacaoInicioAno: null,
    operacaoFimAno: null,
    latitude: null,
    longitude: null,
    municipio: null,
    municipioAlt: null,
    baciaHidrografica: null,
    ugrhiNome: null,
    ugrhiNumero: null,
    subUgrhiNome: null,
    subUgrhiNumero: null,
    rede: null,
    proprietario: 'SPÁguas',
    tipoPosto: null,
    areaKm2: null,
    btl: null,
    ciaAmbiental: null,
    cobacia: null,
    observacoes: null,
    tempoTransmissao: null,
    statusPcd: null,
    ultimaTransmissao: null,
    convencional: null,
    loggerEqp: null,
    telemetrico: null,
    nivel: null,
    vazao: null,
    fichaInspecao: null,
    ultimaDataFi: null,
    fichaDescritiva: null,
    ultimaAtualizacaoFd: null,
    aquifero: null,
    altimetria: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...p,
  };
}

// --------------------------------------------------------------------------
// Postos — 12 registros: 4 FLU + 4 PLU + 2 PIEZO + 1 desconforme troca letra/dígito
// + 1 placeholder com interrogação
// --------------------------------------------------------------------------

export const POSTOS_FIXTURES: Posto[] = [
  // 4 Fluviometria (prefixo [0-9][A-Z]-[0-9]{3}) — conformes
  posto({
    id: 'fx-posto-01',
    prefixo: '1D-008',
    nomeEstacao: 'CRUZEIRO',
    operacaoInicioAno: 1971,
    operacaoFimAno: 2000,
    latitude: -22.58333333,
    longitude: -45.14,
    municipio: 'CRUZEIRO',
    municipioAlt: 'Piquete',
    baciaHidrografica: 'R. PARAÍBA DO SUL',
    ugrhiNome: 'Paraíba do Sul',
    ugrhiNumero: '2',
    subUgrhiNome: 'Baixo Vale Paulista',
    subUgrhiNumero: '2_4',
    tipoPosto: 'FLU',
    areaKm2: 12075,
    btl: '3° BPAmb',
    ciaAmbiental: '3400',
    cobacia: '7789544',
    observacoes: 'REGISTRADOR MECÂNICO',
  }),
  posto({
    id: 'fx-posto-02',
    prefixo: '1E-001',
    nomeEstacao: 'FAZENDA DO CUME',
    operacaoInicioAno: 1958,
    operacaoFimAno: 1972,
    latitude: -23.06666667,
    longitude: -45.08,
    municipio: 'CUNHA',
    municipioAlt: 'Cunha',
    baciaHidrografica: 'R. JACUÍ',
    ugrhiNome: 'Paraíba do Sul',
    ugrhiNumero: '2',
    subUgrhiNome: 'Alto Paraíba',
    subUgrhiNumero: '2_1',
    tipoPosto: 'FLU',
    areaKm2: 93,
    btl: '3° BPAmb',
    ciaAmbiental: '3400',
    cobacia: '7789961',
  }),
  posto({
    id: 'fx-posto-03',
    prefixo: '2D-006',
    mantenedor: 'FCTH',
    prefixoAna: '58206000',
    nomeEstacao: 'BAIRRO RIO COMPRIDO',
    operacaoInicioAno: 1972,
    operacaoFimAno: 1981,
    latitude: -22.79027778,
    longitude: -45.21222222,
    municipio: 'GUARATINGUETÁ',
    municipioAlt: 'Guaratingueta',
    baciaHidrografica: 'R. PARAÍBA DO SUL',
    ugrhiNome: 'Paraíba do Sul',
    ugrhiNumero: '2',
    subUgrhiNome: 'Baixo Vale Paulista',
    subUgrhiNumero: '2_4',
    tipoPosto: 'FLU',
    areaKm2: 10696,
    btl: '3° BPAmb',
    ciaAmbiental: '3400',
    cobacia: '7789556',
    observacoes:
      'LOGGER (FCTH) / TELEMETRIA CHIP CELULAR / SAISP - FOI REGISTRADOR MECÂNICO - SEM OBSERVADOR - ESTAÇÃO MISTA D2-088',
    statusPcd: 'ATIVO',
    convencional: 'O',
  }),
  posto({
    id: 'fx-posto-04',
    prefixo: '2D-013',
    mantenedor: 'FCTH',
    prefixoAna: '58218200',
    nomeEstacao: 'CACHOEIRA PAULISTA',
    operacaoInicioAno: 1955,
    operacaoFimAno: 2022,
    latitude: -22.66166667,
    longitude: -45.0125,
    municipio: 'CACHOEIRA PAULISTA',
    municipioAlt: 'Cachoeira Paulista',
    baciaHidrografica: 'R. PARAÍBA DO SUL',
    ugrhiNome: 'Paraíba do Sul',
    ugrhiNumero: '2',
    subUgrhiNome: 'Baixo Vale Paulista',
    subUgrhiNumero: '2_4',
    tipoPosto: 'FLU',
    areaKm2: 11411,
    btl: '3° BPAmb',
    ciaAmbiental: '3400',
    cobacia: '77895531',
    observacoes:
      'LOGGER (FCTH) / TELEMETRIA CHIP CELULAR / SAISP - FOI REGISTRADOR MECÂNICO',
    statusPcd: 'ATIVO',
    convencional: 'O',
    loggerEqp: 'L',
    telemetrico: 'T',
  }),

  // 4 Pluviometria (prefixo [A-Z][0-9]-[0-9]{3}) — conformes
  posto({
    id: 'fx-posto-05',
    prefixo: 'A6-001',
    nomeEstacao: 'RIOLÂNDIA',
    operacaoInicioAno: 1958,
    operacaoFimAno: 2000,
    latitude: -19.96666667,
    longitude: -49.82,
    municipio: 'RIOLÂNDIA',
    municipioAlt: 'Riolandia',
    baciaHidrografica: 'R. GRANDE',
    ugrhiNome: 'Turvo/Grande',
    ugrhiNumero: '15',
    subUgrhiNome: 'Bonito/Patos/Mandioca',
    subUgrhiNumero: '15_8',
    tipoPosto: 'PLU',
    btl: '4° BPAmb',
    ciaAmbiental: '4200',
    cobacia: '868313',
  }),
  posto({
    id: 'fx-posto-06',
    prefixo: 'A7-001',
    nomeEstacao: 'POPULINA',
    operacaoInicioAno: 1959,
    operacaoFimAno: 2001,
    latitude: -19.93333333,
    longitude: -50.64,
    municipio: 'POPULINA',
    municipioAlt: 'Mesopolis',
    baciaHidrografica: 'R. GRANDE',
    ugrhiNome: 'Turvo/Grande',
    ugrhiNumero: '15',
    subUgrhiNome: 'Cascavel/Cã-cã',
    subUgrhiNumero: '15_12',
    tipoPosto: 'PLU',
    btl: '4° BPAmb',
    ciaAmbiental: '4200',
    cobacia: '868131',
  }),
  posto({
    id: 'fx-posto-07',
    prefixo: 'A7-002',
    nomeEstacao: 'INDIAPORÃ',
    operacaoInicioAno: 1959,
    operacaoFimAno: 2001,
    latitude: -19.98333333,
    longitude: -50.3,
    municipio: 'INDIAPORÃ',
    municipioAlt: 'Indiapora',
    baciaHidrografica: 'R. GRANDE',
    ugrhiNome: 'Turvo/Grande',
    ugrhiNumero: '15',
    subUgrhiNome: 'Água Vermelha/ Pádua Diniz',
    subUgrhiNumero: '15_10',
    tipoPosto: 'PLU',
    btl: '4° BPAmb',
    ciaAmbiental: '4200',
    cobacia: '8681552',
  }),
  posto({
    id: 'fx-posto-08',
    prefixo: 'B4-001',
    prefixoAna: '2047017',
    nomeEstacao: 'FRANCA',
    operacaoInicioAno: 1935,
    operacaoFimAno: 2025,
    latitude: -20.50666667,
    longitude: -47.48083333,
    municipio: 'FRANCA',
    municipioAlt: 'Franca',
    baciaHidrografica: 'RIB. DOS BAGRES',
    ugrhiNome: 'Sapucaí/Grande',
    ugrhiNumero: '8',
    subUgrhiNome: 'Sapucaí',
    subUgrhiNumero: '8_1',
    tipoPosto: 'PLU',
    btl: '4° BPAmb',
    ciaAmbiental: '4300',
    cobacia: '8686183',
    statusPcd: 'ATIVO',
    convencional: 'O',
  }),

  // 2 Piezometria (prefixo [0-9][A-Z]-[0-9]{3}[A-Z]) — conformes
  posto({
    id: 'fx-posto-09',
    prefixo: '4C-500Z',
    mantenedor: 'FCTH',
    nomeEstacao: 'FAZENDA SÃO JOSÉ',
    operacaoInicioAno: 2009,
    operacaoFimAno: 2025,
    latitude: -21.9075,
    longitude: -47.705,
    municipio: 'DESCALVADO',
    municipioAlt: 'Descalvado',
    baciaHidrografica: 'R. BONITO',
    ugrhiNome: 'Mogi-Guaçu',
    ugrhiNumero: '9',
    subUgrhiNumero: '9_3',
    tipoPosto: 'PIEZO',
    btl: '4° BPAmb',
    ciaAmbiental: '4400',
    cobacia: '8684583',
    observacoes:
      'LEITURAS NÃO DIÁRIAS - PARALISADAS EM 2023 - LOGGER (SOLINST)',
    statusPcd: 'ATIVO',
    convencional: 'C',
    loggerEqp: 'L',
    aquifero: 'Guarani',
    altimetria: 666.789,
  }),
  posto({
    id: 'fx-posto-10',
    prefixo: '4C-501Z',
    mantenedor: 'FCTH',
    nomeEstacao: 'FAZENDA OURO VERDE',
    operacaoInicioAno: 2008,
    operacaoFimAno: 2025,
    latitude: -21.64333333,
    longitude: -47.73583333,
    municipio: 'SANTA RITA DO PASSA QUATRO',
    municipioAlt: 'Luis Antonio',
    baciaHidrografica: 'CÓRR. PAULICÉIA',
    ugrhiNome: 'Mogi-Guaçu',
    ugrhiNumero: '9',
    subUgrhiNumero: '9_3',
    tipoPosto: 'PIEZO',
    btl: '4° BPAmb',
    ciaAmbiental: '4400',
    cobacia: '8684557',
    observacoes: 'LOGGER (SOLINST) - SEM OBSERVADOR',
    statusPcd: 'ATIVO',
    convencional: 'C',
    loggerEqp: 'L',
    aquifero: 'Guarani',
    altimetria: 682.462,
  }),

  // 1 prefixo desconforme — letra-dígito invertidos no primeiro par (tipo fluvio)
  posto({
    id: 'fx-posto-11',
    prefixo: 'B6-007A',
    nomeEstacao: 'AMOSTRA DESCONFORME — PREFIXO COM SUFIXO A',
    municipio: 'EXEMPLO SP',
    tipoPosto: 'FLU',
    observacoes:
      'Registro sintético para validar a aba de desconformidades em modo demo.',
  }),

  // 1 prefixo placeholder com interrogação
  posto({
    id: 'fx-posto-12',
    prefixo: 'FLU001?',
    nomeEstacao: 'PLACEHOLDER — PREFIXO INDEFINIDO',
    municipio: 'EXEMPLO SP',
    tipoPosto: 'FLU',
    observacoes:
      'Registro sintético com interrogação no prefixo — usado para demonstrar a classe placeholder_interrogacao.',
  }),
];

// --------------------------------------------------------------------------
// Arquivos indexados — 10 arquivos ligados aos postos 2D-006, 2D-013 e 4C-500Z
// Cobre os 3 formatos (COMPLETO, PARCIAL, LEGADO) e vários códigos de documento.
// --------------------------------------------------------------------------

function arquivo(p: ArquivoIndexado): ArquivoIndexado {
  return p;
}

export const ARQUIVOS_FIXTURES: ArquivoIndexado[] = [
  arquivo({
    id: 'fx-arq-01',
    prefixo: '2D-006',
    nomeArquivo: '2D-006 01 JLT 2024 11 12.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\2D-006\\2D-006 01 JLT 2024 11 12.pdf',
    tamanhoBytes: 184_320,
    dataModificacao: new Date('2024-11-12T14:00:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Fluviometria',
    codTipoDocumento: 1,
    codEncarregado: 'JLT',
    dataDocumento: new Date('2024-11-12T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'COMPLETO',
  }),
  arquivo({
    id: 'fx-arq-02',
    prefixo: '2D-006',
    nomeArquivo: '2D-006 03 MAS 2024 06 02.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\2D-006\\2D-006 03 MAS 2024 06 02.pdf',
    tamanhoBytes: 256_000,
    dataModificacao: new Date('2024-06-02T10:00:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Fluviometria',
    codTipoDocumento: 3,
    codEncarregado: 'MAS',
    dataDocumento: new Date('2024-06-02T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'COMPLETO',
  }),
  arquivo({
    id: 'fx-arq-03',
    prefixo: '2D-006',
    nomeArquivo: '2D-006 07 2023 08 15.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\2D-006\\2D-006 07 2023 08 15.pdf',
    tamanhoBytes: 112_450,
    dataModificacao: new Date('2023-08-15T16:30:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Fluviometria',
    codTipoDocumento: 7,
    codEncarregado: null,
    dataDocumento: new Date('2023-08-15T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'PARCIAL',
  }),
  arquivo({
    id: 'fx-arq-04',
    prefixo: '2D-006',
    nomeArquivo: '2D-006 2019 03 22.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\2D-006\\2D-006 2019 03 22.pdf',
    tamanhoBytes: 88_100,
    dataModificacao: new Date('2019-03-22T12:00:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Fluviometria',
    codTipoDocumento: null,
    codEncarregado: null,
    dataDocumento: new Date('2019-03-22T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'LEGADO',
  }),
  arquivo({
    id: 'fx-arq-05',
    prefixo: '2D-013',
    nomeArquivo: '2D-013 01 RFS 2025 02 10.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\2D-013\\2D-013 01 RFS 2025 02 10.pdf',
    tamanhoBytes: 204_800,
    dataModificacao: new Date('2025-02-10T09:00:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Fluviometria',
    codTipoDocumento: 1,
    codEncarregado: 'RFS',
    dataDocumento: new Date('2025-02-10T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'COMPLETO',
  }),
  arquivo({
    id: 'fx-arq-06',
    prefixo: '2D-013',
    nomeArquivo: '2D-013 04 CAM 2024 09 30 (anexo_tabela).pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\2D-013\\2D-013 04 CAM 2024 09 30 (anexo_tabela).pdf',
    tamanhoBytes: 342_100,
    dataModificacao: new Date('2024-09-30T18:00:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Fluviometria',
    codTipoDocumento: 4,
    codEncarregado: 'CAM',
    dataDocumento: new Date('2024-09-30T00:00:00Z'),
    parteOpcional: 'anexo_tabela',
    nomeValido: true,
    formatoNome: 'COMPLETO',
  }),
  arquivo({
    id: 'fx-arq-07',
    prefixo: '2D-013',
    nomeArquivo: '2D-013 05 2022 11 04.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\2D-013\\2D-013 05 2022 11 04.pdf',
    tamanhoBytes: 178_200,
    dataModificacao: new Date('2022-11-04T11:00:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Fluviometria',
    codTipoDocumento: 5,
    codEncarregado: null,
    dataDocumento: new Date('2022-11-04T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'PARCIAL',
  }),
  arquivo({
    id: 'fx-arq-08',
    prefixo: '2D-013',
    nomeArquivo: '2D-013 06 LOB 2023 05 19.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\2D-013\\2D-013 06 LOB 2023 05 19.pdf',
    tamanhoBytes: 120_000,
    dataModificacao: new Date('2023-05-19T13:30:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Fluviometria',
    codTipoDocumento: 6,
    codEncarregado: 'LOB',
    dataDocumento: new Date('2023-05-19T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'COMPLETO',
  }),
  arquivo({
    id: 'fx-arq-09',
    prefixo: '4C-500Z',
    nomeArquivo: '4C-500Z 02 PST 2024 12 20.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Piezometria\\4C-500Z\\4C-500Z 02 PST 2024 12 20.pdf',
    tamanhoBytes: 156_700,
    dataModificacao: new Date('2024-12-20T08:00:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Piezometria',
    codTipoDocumento: 2,
    codEncarregado: 'PST',
    dataDocumento: new Date('2024-12-20T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'COMPLETO',
  }),
  arquivo({
    id: 'fx-arq-10',
    prefixo: '4C-500Z',
    nomeArquivo: '4C-500Z 2017 05 08.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Piezometria\\4C-500Z\\4C-500Z 2017 05 08.pdf',
    tamanhoBytes: 61_500,
    dataModificacao: new Date('2017-05-08T17:00:00Z'),
    hashConteudo: null,
    indexadoEm: AGORA,
    loteIndexacao: 'demo-lote-01',
    tipoDado: 'Piezometria',
    codTipoDocumento: null,
    codEncarregado: null,
    dataDocumento: new Date('2017-05-08T00:00:00Z'),
    parteOpcional: null,
    nomeValido: true,
    formatoNome: 'LEGADO',
  }),
];

// --------------------------------------------------------------------------
// Arquivos órfãos e malformados
// --------------------------------------------------------------------------

export const ARQUIVOS_ORFAOS_FIXTURES: ArquivoDesconforme[] = [
  {
    id: 'fx-orfao-01',
    nomeArquivo: '9Z-999 01 JLT 2024 07 01.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\9Z-999\\9Z-999 01 JLT 2024 07 01.pdf',
    tamanhoBytes: 145_000,
    dataModificacao: new Date('2024-07-01T10:00:00Z'),
    categoria: 'PREFIXO_DESCONHECIDO',
    tipoDado: 'Fluviometria',
    statusRevisao: 'pendente',
  },
  {
    id: 'fx-orfao-02',
    nomeArquivo: 'Z1-123 03 MAS 2023 02 14.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Pluviometria\\Z1-123\\Z1-123 03 MAS 2023 02 14.pdf',
    tamanhoBytes: 98_250,
    dataModificacao: new Date('2023-02-14T09:00:00Z'),
    categoria: 'PREFIXO_DESCONHECIDO',
    tipoDado: 'Pluviometria',
    statusRevisao: 'pendente',
  },
  {
    id: 'fx-malform-01',
    nomeArquivo: 'relatorio_final.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Fluviometria\\_nao_classificados\\relatorio_final.pdf',
    tamanhoBytes: 223_400,
    dataModificacao: new Date('2024-03-05T14:00:00Z'),
    categoria: 'NOME_FORA_DO_PADRAO',
    tipoDado: 'Fluviometria',
    statusRevisao: 'pendente',
  },
  {
    id: 'fx-malform-02',
    nomeArquivo: 'inspecao 2022 outubro.pdf',
    caminhoAbsoluto:
      '\\\\servidor\\postos\\Piezometria\\_nao_classificados\\inspecao 2022 outubro.pdf',
    tamanhoBytes: 187_900,
    dataModificacao: new Date('2022-10-18T11:00:00Z'),
    categoria: 'NOME_FORA_DO_PADRAO',
    tipoDado: 'Piezometria',
    statusRevisao: 'pendente',
  },
];

// --------------------------------------------------------------------------
// Revisões pré-marcadas para demonstrar o estado "revisado" na UI.
// A chave usada é `id_entidade`, que na implementação .pg é o `prefixo` do
// posto (para prefixo principal/ANA) ou `caminho_absoluto` (para arquivo).
// --------------------------------------------------------------------------

export const REVISOES_FIXTURES: RevisaoDesconformidade[] = [
  {
    id: 'fx-rev-01',
    tipoEntidade: 'arquivo',
    idEntidade:
      '\\\\servidor\\postos\\Fluviometria\\_nao_classificados\\relatorio_final.pdf',
    categoria: 'ARQUIVO_MALFORMADO',
    status: 'revisado',
    nota: 'Renomeação programada para o próximo lote.',
    ip: '10.0.0.42',
    usuarioId: null,
    revisadoEm: new Date('2026-04-21T15:30:00Z'),
    createdAt: new Date('2026-04-21T15:30:00Z'),
  },
];

// --------------------------------------------------------------------------
// Seeds — 7 tipos de documento e 5 tipos de dado (conforme migrations 0008/0009)
// --------------------------------------------------------------------------

export const TIPOS_DOCUMENTO_FIXTURES: TipoDocumento[] = Object.values(
  TIPOS_DOCUMENTO,
);

export const TIPOS_DADO_FIXTURES: TipoDado[] = Object.values(TIPOS_DADO);
