/**
 * Rótulo de cada campo do cadastro de posto, em português, numa fonte única.
 *
 * Nasceu em 23/09/2026 com o achado 2 do QA da tela Postos: o histórico de
 * alterações (`HistoricoPostoEventos`) imprimia a chave crua do JSON do audit
 * trail, então o técnico do órgão lia "nomeEstacao: — → Rio Piracicaba" em vez
 * de "Nome da estação". Nome de coluna em tela é texto para o programador se
 * achar, não para o usuário (regra 7 do padrão de UI da casa).
 *
 * Por que aqui e não dentro do componente: os mesmos rótulos já existiam
 * embutidos no JSX do `FormularioEditarPosto`. Duas listas escritas à mão
 * divergem, e a segunda a nascer é a que envelhece calada, então o formulário
 * passou a consumir este mapa e o histórico usa o MESMO texto que o usuário vê
 * ao editar.
 *
 * O que entra aqui:
 *
 *   1. todo campo de `CamposEditaveisPosto` (`application/ports`), que é o
 *      conjunto exato de chaves que o repositório grava em `valores_antes` e
 *      `valores_depois` (ver `extrairCamposAuditados`). A guarda em
 *      `tests/unit/lib/rotulos-posto-catalogo.test.ts` lê aquele tipo por AST e
 *      reprova campo do catálogo que chegar aqui sem rótulo, e também rótulo
 *      daqui que não corresponda a campo nenhum;
 *   2. os 12 campos que SAÍRAM do cadastro em 03/09/2026 (ver o docblock de
 *      `domain/posto.ts`). O audit trail é imutável por desenho de LGPD, então
 *      evento gravado antes daquela data continua carregando `rede`, `btl` e os
 *      outros, e o histórico precisa saber ler o passado. Remover rótulo daqui
 *      porque "o campo não existe mais" faria o evento antigo voltar a mostrar
 *      nome cru.
 */

/**
 * Campos vivos do cadastro. O texto é o mesmo que o formulário de edição
 * mostra, com unidade e adorno, para que o histórico e a tela de edição não
 * chamem a mesma coisa por dois nomes.
 */
export const ROTULOS_CAMPO_POSTO = {
  // Identificação
  nomeEstacao: 'Nome da estação',
  prefixoAna: 'Código ANA (prefixo_ana)',
  mantenedor: 'Mantenedor',
  tipoPosto: 'Tipo de posto',
  proprietario: 'Proprietário',
  aquifero: 'Aquífero',

  // Localização
  latitude: 'Latitude',
  longitude: 'Longitude',
  altimetria: 'Altimetria (m)',
  municipio: 'Município',
  municipioAlt: 'Município (alternativo)',
  baciaHidrografica: 'Bacia hidrográfica',
  ugrhiNome: 'UGRHI nome',
  ugrhiNumero: 'UGRHI número',
  subUgrhiNome: 'Sub-UGRHI nome',
  subUgrhiNumero: 'Sub-UGRHI número',
  areaKm2: 'Área de drenagem (km²)',

  // Operação
  operacaoInicioAno: 'Ano início de operação',
  operacaoFimAno: 'Ano fim de operação',

  // Instrumentação derivada de AparelhoPostos x Aparelhos
  convencional: 'Equipamento convencional',
  loggerEqp: 'Datalogger',
  telemetrico: 'Telemétrico',
  nivel: 'Medição de nível',
  vazao: 'Medição de vazão',

  // Datas de medição ANA (Meta I.6 PROGESTÃO)
  anaEscalaInicio: 'Escala (início)',
  anaEscalaFim: 'Escala (fim)',
  anaDescargaLiquidaInicio: 'Descarga líquida (início)',
  anaDescargaLiquidaFim: 'Descarga líquida (fim)',
  anaSedimentosInicio: 'Sedimentos (início)',
  anaSedimentosFim: 'Sedimentos (fim)',
  anaQualidadeInicio: 'Qualidade da água (início)',
  anaQualidadeFim: 'Qualidade da água (fim)',
  anaPluviometroInicio: 'Pluviômetro (início)',
  anaPluviometroFim: 'Pluviômetro (fim)',
  anaTelemetriaInicio: 'Telemetria (início)',
  anaTelemetriaFim: 'Telemetria (fim)',
} as const satisfies Record<string, string>;

/**
 * Campos que o cadastro teve até 03/09/2026 e o órgão não tem origem para
 * preencher. Só o histórico os alcança, e só em evento antigo: o formulário
 * não os oferece e o repositório não os grava mais.
 */
export const ROTULOS_CAMPO_POSTO_EXTINTO: Readonly<Record<string, string>> = {
  rede: 'Rede (campo extinto em 03/09/2026)',
  btl: 'Batalhão (campo extinto em 03/09/2026)',
  ciaAmbiental: 'Companhia ambiental (campo extinto em 03/09/2026)',
  cobacia: 'Cobacia (campo extinto em 03/09/2026)',
  observacoes: 'Observações (campo extinto em 03/09/2026)',
  tempoTransmissao: 'Tempo de transmissão (campo extinto em 03/09/2026)',
  statusPcd: 'Status da PCD (campo extinto em 03/09/2026)',
  ultimaTransmissao: 'Última transmissão (campo extinto em 03/09/2026)',
  fichaInspecao: 'Ficha de inspeção (campo extinto em 03/09/2026)',
  ultimaDataFi: 'Data da última ficha de inspeção (campo extinto em 03/09/2026)',
  fichaDescritiva: 'Ficha descritiva (campo extinto em 03/09/2026)',
  ultimaAtualizacaoFd: 'Atualização da ficha descritiva (campo extinto em 03/09/2026)',
};

/**
 * Chaves do mapa de campos vivos. O `as const satisfies` acima é o que torna
 * este tipo estreito: `ROTULOS_CAMPO_POSTO.nomeEstaca` (com erro de digitação)
 * reprova no `tsc` em vez de renderizar rótulo vazio na tela de edição. Foi por
 * isso que o mapa não é `Record<string, string>` solto.
 */
export type CampoPostoComRotulo = keyof typeof ROTULOS_CAMPO_POSTO;

/**
 * Rótulo para exibir em tela. Chave fora dos dois mapas volta como está, de
 * propósito: inventar um rótulo por heurística sobre nome que ninguém previu
 * escreveria texto errado com cara de oficial, e em cadastro público isso é
 * pior que o nome técnico à vista. O caso normal não chega aqui, porque a
 * guarda de catálogo reprova campo editável sem rótulo antes do merge.
 *
 * A chave é `string` e não `CampoPostoComRotulo` porque quem chama é o
 * histórico, lendo JSON gravado no banco: ali a chave é dado, não identificador
 * do código, e pode ser de campo que já saiu do cadastro.
 */
export function rotuloCampoPosto(chave: string): string {
  const vivos: Record<string, string> = ROTULOS_CAMPO_POSTO;
  return vivos[chave] ?? ROTULOS_CAMPO_POSTO_EXTINTO[chave] ?? chave;
}
