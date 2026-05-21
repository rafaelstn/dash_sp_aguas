import { z } from 'zod';
import type { CodigoTipoDocumento } from '../tipo-documento';
import { TIPOS_DOCUMENTO } from '../tipo-documento';

/**
 * Tipos primitivos de campo do formulário dinâmico. Cada `tipo` mapeia para
 * um widget no `FormularioFicha` e para uma validação Zod no backend.
 */
export type TipoCampo =
  | 'texto'
  | 'textarea'
  | 'numero'
  | 'select'
  | 'checkbox'
  | 'tabela';

/**
 * Coluna de um campo `tabela` (grade de linhas dinâmicas, ex.: verticais da
 * medição de vazão). Só os tipos simples fazem sentido numa célula.
 */
export interface ColunaTabela {
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'numero' | 'select';
  unidade?: string;
  opcoes?: Array<{ valor: string; rotulo: string }>;
  min?: number;
  max?: number;
}

/**
 * Formato de validação para campos `texto`. Aplica regex no Zod (app +
 * backend) e habilita máscara/placeholder no widget. Adicionar formato é
 * estender `REGRAS_FORMATO` abaixo, o restante segue automático.
 *   - coordenada_gms : graus/minutos/segundos, ex. `22°52'18"`
 *   - mes_ano        : período mensal `MM/AAAA`
 *   - data_br        : data `DD/MM/AAAA`
 *   - hora_hm        : horário `HH:MM`
 *   - hora_hms       : horário `HH:MM:SS`
 *   - telefone       : telefone BR `(XX) XXXXX-XXXX`
 *   - email          : endereço de e-mail
 *   - cpf            : CPF `XXX.XXX.XXX-XX` (valida dígito verificador)
 */
export type FormatoCampo =
  | 'coordenada_gms'
  | 'mes_ano'
  | 'data_br'
  | 'hora_hm'
  | 'hora_hms'
  | 'telefone'
  | 'email'
  | 'cpf';

/** Valida CPF pelos dois dígitos verificadores (rejeita os de dígitos iguais). */
export function cpfValido(bruto: string): boolean {
  const d = bruto.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: number): number => {
    let soma = 0;
    for (let i = 0; i < base - 1; i++) soma += Number(d[i]) * (base - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(10) === Number(d[9]) && dv(11) === Number(d[10]);
}

export interface CampoFicha {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  /** Texto auxiliar abaixo do label (ex.: unidade, exemplo). */
  ajuda?: string;
  /** Apenas para `select`. */
  opcoes?: Array<{ valor: string; rotulo: string }>;
  /** Sufixo visual ao lado do input (ex.: 'm', 'cm', 'V'). */
  unidade?: string;
  obrigatorio?: boolean;
  /** Min/max para `numero` — usados na validação Zod e no atributo HTML. */
  min?: number;
  max?: number;
  /** Formato de texto validado (regex no Zod + máscara/placeholder no UI). */
  formato?: FormatoCampo;
  /** Placeholder do input (sugestão de preenchimento). */
  placeholder?: string;
  /** Colunas, apenas para `tabela`. Cada linha é um objeto com estas chaves. */
  colunas?: ColunaTabela[];
  /** Rótulo de uma linha da `tabela` (ex.: "Vertical"). Default: "Linha". */
  rotuloLinha?: string;
}

/**
 * Regras de cada formato: regex de validação e mensagem pt-BR exibida tanto
 * no submit client-side quanto na resposta do backend. A mensagem viaja no
 * `issue.message` do Zod, então é a fonte única de verdade.
 */
export const REGRAS_FORMATO: Record<
  FormatoCampo,
  {
    regex: RegExp;
    mensagem: string;
    placeholder: string;
    /** Validação extra além do regex (ex.: dígito verificador de CPF). */
    validar?: (v: string) => boolean;
  }
> = {
  // Aceita `22°52'18"`, `22° 52' 18"` ou `22°52'18.5"`, com hemisfério
  // opcional (N/S/L/O/E/W). Tolerante a espaços; rejeita lixo.
  coordenada_gms: {
    regex: /^\s*\d{1,3}\s*°\s*\d{1,2}\s*'\s*\d{1,2}(?:[.,]\d+)?\s*"?\s*[NSLOEWnsloew]?\s*$/,
    mensagem: 'Use graus, minutos e segundos. Ex.: 22°52\'18".',
    placeholder: '22°52\'18"',
  },
  // Período mensal MM/AAAA (01 a 12 / ano de 4 dígitos).
  mes_ano: {
    regex: /^(0[1-9]|1[0-2])\/\d{4}$/,
    mensagem: 'Use o formato MM/AAAA. Ex.: 04/2014.',
    placeholder: 'MM/AAAA',
  },
  // Data DD/MM/AAAA (dia 01 a 31, mês 01 a 12, ano de 4 dígitos).
  data_br: {
    regex: /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/,
    mensagem: 'Use o formato DD/MM/AAAA. Ex.: 19/12/2025.',
    placeholder: 'DD/MM/AAAA',
  },
  // Horário HH:MM (24h).
  hora_hm: {
    regex: /^([01]\d|2[0-3]):[0-5]\d$/,
    mensagem: 'Use o formato HH:MM. Ex.: 11:30.',
    placeholder: 'HH:MM',
  },
  // Horário HH:MM:SS (24h).
  hora_hms: {
    regex: /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
    mensagem: 'Use o formato HH:MM:SS. Ex.: 13:28:11.',
    placeholder: 'HH:MM:SS',
  },
  // Telefone BR com DDD: fixo (8 dígitos) ou celular (9 dígitos).
  telefone: {
    regex: /^\(\d{2}\) \d{4,5}-\d{4}$/,
    mensagem: 'Use o formato (XX) XXXXX-XXXX.',
    placeholder: '(11) 91234-5678',
  },
  // E-mail simples: local@dominio.tld.
  email: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    mensagem: 'Informe um e-mail válido. Ex.: nome@dominio.gov.br.',
    placeholder: 'nome@dominio.gov.br',
  },
  // CPF formatado, com validação de dígito verificador.
  cpf: {
    regex: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
    mensagem: 'Informe um CPF válido. Ex.: 123.456.789-09.',
    placeholder: '000.000.000-00',
    validar: cpfValido,
  },
};

export interface SecaoFicha {
  titulo: string;
  campos: CampoFicha[];
  /**
   * Condição de visibilidade. A seção só aparece (e seus dados só são
   * enviados) quando `dados[campo]` estiver em `em`. Sem `quando`, a seção
   * é sempre visível. Usado para variantes (ex.: inspeção fluviométrica vs
   * pluviométrica no tipo 3).
   */
  quando?: { campo: string; em: string[] };
}

/** Decide se uma seção condicional deve aparecer dado o estado atual. */
export function secaoVisivel(
  secao: SecaoFicha,
  dados: Record<string, unknown>,
): boolean {
  if (!secao.quando) return true;
  const valor = dados[secao.quando.campo];
  return typeof valor === 'string' && secao.quando.em.includes(valor);
}

export interface SchemaFicha {
  /** Código do tipo (FK pra `tipos_documento`). */
  codigo: CodigoTipoDocumento;
  /** Rótulo legível — vem do TIPOS_DOCUMENTO. */
  rotulo: string;
  /** Habilitado pra criação? Tipos sem schema ainda ficam desabilitados. */
  disponivel: boolean;
  /** Seções do formulário. Renderizadas em ordem. */
  secoes: SecaoFicha[];
}

// ─────────────────────────────────────────────────────────────────────────
// Escalas de constatação reutilizadas pelas fichas (Bom/Regular/Ruim e os
// pares binários da Inspeção Fluviométrica). Definidas antes dos schemas
// porque `const` não tem hoisting de valor.
// ─────────────────────────────────────────────────────────────────────────

const ESCALA_BRR = [
  { valor: 'bom', rotulo: 'Bom' },
  { valor: 'regular', rotulo: 'Regular' },
  { valor: 'ruim', rotulo: 'Ruim' },
];

const ESCALA_BOM_RUIM = [
  { valor: 'bom', rotulo: 'Bom' },
  { valor: 'ruim', rotulo: 'Ruim' },
];

const ESCALA_CERTO_ERRADO = [
  { valor: 'certo', rotulo: 'Certo' },
  { valor: 'errado', rotulo: 'Errado' },
];

const ESCALA_SIM_NAO = [
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'nao', rotulo: 'Não' },
];

const ESCALA_SEM_COM = [
  { valor: 'sem', rotulo: 'Sem' },
  { valor: 'com', rotulo: 'Com' },
];

// ─────────────────────────────────────────────────────────────────────────
// Inspeção (código 3): espelha as fichas DAEE-CTH "INSPEÇÃO FLUVIOMÉTRICA"
// e "INSPEÇÃO PLUVIOMÉTRICA". Variantes do mesmo tipo, escolhidas pelo campo
// `tipo_inspecao`: as seções marcadas com `quando` só aparecem na variante
// correspondente. Cada item tem uma constatação; a coluna "Serviço" da ficha
// de papel é capturada de forma agregada em "Informes gerais".
// Posto/rio/município identificam; o prefixo vem da rota. Data/técnico vêm
// do cabeçalho do formulário.
// ─────────────────────────────────────────────────────────────────────────

const QUANDO_FLUVIO = { campo: 'tipo_inspecao', em: ['fluviometrica'] };
const QUANDO_PLUVIO = { campo: 'tipo_inspecao', em: ['pluviometrica'] };

const SCHEMA_INSPECAO: SchemaFicha = {
  codigo: 3,
  rotulo: TIPOS_DOCUMENTO[3].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Identificação',
      campos: [
        {
          chave: 'tipo_inspecao',
          rotulo: 'Tipo de inspeção',
          tipo: 'select',
          obrigatorio: true,
          opcoes: [
            { valor: 'fluviometrica', rotulo: 'Fluviométrica' },
            { valor: 'pluviometrica', rotulo: 'Pluviométrica' },
          ],
        },
        { chave: 'municipio', rotulo: 'Município', tipo: 'texto' },
        { chave: 'nome_posto', rotulo: 'Nome do posto', tipo: 'texto' },
        { chave: 'rio', rotulo: 'Rio', tipo: 'texto' },
      ],
    },
    {
      titulo: 'Escalas',
      quando: QUANDO_FLUVIO,
      campos: [
        { chave: 'escala_leitura_m', rotulo: 'Leitura', tipo: 'numero', unidade: 'm' },
        { chave: 'escala_leitura_hora', rotulo: 'Hora da leitura', tipo: 'texto', formato: 'hora_hm' },
        { chave: 'escala_acesso', rotulo: 'Acesso', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'escala_estabilidade', rotulo: 'Estabilidade', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'escala_prumo', rotulo: 'Prumo', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'escala_pintura', rotulo: 'Pintura', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'escala_limpeza', rotulo: 'Limpeza', tipo: 'select', opcoes: ESCALA_BRR },
        {
          chave: 'escala_cotas',
          rotulo: 'Cotas',
          tipo: 'select',
          opcoes: [
            { valor: 'iguais', rotulo: 'Iguais' },
            { valor: 'corrigidas', rotulo: 'Corrigidas' },
          ],
        },
        {
          chave: 'escala_amplitudes',
          rotulo: 'Amplitudes',
          tipo: 'select',
          opcoes: [
            { valor: 'iguais', rotulo: 'Iguais' },
            { valor: 'alteradas', rotulo: 'Alteradas' },
          ],
        },
        { chave: 'escala_empecilhos', rotulo: 'Empecilhos', tipo: 'select', opcoes: ESCALA_SIM_NAO },
      ],
    },
    {
      titulo: 'Controle e RRNN',
      quando: QUANDO_FLUVIO,
      campos: [
        { chave: 'controle_leit_escala_antes', rotulo: 'Leit. escala (antes)', tipo: 'numero', unidade: 'm' },
        { chave: 'controle_leit_escala_depois', rotulo: 'Leit. escala (depois)', tipo: 'numero', unidade: 'm' },
        { chave: 'controle_nivelamento', rotulo: 'Nivelamento', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'rn1_cota_m', rotulo: 'RN 1', tipo: 'numero', unidade: 'm' },
        { chave: 'rn2_cota_m', rotulo: 'RN 2', tipo: 'numero', unidade: 'm' },
      ],
    },
    {
      titulo: 'Seção de medição',
      quando: QUANDO_FLUVIO,
      campos: [
        { chave: 'medicoes_realizadas', rotulo: 'Medições', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        {
          chave: 'margens',
          rotulo: 'Margens',
          tipo: 'select',
          opcoes: [
            { valor: 'limpas', rotulo: 'Limpas' },
            { valor: 'sujas', rotulo: 'Sujas' },
          ],
        },
        {
          chave: 'leito',
          rotulo: 'Leito',
          tipo: 'select',
          opcoes: [
            { valor: 'natural', rotulo: 'Natural' },
            { valor: 'alterado', rotulo: 'Alterado' },
          ],
        },
        {
          chave: 'instalacoes_fixas',
          rotulo: 'Instalações fixas',
          tipo: 'select',
          opcoes: [
            { valor: 'boas', rotulo: 'Boas' },
            { valor: 'ruins', rotulo: 'Ruins' },
          ],
        },
        { chave: 'local_distancia_m', rotulo: 'Local (distância das escalas)', tipo: 'numero', unidade: 'm' },
        {
          chave: 'local_posicao',
          rotulo: 'Local (posição)',
          tipo: 'select',
          opcoes: [
            { valor: 'montante', rotulo: 'A montante das escalas' },
            { valor: 'jusante', rotulo: 'A jusante das escalas' },
          ],
        },
        { chave: 'esconsidade', rotulo: 'Esconsidade', tipo: 'select', opcoes: ESCALA_SIM_NAO },
      ],
    },
    {
      titulo: 'Limnígrafo',
      quando: QUANDO_FLUVIO,
      campos: [
        { chave: 'limn_leit_escala_m', rotulo: 'Leit. escala', tipo: 'numero', unidade: 'm' },
        { chave: 'limn_leit_grafico_m', rotulo: 'Leit. gráfico', tipo: 'numero', unidade: 'm' },
        { chave: 'limn_hora_certa', rotulo: 'Hora certa', tipo: 'texto', formato: 'hora_hm' },
        { chave: 'limn_hora_grafico', rotulo: 'Hora gráfico', tipo: 'texto', formato: 'hora_hm' },
        { chave: 'limn_relojoaria', rotulo: 'Relojoaria', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'limn_pena', rotulo: 'Pena', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'limn_boia', rotulo: 'Bóia', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'limn_tomada_dagua', rotulo: 'Tomada d’água', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'limn_cadeado', rotulo: 'Cadeado', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'limn_estado_geral', rotulo: 'Estado geral', tipo: 'select', opcoes: ESCALA_BRR },
      ],
    },
    {
      titulo: 'Gráfico',
      quando: QUANDO_FLUVIO,
      campos: [
        {
          chave: 'grafico_coerencia',
          rotulo: 'Coerência observador / gráfico',
          tipo: 'select',
          opcoes: [
            { valor: 'coerente', rotulo: 'Coerente' },
            { valor: 'incoerente', rotulo: 'Incoerente' },
          ],
        },
        { chave: 'grafico_periodo_inicio', rotulo: 'Período verificado (início)', tipo: 'texto', formato: 'data_br' },
        { chave: 'grafico_periodo_fim', rotulo: 'Período verificado (fim)', tipo: 'texto', formato: 'data_br' },
      ],
    },
    {
      titulo: 'Caderneta fluviométrica',
      quando: QUANDO_FLUVIO,
      campos: [
        { chave: 'cad_uso_3_vias', rotulo: 'Uso das 3 vias', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cad_cabecalho', rotulo: 'Cabeçalho', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cad_rodape', rotulo: 'Rodapé', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cad_sequencia_meses', rotulo: 'Sequência dos meses', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cad_ultimo_dia_mes', rotulo: 'Último dia do mês', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cad_legibilidade', rotulo: 'Legibilidade', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cad_rasuras', rotulo: 'Rasuras', tipo: 'select', opcoes: ESCALA_SEM_COM },
        { chave: 'cad_ponto_virgula', rotulo: 'Ponto ou vírgula', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cad_arredondamentos', rotulo: 'Arredondamentos', tipo: 'select', opcoes: ESCALA_SEM_COM },
        {
          chave: 'cad_coerencia_leituras',
          rotulo: 'Coerência das leituras',
          tipo: 'select',
          opcoes: [
            { valor: 'boa', rotulo: 'Boa' },
            { valor: 'duvidosa', rotulo: 'Duvidosa' },
          ],
        },
        { chave: 'cad_dia_sem_anotacao', rotulo: 'Dia sem anotação', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'cad_envelopes', rotulo: 'Envelopes', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'cad_periodo_inicio', rotulo: 'Período verificado (início)', tipo: 'texto', formato: 'data_br' },
        { chave: 'cad_periodo_fim', rotulo: 'Período verificado (fim)', tipo: 'texto', formato: 'data_br' },
        { chave: 'cad_visto', rotulo: 'Visto', tipo: 'checkbox' },
      ],
    },
    {
      titulo: 'Pluviômetro',
      quando: QUANDO_PLUVIO,
      campos: [
        { chave: 'pluv_nivelamento', rotulo: 'Nivelamento', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'pluv_altura_m', rotulo: 'Altura', tipo: 'numero', unidade: 'm' },
        { chave: 'pluv_agua_aparelho', rotulo: 'Água no aparelho', tipo: 'select', opcoes: ESCALA_SEM_COM },
        { chave: 'pluv_obstrucao', rotulo: 'Obstrução', tipo: 'select', opcoes: ESCALA_SEM_COM },
        { chave: 'pluv_vazamento', rotulo: 'Vazamento', tipo: 'select', opcoes: ESCALA_SEM_COM },
        { chave: 'pluv_torneira', rotulo: 'Torneira', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'pluv_corpo_funil', rotulo: 'Corpo / funil', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'pluv_limpeza', rotulo: 'Limpeza', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'pluv_suporte', rotulo: 'Suporte', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'pluv_provetas', rotulo: 'Provetas', tipo: 'select', opcoes: ESCALA_BRR },
      ],
    },
    {
      titulo: 'Cercado',
      quando: QUANDO_PLUVIO,
      campos: [
        { chave: 'cerc_exposicao', rotulo: 'Exposição', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'cerc_acesso', rotulo: 'Acesso', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'cerc_madeiramento', rotulo: 'Madeiramento', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cerc_tela', rotulo: 'Tela', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cerc_pintura', rotulo: 'Pintura', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cerc_portao', rotulo: 'Portão', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cerc_cadeado', rotulo: 'Cadeado', tipo: 'select', opcoes: ESCALA_BRR },
        {
          chave: 'cerc_piso',
          rotulo: 'Piso',
          tipo: 'select',
          opcoes: [
            { valor: 'limpo', rotulo: 'Limpo' },
            { valor: 'sujo', rotulo: 'Sujo' },
          ],
        },
        { chave: 'cerc_limpeza', rotulo: 'Limpeza', tipo: 'select', opcoes: ESCALA_BRR },
      ],
    },
    {
      titulo: 'Pluviógrafo',
      quando: QUANDO_PLUVIO,
      campos: [
        { chave: 'pluvg_nivelamento', rotulo: 'Nivelamento', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'pluvg_altura_m', rotulo: 'Altura', tipo: 'numero', unidade: 'm' },
        { chave: 'pluvg_obstrucao', rotulo: 'Obstrução', tipo: 'select', opcoes: ESCALA_SEM_COM },
        { chave: 'pluvg_hora_certa', rotulo: 'Hora certa', tipo: 'texto', formato: 'hora_hm' },
        { chave: 'pluvg_hora_grafico', rotulo: 'Hora gráfico', tipo: 'texto', formato: 'hora_hm' },
        { chave: 'pluvg_relojoaria', rotulo: 'Relojoaria', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'pluvg_haste_boia', rotulo: 'Haste / bóia', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'pluvg_pena', rotulo: 'Pena', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'pluvg_sifao', rotulo: 'Sifão', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        { chave: 'pluvg_tintas', rotulo: 'Tintas', tipo: 'select', opcoes: ESCALA_BOM_RUIM },
        {
          chave: 'pluvg_tirantes',
          rotulo: 'Tirantes',
          tipo: 'select',
          opcoes: [
            { valor: 'bons', rotulo: 'Bons' },
            { valor: 'frouxos', rotulo: 'Frouxos' },
          ],
        },
        { chave: 'pluvg_carcaca', rotulo: 'Carcaça', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'pluvg_proveta', rotulo: 'Proveta', tipo: 'select', opcoes: ESCALA_BRR },
      ],
    },
    {
      titulo: 'Caderneta pluviométrica',
      quando: QUANDO_PLUVIO,
      campos: [
        { chave: 'cadp_carbonos', rotulo: 'Carbonos', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cadp_uso_3_vias', rotulo: 'Uso das 3 vias', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cadp_cabecalho', rotulo: 'Cabeçalho', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cadp_rodape', rotulo: 'Rodapé', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cadp_sequencia_meses', rotulo: 'Sequência dos meses', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cadp_ultimo_dia_mes', rotulo: 'Último dia do mês', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cadp_legibilidade', rotulo: 'Legibilidade', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cadp_rasuras', rotulo: 'Rasuras', tipo: 'select', opcoes: ESCALA_SEM_COM },
        { chave: 'cadp_ponto_virgula', rotulo: 'Ponto ou vírgula', tipo: 'select', opcoes: ESCALA_CERTO_ERRADO },
        { chave: 'cadp_arredondamentos', rotulo: 'Arredondamentos', tipo: 'select', opcoes: ESCALA_SEM_COM },
        {
          chave: 'cadp_coerencia_leituras',
          rotulo: 'Coerência das leituras',
          tipo: 'select',
          opcoes: [
            { valor: 'boa', rotulo: 'Boa' },
            { valor: 'duvidosa', rotulo: 'Duvidosa' },
          ],
        },
        { chave: 'cadp_dia_sem_anotacao', rotulo: 'Dia sem anotação', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'cadp_granizo', rotulo: 'Granizo', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'cadp_geada', rotulo: 'Geada', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'cadp_envelopes', rotulo: 'Envelopes', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'cadp_periodo_inicio', rotulo: 'Período verificado (início)', tipo: 'texto', formato: 'data_br' },
        { chave: 'cadp_periodo_fim', rotulo: 'Período verificado (fim)', tipo: 'texto', formato: 'data_br' },
        { chave: 'cadp_visto', rotulo: 'Visto', tipo: 'checkbox' },
      ],
    },
    {
      titulo: 'Observador',
      campos: [
        { chave: 'observador_nome', rotulo: 'Nome', tipo: 'texto' },
        { chave: 'observador_instruido', rotulo: 'Instruído', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'observador_presente', rotulo: 'Presente', tipo: 'select', opcoes: ESCALA_SIM_NAO },
      ],
    },
    {
      titulo: 'Informes gerais e inspeção',
      campos: [
        {
          chave: 'informes_gerais',
          rotulo: 'Informes gerais',
          tipo: 'textarea',
          ajuda: 'Detalhamento dos itens marcados como "detalhar em INFORMES" e serviços executados.',
        },
        { chave: 'inspecionado_por', rotulo: 'Inspecionado por', tipo: 'texto' },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Schemas dos demais tipos. Campos representam o essencial conforme prática
// hidrométrica do SPÁguas/FCTH — afinar com o cliente quando o app for
// homologado em campo. Adicionar/remover campos é editar este arquivo:
// o form, a validação Zod e o detalhe seguem automaticamente.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Ficha Descritiva (código 1): espelha o formulário oficial DAEE-CTH
// "POSTO FLUVIOMÉTRICO · FICHA DESCRITIVA" (MOD. F 3/80, folha 1/4).
// As folhas 2/4 a 4/4 (croqui, seção, complementos) entram quando o cliente
// enviar os modelos. Variantes pluviométrica e piezométrica reaproveitam
// estas seções com poucos ajustes, diferenciadas por `tipo_estacao`.
// ─────────────────────────────────────────────────────────────────────────

const SCHEMA_FICHA_DESCRITIVA: SchemaFicha = {
  codigo: 1,
  rotulo: TIPOS_DOCUMENTO[1].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Identificação do posto',
      campos: [
        {
          chave: 'tipo_estacao',
          rotulo: 'Tipo de estação',
          tipo: 'select',
          obrigatorio: true,
          opcoes: [
            { valor: 'fluviometrica', rotulo: 'Fluviométrica' },
            { valor: 'pluviometrica', rotulo: 'Pluviométrica' },
            { valor: 'piezometrica', rotulo: 'Piezométrica' },
          ],
        },
        {
          chave: 'rio',
          rotulo: 'Rio',
          tipo: 'texto',
          obrigatorio: true,
        },
        {
          chave: 'posto_nome',
          rotulo: 'Posto',
          tipo: 'texto',
          obrigatorio: true,
        },
        {
          chave: 'zona_hidrografica',
          rotulo: 'Zona hidrográfica',
          tipo: 'texto',
        },
        {
          chave: 'municipio',
          rotulo: 'Município',
          tipo: 'texto',
          ajuda: 'Município e UF (ex.: Extrema - MG).',
        },
        {
          chave: 'local',
          rotulo: 'Local',
          tipo: 'texto',
        },
        {
          chave: 'bacia',
          rotulo: 'Bacia',
          tipo: 'texto',
          ajuda: 'Bacia / sub-bacia (ex.: Jaguari / Piracicaba / Tietê).',
        },
        {
          chave: 'area_drenagem_km2',
          rotulo: 'Área de drenagem',
          tipo: 'numero',
          unidade: 'km²',
          min: 0,
        },
        {
          chave: 'latitude',
          rotulo: 'Latitude (S)',
          tipo: 'texto',
          formato: 'coordenada_gms',
        },
        {
          chave: 'longitude',
          rotulo: 'Longitude (W)',
          tipo: 'texto',
          formato: 'coordenada_gms',
        },
        {
          chave: 'carta_50k_nome',
          rotulo: 'Carta 1:50.000 (de)',
          tipo: 'texto',
        },
        {
          chave: 'carta_50k_numero',
          rotulo: 'Carta 1:50.000 (nº)',
          tipo: 'texto',
        },
      ],
    },
    {
      titulo: 'Localização e acesso',
      campos: [
        {
          chave: 'localizacao',
          rotulo: 'Localização',
          tipo: 'textarea',
          ajuda: 'Margem, referências e distâncias (ex.: margem direita, a 50 m da ponte).',
        },
        {
          chave: 'roteiro_acesso',
          rotulo: 'Roteiro de acesso',
          tipo: 'textarea',
          ajuda: 'Como chegar à estação (rodovias, km, sentido, entradas).',
        },
      ],
    },
    {
      titulo: 'Referências de nível',
      campos: [
        {
          chave: 'rn1_cota_m',
          rotulo: 'RN 1',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'rn1_altitude_m',
          rotulo: 'Altitude do RN 1',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'rn1_entidade',
          rotulo: 'Entidade',
          tipo: 'texto',
          ajuda: 'Entidade responsável pela RN (ex.: DAEE).',
        },
        {
          chave: 'rn2_cota_m',
          rotulo: 'RN 2',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'zero_escala_m',
          rotulo: 'Zero da escala',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'transbordamento_escala_m',
          rotulo: 'Transbordamento na escala',
          tipo: 'numero',
          unidade: 'm',
        },
      ],
    },
    {
      titulo: 'Escalas limnimétricas',
      campos: [
        {
          chave: 'escalas_instaladas_por',
          rotulo: 'Instaladas por',
          tipo: 'texto',
        },
        {
          chave: 'numero_lances',
          rotulo: 'Número de lances',
          tipo: 'numero',
          min: 0,
          max: 20,
        },
        {
          chave: 'observacao_inicio',
          rotulo: 'Período de observação (início)',
          tipo: 'texto',
          formato: 'mes_ano',
        },
        {
          chave: 'observacao_fim',
          rotulo: 'Período de observação (fim)',
          tipo: 'texto',
          formato: 'mes_ano',
          ajuda: 'Deixe em branco se o posto continua em operação.',
        },
      ],
    },
    {
      // A ficha pré-impressa prevê até 4 lances (numeração de–até + comprimento).
      // Modelados como campos fixos: o nº de lances reais é pequeno e estável,
      // não justifica um widget de tabela dinâmica neste momento.
      titulo: 'Lances da escala',
      campos: [
        { chave: 'lance1_de_m', rotulo: '1º lance: de', tipo: 'numero', unidade: 'm' },
        { chave: 'lance1_ate_m', rotulo: '1º lance: até', tipo: 'numero', unidade: 'm' },
        { chave: 'lance1_comprimento_m', rotulo: '1º lance: comprimento', tipo: 'numero', unidade: 'm', min: 0 },
        { chave: 'lance2_de_m', rotulo: '2º lance: de', tipo: 'numero', unidade: 'm' },
        { chave: 'lance2_ate_m', rotulo: '2º lance: até', tipo: 'numero', unidade: 'm' },
        { chave: 'lance2_comprimento_m', rotulo: '2º lance: comprimento', tipo: 'numero', unidade: 'm', min: 0 },
        { chave: 'lance3_de_m', rotulo: '3º lance: de', tipo: 'numero', unidade: 'm' },
        { chave: 'lance3_ate_m', rotulo: '3º lance: até', tipo: 'numero', unidade: 'm' },
        { chave: 'lance3_comprimento_m', rotulo: '3º lance: comprimento', tipo: 'numero', unidade: 'm', min: 0 },
        { chave: 'lance4_de_m', rotulo: '4º lance: de', tipo: 'numero', unidade: 'm' },
        { chave: 'lance4_ate_m', rotulo: '4º lance: até', tipo: 'numero', unidade: 'm' },
        { chave: 'lance4_comprimento_m', rotulo: '4º lance: comprimento', tipo: 'numero', unidade: 'm', min: 0 },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// PCD (código 2): espelha a "FICHA DE INSPEÇÃO DE POSTO DE COLETA DE DADOS
// (PCD)" DAEE/CTH (Rede Hidrológica Básica). Ficha separada da Inspeção
// (tipo 3): compartilha o posto/prefixo, mas tem linha própria.
// Data, hora e técnico da visita vêm do cabeçalho do formulário; o prefixo
// vem da rota do posto. As condições visuais e os sensores usam a mesma
// escala Bom/Regular/Ruim.
// ─────────────────────────────────────────────────────────────────────────

const SERVICOS_SENSOR = [
  { valor: 'limpeza', rotulo: 'Limpeza' },
  { valor: 'reparo', rotulo: 'Reparo' },
  { valor: 'substituicao', rotulo: 'Substituição' },
];

/** Gera o par condição + serviço de um sensor da tabela de sensores. */
function camposSensor(chave: string, rotulo: string): CampoFicha[] {
  return [
    {
      chave: `sensor_${chave}_condicao`,
      rotulo: `${rotulo}: condição`,
      tipo: 'select',
      opcoes: ESCALA_BRR,
    },
    {
      chave: `sensor_${chave}_servico`,
      rotulo: `${rotulo}: serviço realizado`,
      tipo: 'select',
      opcoes: SERVICOS_SENSOR,
    },
  ];
}

const SCHEMA_PCD: SchemaFicha = {
  codigo: 2,
  rotulo: TIPOS_DOCUMENTO[2].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Identificação',
      campos: [
        { chave: 'municipio', rotulo: 'Município', tipo: 'texto' },
        { chave: 'nome_posto', rotulo: 'Nome do posto', tipo: 'texto' },
        { chave: 'rio_acude', rotulo: 'Nome do rio / açude', tipo: 'texto' },
        { chave: 'medicao_pluviometro', rotulo: 'Medição: pluviômetro', tipo: 'checkbox' },
        { chave: 'medicao_fluviometro', rotulo: 'Medição: fluviômetro', tipo: 'checkbox' },
        { chave: 'medicao_piezometro', rotulo: 'Medição: piezômetro', tipo: 'checkbox' },
        {
          chave: 'tipo_pcd',
          rotulo: 'Tipo de PCD',
          tipo: 'select',
          opcoes: [
            { valor: 'fcth', rotulo: 'FCTH' },
            { valor: 'campbell', rotulo: 'Campbell' },
            { valor: 'solinst', rotulo: 'Solinst' },
            { valor: 'agweather', rotulo: 'Agweather' },
            { valor: 'hobo', rotulo: 'HOBO' },
            { valor: 'hobeco', rotulo: 'HOBECO' },
            { valor: 'outros', rotulo: 'Outros' },
          ],
        },
        {
          chave: 'tipo_pcd_outros',
          rotulo: 'Tipo de PCD (outros)',
          tipo: 'texto',
          ajuda: 'Preencher quando o tipo for "Outros".',
        },
        {
          chave: 'identificacao_remota',
          rotulo: 'Identificação da remota',
          tipo: 'texto',
          ajuda: 'Nº de patrimônio / #ID / nº de série.',
        },
        { chave: 'equipe', rotulo: 'Equipe', tipo: 'texto' },
        { chave: 'responsavel', rotulo: 'Responsável', tipo: 'texto' },
        {
          chave: 'responsavel_cel',
          rotulo: 'Celular do responsável',
          tipo: 'texto',
          formato: 'telefone',
        },
        {
          chave: 'responsavel_email',
          rotulo: 'E-mail do responsável',
          tipo: 'texto',
          formato: 'email',
        },
      ],
    },
    {
      titulo: 'Condições visuais do posto',
      campos: [
        { chave: 'cond_limpeza_posto', rotulo: 'Limpeza do posto (cercado)', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cond_abrigo_gabinete', rotulo: 'Condição do abrigo / gabinete', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cond_suporte_pcd', rotulo: 'Condição do suporte (PCD)', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cond_passagem_fluv', rotulo: 'Condição da passagem (fluviométrico)', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cond_suporte_pluv', rotulo: 'Condição do suporte (pluviômetro)', tipo: 'select', opcoes: ESCALA_BRR },
        { chave: 'cond_exposicao_pluviometro', rotulo: 'Exposição do pluviômetro', tipo: 'select', opcoes: ESCALA_BRR },
      ],
    },
    {
      titulo: 'PCD encontrada',
      campos: [
        {
          chave: 'pcd_status',
          rotulo: 'Situação da PCD',
          tipo: 'select',
          opcoes: [
            { valor: 'registrando_transmitindo', rotulo: 'Registrando e transmitindo' },
            { valor: 'somente_registrando', rotulo: 'Somente registrando' },
            { valor: 'parada', rotulo: 'Parada' },
          ],
        },
        { chave: 'logger_data', rotulo: 'Data do logger', tipo: 'texto', formato: 'data_br' },
        { chave: 'logger_hora', rotulo: 'Hora do logger', tipo: 'texto', formato: 'hora_hms' },
        { chave: 'pluviometro_acumulado_mm', rotulo: 'Pluviômetro acumulado', tipo: 'numero', unidade: 'mm', min: 0 },
        { chave: 'levellogger_m', rotulo: 'Levellogger', tipo: 'numero', unidade: 'm' },
        { chave: 'barologger_kpa', rotulo: 'Barologger', tipo: 'numero', unidade: 'kPa' },
        { chave: 'level_compensado_m', rotulo: 'Level compensado', tipo: 'numero', unidade: 'm' },
        { chave: 'nivel_regua_m', rotulo: 'Nível da régua', tipo: 'numero', unidade: 'm' },
        { chave: 'nivel_sensor_m', rotulo: 'Nível do sensor', tipo: 'numero', unidade: 'm' },
        { chave: 'offset_m', rotulo: 'Off set', tipo: 'numero', unidade: 'm' },
        { chave: 'piezometro_trena_m', rotulo: 'Piezômetro (trena)', tipo: 'numero', unidade: 'm' },
        { chave: 'altitude_boca_poco_m', rotulo: 'Altitude da boca do poço (GPS)', tipo: 'numero', unidade: 'm' },
        { chave: 'altitude_rn1_m', rotulo: 'Altitude RN1 (GPS)', tipo: 'numero', unidade: 'm' },
        { chave: 'tensao_bateria_12v_v', rotulo: 'Tensão da bateria 12V', tipo: 'numero', unidade: 'V' },
        { chave: 'tensao_painel_solar_v', rotulo: 'Tensão do painel solar', tipo: 'numero', unidade: 'V', ajuda: 'Medir com o painel solar desconectado.' },
      ],
    },
    {
      titulo: 'Registro e coleta',
      campos: [
        {
          chave: 'registro_numero',
          rotulo: 'Registro nº',
          tipo: 'texto',
          ajuda: 'Leitura remota / FCTH.',
        },
        { chave: 'pasta', rotulo: 'Pasta', tipo: 'texto' },
        {
          chave: 'coleta_dados',
          rotulo: 'Coleta de dados (todas as PCDs)',
          tipo: 'select',
          opcoes: [
            { valor: 'sim', rotulo: 'Sim' },
            { valor: 'nao', rotulo: 'Não' },
          ],
        },
        { chave: 'arquivo', rotulo: 'Arquivo', tipo: 'texto' },
        { chave: 'id_pcd', rotulo: '#ID', tipo: 'texto' },
      ],
    },
    {
      titulo: 'Sensores',
      campos: [
        ...camposSensor('remota_datalogger', 'Remota / datalogger'),
        ...camposSensor('modem_gprs', 'Modem GPRS'),
        ...camposSensor('antena', 'Antena'),
        ...camposSensor('painel_solar', 'Painel solar'),
        ...camposSensor('pluviometro', 'Pluviômetro'),
        ...camposSensor('sensor_pressao', 'Sensor de pressão'),
        ...camposSensor('ultrassonico', 'Ultrassônico'),
        ...camposSensor('barometro', 'Barômetro'),
        ...camposSensor('bateria', 'Bateria'),
      ],
    },
  ],
};

const SCHEMA_NIVELAMENTO: SchemaFicha = {
  codigo: 4,
  rotulo: TIPOS_DOCUMENTO[4].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Levantamento das RNs',
      campos: [
        {
          chave: 'metodo',
          rotulo: 'Método utilizado',
          tipo: 'select',
          opcoes: [
            { valor: 'geometrico', rotulo: 'Nivelamento geométrico' },
            { valor: 'trigonometrico', rotulo: 'Nivelamento trigonométrico' },
            { valor: 'gnss_rtk', rotulo: 'GNSS RTK' },
          ],
        },
        {
          chave: 'rn_padrao',
          rotulo: 'RN padrão de referência',
          tipo: 'texto',
          ajuda: 'Identificação da RN principal (ex.: RN 00).',
        },
        {
          chave: 'cota_rn00_m',
          rotulo: 'Cota da RN 00',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'cota_rn01_m',
          rotulo: 'Cota da RN 01',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'cota_rn02_m',
          rotulo: 'Cota da RN 02',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'cota_rn03_m',
          rotulo: 'Cota da RN 03',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'cota_rn04_m',
          rotulo: 'Cota da RN 04',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'erro_fechamento_mm',
          rotulo: 'Erro de fechamento',
          tipo: 'numero',
          unidade: 'mm',
        },
      ],
    },
    {
      titulo: 'Réguas',
      campos: [
        {
          chave: 'zero_regua_m',
          rotulo: 'Zero da régua',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'cota_regua_lance_inicial_cm',
          rotulo: 'Cota régua — lance inicial',
          tipo: 'numero',
          unidade: 'cm',
        },
        {
          chave: 'cota_regua_lance_final_cm',
          rotulo: 'Cota régua — lance final',
          tipo: 'numero',
          unidade: 'cm',
        },
        {
          chave: 'reguas_substituidas',
          rotulo: 'Réguas substituídas nesta visita',
          tipo: 'checkbox',
        },
      ],
    },
  ],
};

const SCHEMA_LEV_SECAO: SchemaFicha = {
  codigo: 5,
  rotulo: TIPOS_DOCUMENTO[5].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Seção transversal',
      campos: [
        {
          chave: 'metodo_levantamento',
          rotulo: 'Método de levantamento',
          tipo: 'select',
          opcoes: [
            { valor: 'topografico', rotulo: 'Topográfico' },
            { valor: 'batimetrico', rotulo: 'Batimétrico' },
            { valor: 'misto', rotulo: 'Topográfico + batimétrico' },
          ],
        },
        {
          chave: 'largura_total_m',
          rotulo: 'Largura total',
          tipo: 'numero',
          unidade: 'm',
          min: 0,
        },
        {
          chave: 'profundidade_maxima_m',
          rotulo: 'Profundidade máxima',
          tipo: 'numero',
          unidade: 'm',
          min: 0,
        },
        {
          chave: 'numero_verticais',
          rotulo: 'Número de verticais',
          tipo: 'numero',
          min: 0,
        },
        {
          chave: 'cota_referencia_m',
          rotulo: 'Cota de referência',
          tipo: 'numero',
          unidade: 'm',
        },
      ],
    },
    {
      titulo: 'Margens',
      campos: [
        {
          chave: 'observacoes_margem_esquerda',
          rotulo: 'Observações — margem esquerda',
          tipo: 'textarea',
        },
        {
          chave: 'observacoes_margem_direita',
          rotulo: 'Observações — margem direita',
          tipo: 'textarea',
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Troca de Observador (código 6): espelha a ficha DAEE-CTH "TROCA DE
// OBSERVADOR". Dados do novo observador (atual), gratificação/conta bancária
// e o nome do ex-observador. Posto/prefixo vêm da rota; data e técnico
// (hidrometrista) vêm do cabeçalho do formulário.
// ─────────────────────────────────────────────────────────────────────────

const SCHEMA_TROCA_OBSERVADOR: SchemaFicha = {
  codigo: 6,
  rotulo: TIPOS_DOCUMENTO[6].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Novo observador',
      campos: [
        { chave: 'novo_nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
        { chave: 'novo_rg', rotulo: 'RG', tipo: 'texto' },
        { chave: 'novo_cpf', rotulo: 'CPF', tipo: 'texto', formato: 'cpf' },
        { chave: 'novo_profissao', rotulo: 'Profissão', tipo: 'texto' },
        { chave: 'novo_data_nascimento', rotulo: 'Data de nascimento', tipo: 'texto', formato: 'data_br' },
        { chave: 'novo_grau_instrucao', rotulo: 'Grau de instrução', tipo: 'texto' },
        { chave: 'novo_end_residencial', rotulo: 'Endereço residencial', tipo: 'textarea' },
        { chave: 'novo_distancia_resid_posto_m', rotulo: 'Distância residência/posto', tipo: 'numero', unidade: 'm', min: 0 },
        { chave: 'novo_cidade', rotulo: 'Cidade', tipo: 'texto' },
        { chave: 'novo_end_postal', rotulo: 'Endereço postal', tipo: 'texto' },
        { chave: 'novo_telefone', rotulo: 'Telefone', tipo: 'texto', formato: 'telefone' },
        { chave: 'novo_celular', rotulo: 'Celular', tipo: 'texto', formato: 'telefone' },
        { chave: 'novo_inicio_leituras', rotulo: 'Início real das leituras', tipo: 'texto', formato: 'data_br' },
      ],
    },
    {
      titulo: 'Gratificação',
      campos: [
        { chave: 'gratificar', rotulo: 'Gratificar', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'gratificar_a_partir', rotulo: 'A partir de', tipo: 'texto', formato: 'data_br' },
        { chave: 'agencia', rotulo: 'Agência', tipo: 'texto' },
        { chave: 'conta', rotulo: 'Conta', tipo: 'texto' },
        { chave: 'conta_conjunta', rotulo: 'Conta conjunta', tipo: 'select', opcoes: ESCALA_SIM_NAO },
      ],
    },
    {
      titulo: 'Ex-observador e encerramento',
      campos: [
        { chave: 'ex_observador_nome', rotulo: 'Nome do ex-observador', tipo: 'texto' },
        { chave: 'data_troca', rotulo: 'Data da troca', tipo: 'texto', formato: 'data_br' },
        {
          chave: 'observacoes_troca',
          rotulo: 'Observações',
          tipo: 'textarea',
          ajuda: 'Notas adicionais (ex.: era observador reserva).',
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Medição de Vazão (código 7): espelha a ficha "MEDIÇÃO DE VAZÃO" (molinete),
// cobrindo as versões FCTH e F 6/93 do formulário. A tabela de verticais é
// um campo `tabela` de linhas dinâmicas. Os resultados (vazão, área...) são
// entrada manual; cálculo automático a partir das verticais fica como futuro.
// ─────────────────────────────────────────────────────────────────────────

const SCHEMA_VAZAO: SchemaFicha = {
  codigo: 7,
  rotulo: TIPOS_DOCUMENTO[7].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Identificação',
      campos: [
        { chave: 'nome_posto', rotulo: 'Nome do posto', tipo: 'texto' },
        { chave: 'zona', rotulo: 'Zona', tipo: 'texto' },
        { chave: 'rio', rotulo: 'Rio', tipo: 'texto' },
        { chave: 'medicao_realizada', rotulo: 'Medição', tipo: 'select', opcoes: ESCALA_SIM_NAO },
        { chave: 'helice', rotulo: 'Hélice', tipo: 'texto' },
        { chave: 'tempo_s', rotulo: 'Tempo', tipo: 'numero', unidade: 's', min: 0 },
      ],
    },
    {
      titulo: 'Início e fim',
      campos: [
        { chave: 'inicio_escala_m', rotulo: 'Escala (início)', tipo: 'numero', unidade: 'm' },
        { chave: 'inicio_hora', rotulo: 'Hora (início)', tipo: 'texto', formato: 'hora_hm' },
        { chave: 'fim_escala_m', rotulo: 'Escala (fim)', tipo: 'numero', unidade: 'm' },
        { chave: 'fim_hora', rotulo: 'Hora (fim)', tipo: 'texto', formato: 'hora_hm' },
      ],
    },
    {
      titulo: 'Equipamento e método',
      campos: [
        { chave: 'molinete', rotulo: 'Molinete', tipo: 'texto' },
        {
          chave: 'contador',
          rotulo: 'Contador',
          tipo: 'select',
          opcoes: [
            { valor: 'a_ott', rotulo: 'A. OTT' },
            { valor: 'cth', rotulo: 'CTH' },
          ],
        },
        { chave: 'lastro', rotulo: 'Lastro', tipo: 'texto' },
        {
          chave: 'acesso',
          rotulo: 'Acesso',
          tipo: 'select',
          opcoes: [
            { valor: 'a_vau', rotulo: 'A vau' },
            { valor: 'barco', rotulo: 'Barco' },
            { valor: 'guincho', rotulo: 'Guincho' },
            { valor: 'haste', rotulo: 'Haste' },
            { valor: 'ponte', rotulo: 'Ponte' },
          ],
        },
        { chave: 'esconsidade', rotulo: 'Esconsidade (croqui no verso)', tipo: 'checkbox' },
        { chave: 'dist_polia_nivel_m', rotulo: 'Dist. polia até nível d’água', tipo: 'numero', unidade: 'm' },
        { chave: 'lubrificacao', rotulo: 'Lubrificação', tipo: 'select', opcoes: ESCALA_SIM_NAO },
      ],
    },
    {
      titulo: 'Verticais (molinete)',
      campos: [
        {
          chave: 'verticais',
          rotulo: 'Verticais',
          tipo: 'tabela',
          rotuloLinha: 'Vertical',
          ajuda: 'Uma linha por vertical medida, na ordem da margem.',
          colunas: [
            { chave: 'distancia_m', rotulo: 'Distância', tipo: 'numero', unidade: 'm' },
            { chave: 'profundidade_m', rotulo: 'Profundidade', tipo: 'numero', unidade: 'm', min: 0 },
            { chave: 'rot_02h', rotulo: 'Rotações 0,2h', tipo: 'numero', min: 0 },
            { chave: 'rot_06h', rotulo: 'Rotações 0,6h', tipo: 'numero', min: 0 },
            { chave: 'rot_08h', rotulo: 'Rotações 0,8h', tipo: 'numero', min: 0 },
            { chave: 'arrasto_grau', rotulo: 'Arrasto (ângulo α)', tipo: 'numero', unidade: '°' },
          ],
        },
      ],
    },
    {
      titulo: 'Resultados',
      campos: [
        { chave: 'vazao_m3s', rotulo: 'Vazão', tipo: 'numero', unidade: 'm³/s', min: 0 },
        { chave: 'area_molhada_m2', rotulo: 'Área molhada', tipo: 'numero', unidade: 'm²', min: 0 },
        { chave: 'largura_m', rotulo: 'Largura', tipo: 'numero', unidade: 'm', min: 0 },
        { chave: 'raio_m', rotulo: 'Raio', tipo: 'numero', unidade: 'm', min: 0 },
        { chave: 'cota_media_m', rotulo: 'Cota média', tipo: 'numero', unidade: 'm' },
        { chave: 'velocidade_media_ms', rotulo: 'Velocidade média', tipo: 'numero', unidade: 'm/s', min: 0 },
        { chave: 'profundidade_media_m', rotulo: 'Profundidade média', tipo: 'numero', unidade: 'm', min: 0 },
        { chave: 'delta_h_m', rotulo: 'ΔH (variação de nível)', tipo: 'numero', unidade: 'm' },
      ],
    },
  ],
};

export const SCHEMAS_FICHA: Record<CodigoTipoDocumento, SchemaFicha> = {
  1: SCHEMA_FICHA_DESCRITIVA,
  2: SCHEMA_PCD,
  3: SCHEMA_INSPECAO,
  4: SCHEMA_NIVELAMENTO,
  5: SCHEMA_LEV_SECAO,
  6: SCHEMA_TROCA_OBSERVADOR,
  7: SCHEMA_VAZAO,
};

export function obterSchema(codigo: CodigoTipoDocumento): SchemaFicha {
  return SCHEMAS_FICHA[codigo];
}

// ─────────────────────────────────────────────────────────────────────────
// Validação Zod do payload `dados` baseada no schema do tipo. Usado pelo
// use case `criarFichaVisita` antes de persistir, pra rejeitar entradas
// que o app possa enviar fora do contrato.
// ─────────────────────────────────────────────────────────────────────────

function zodCampo(campo: CampoFicha): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (campo.tipo) {
    case 'numero': {
      let num = z.number().finite();
      if (campo.min !== undefined) num = num.min(campo.min);
      if (campo.max !== undefined) num = num.max(campo.max);
      base = num;
      break;
    }
    case 'checkbox':
      base = z.boolean();
      break;
    case 'select':
      base = campo.opcoes && campo.opcoes.length > 0
        ? z.enum(campo.opcoes.map((o) => o.valor) as [string, ...string[]])
        : z.string();
      break;
    case 'tabela': {
      const shapeLinha: Record<string, z.ZodTypeAny> = {};
      for (const col of campo.colunas ?? []) {
        let celula: z.ZodTypeAny;
        if (col.tipo === 'numero') {
          let n = z.number().finite();
          if (col.min !== undefined) n = n.min(col.min);
          if (col.max !== undefined) n = n.max(col.max);
          celula = n;
        } else if (col.tipo === 'select') {
          celula = col.opcoes && col.opcoes.length > 0
            ? z.enum(col.opcoes.map((o) => o.valor) as [string, ...string[]])
            : z.string();
        } else {
          celula = z.string();
        }
        // Células vazias são aceitas: o técnico nem sempre preenche todas.
        shapeLinha[col.chave] = celula.nullable().optional();
      }
      base = z.array(z.object(shapeLinha).strict());
      break;
    }
    case 'texto':
    case 'textarea': {
      if (campo.formato) {
        const regra = REGRAS_FORMATO[campo.formato];
        const formatoOk = (v: string) =>
          regra.regex.test(v) && (!regra.validar || regra.validar(v));
        // Campo opcional vazio não deve falhar — só valida quando há conteúdo.
        base = campo.obrigatorio
          ? z.string().refine(formatoOk, regra.mensagem)
          : z.string().refine((v) => v === '' || formatoOk(v), regra.mensagem);
      } else {
        base = z.string();
      }
      break;
    }
  }
  return campo.obrigatorio ? base : base.nullable().optional();
}

export function construirSchemaZod(codigo: CodigoTipoDocumento): z.ZodTypeAny {
  const schema = obterSchema(codigo);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const secao of schema.secoes) {
    for (const campo of secao.campos) {
      shape[campo.chave] = zodCampo(campo);
    }
  }
  // Desconhece campos extras no body sem erro (futuro-proof).
  // Usado pelo fluxo legado web (`/api/postos/.../fichas`) — escreve direto em
  // `fichas_visita` sem aprovação humana. Manter `.passthrough()` aqui evita
  // breaking change até a regressão Thiago da Sprint 1.5 cobrir migração para
  // strict (ver ADR-0008 §8 e owasp-review-sprint-1.md §A03).
  return z.object(shape).passthrough();
}

/**
 * Variante estrita do construtor para o fluxo de TRIAGEM (app móvel +
 * aprovação humana). Rejeita campos extras com `unrecognized_keys`.
 *
 * Trade-off (André + Lucas, 2026-05-08): triagem é a superfície que recebe
 * payload do app móvel, então é onde a defesa deve ser maior. Cliente legado
 * web (`/api/postos/.../fichas`) não passa por aqui — ver
 * `construirSchemaZod` acima.
 *
 * Antes de adicionar uma chave nova ao formulário do app móvel, edite a
 * `SCHEMAS_FICHA` deste arquivo. Se o app enviar chave fora do schema, o
 * backend devolve `dados_invalidos` com `unrecognized_keys: [...]`.
 */
export function construirSchemaZodEstrito(
  codigo: CodigoTipoDocumento,
): z.ZodTypeAny {
  const schema = obterSchema(codigo);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const secao of schema.secoes) {
    for (const campo of secao.campos) {
      shape[campo.chave] = zodCampo(campo);
    }
  }
  return z.object(shape).strict();
}
