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
  | 'checkbox';

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
}

export interface SecaoFicha {
  titulo: string;
  campos: CampoFicha[];
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
// Schema do tipo Inspeção (código 3) — espelha o modelo de "Ficha de
// Inspeção da Estação Hidrometeorológica" usado pela FCTH em campo.
// ─────────────────────────────────────────────────────────────────────────

const SCHEMA_INSPECAO: SchemaFicha = {
  codigo: 3,
  rotulo: TIPOS_DOCUMENTO[3].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Situação encontrada',
      campos: [
        {
          chave: 'acesso',
          rotulo: 'Acesso',
          tipo: 'select',
          opcoes: [
            { valor: 'boa', rotulo: 'Boa' },
            { valor: 'ruim', rotulo: 'Ruim' },
          ],
        },
        {
          chave: 'cercado_abrigo',
          rotulo: 'Cercado / abrigo',
          tipo: 'select',
          opcoes: [
            { valor: 'boa', rotulo: 'Boa' },
            { valor: 'ruim', rotulo: 'Ruim' },
          ],
        },
        {
          chave: 'exposicao',
          rotulo: 'Exposição',
          tipo: 'select',
          opcoes: [
            { valor: 'boa', rotulo: 'Boa' },
            { valor: 'ruim', rotulo: 'Ruim' },
          ],
        },
        {
          chave: 'limpeza',
          rotulo: 'Limpeza',
          tipo: 'select',
          opcoes: [
            { valor: 'boa', rotulo: 'Boa' },
            { valor: 'ruim', rotulo: 'Ruim' },
          ],
        },
      ],
    },
    {
      titulo: 'PCD e equipamentos',
      campos: [
        {
          chave: 'tipo_manutencao',
          rotulo: 'Tipo de manutenção',
          tipo: 'select',
          obrigatorio: true,
          opcoes: [
            { valor: 'preventiva', rotulo: 'Preventiva' },
            { valor: 'corretiva', rotulo: 'Corretiva' },
          ],
        },
        {
          chave: 'pcd_deixada',
          rotulo: 'PCD deixada',
          tipo: 'select',
          opcoes: [
            { valor: 'registrando_transmitindo', rotulo: 'Registrando e Transmitindo' },
            { valor: 'somente_registrando', rotulo: 'Somente Registrando' },
            { valor: 'parada', rotulo: 'Parada' },
          ],
        },
        {
          chave: 'sensor_nivel_tipo',
          rotulo: 'Tipo do sensor de nível',
          tipo: 'select',
          opcoes: [
            { valor: 'pressao', rotulo: 'Pressão (transdutor)' },
            { valor: 'ultrassonico', rotulo: 'Ultrassônico' },
            { valor: 'radar', rotulo: 'Radar' },
          ],
        },
        {
          chave: 'transmissao',
          rotulo: 'Transmissão',
          tipo: 'select',
          opcoes: [
            { valor: 'gprs', rotulo: 'GPRS' },
            { valor: 'satelite', rotulo: 'Satélite' },
            { valor: 'sem_transmissao', rotulo: 'Sem transmissão' },
          ],
        },
      ],
    },
    {
      titulo: 'Leituras',
      campos: [
        {
          chave: 'na_saisp_metros',
          rotulo: 'N.A. SAISP',
          tipo: 'numero',
          unidade: 'm',
          ajuda: 'Nível d’água lido no SAISP no momento da visita.',
        },
        {
          chave: 'zero_regua_metros',
          rotulo: 'Zero da régua',
          tipo: 'numero',
          unidade: 'm',
        },
        {
          chave: 'cota_regua_inicial_cm',
          rotulo: 'Cota da régua (inicial)',
          tipo: 'numero',
          unidade: 'cm',
        },
        {
          chave: 'cota_regua_final_cm',
          rotulo: 'Cota da régua (final)',
          tipo: 'numero',
          unidade: 'cm',
        },
        {
          chave: 'tensao_bateria_v',
          rotulo: 'Tensão da bateria 12V',
          tipo: 'numero',
          unidade: 'V',
        },
        {
          chave: 'precipitacao_pluviometro_mm',
          rotulo: 'Precipitação (pluviômetro)',
          tipo: 'numero',
          unidade: 'mm',
        },
        {
          chave: 'precipitacao_pcd_mm',
          rotulo: 'Precipitação (PCD)',
          tipo: 'numero',
          unidade: 'mm',
        },
      ],
    },
    {
      titulo: 'Serviços executados',
      campos: [
        { chave: 'svc_limpeza_reguas', rotulo: 'Limpeza próximo às réguas', tipo: 'checkbox' },
        { chave: 'svc_nivelamento_reguas', rotulo: 'Nivelamento de réguas', tipo: 'checkbox' },
        { chave: 'svc_desassoreamento', rotulo: 'Desassoreamento', tipo: 'checkbox' },
        { chave: 'svc_inspecao_pcd', rotulo: 'Inspeção e limpeza da PCD', tipo: 'checkbox' },
        { chave: 'svc_calibracao_transdutor', rotulo: 'Calibração do transdutor', tipo: 'checkbox' },
        { chave: 'svc_aferição_transdutor', rotulo: 'Aferição do transdutor', tipo: 'checkbox' },
        { chave: 'svc_conferencia_pluviometro', rotulo: 'Conferência da altura do pluviômetro', tipo: 'checkbox' },
        { chave: 'svc_reforma_cercado', rotulo: 'Reforma do cercado / abrigo', tipo: 'checkbox' },
        { chave: 'svc_orientacao_zelador', rotulo: 'Orientação ao zelador', tipo: 'checkbox' },
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

const SCHEMA_FICHA_DESCRITIVA: SchemaFicha = {
  codigo: 1,
  rotulo: TIPOS_DOCUMENTO[1].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Características da estação',
      campos: [
        {
          chave: 'tipo_estacao',
          rotulo: 'Tipo de estação',
          tipo: 'select',
          opcoes: [
            { valor: 'fluviometrica', rotulo: 'Fluviométrica' },
            { valor: 'pluviometrica', rotulo: 'Pluviométrica' },
            { valor: 'evaporimetrica', rotulo: 'Evaporimétrica' },
            { valor: 'qualidade_agua', rotulo: 'Qualidade da água' },
            { valor: 'sedimentometrica', rotulo: 'Sedimentométrica' },
          ],
        },
        {
          chave: 'curso_dagua',
          rotulo: 'Curso d’água',
          tipo: 'texto',
        },
        {
          chave: 'bacia',
          rotulo: 'Bacia hidrográfica',
          tipo: 'texto',
        },
        {
          chave: 'area_drenagem_km2',
          rotulo: 'Área de drenagem',
          tipo: 'numero',
          unidade: 'km²',
          min: 0,
        },
        {
          chave: 'altimetria_m',
          rotulo: 'Altimetria',
          tipo: 'numero',
          unidade: 'm',
        },
      ],
    },
    {
      titulo: 'Acesso e infraestrutura',
      campos: [
        {
          chave: 'descricao_acesso',
          rotulo: 'Descrição do acesso',
          tipo: 'textarea',
          ajuda: 'Roteiro pra chegar à estação (referências, vias, distâncias).',
        },
        {
          chave: 'tem_cercado',
          rotulo: 'Possui cercado/abrigo',
          tipo: 'checkbox',
        },
        {
          chave: 'tem_energia',
          rotulo: 'Energia elétrica disponível',
          tipo: 'checkbox',
        },
        {
          chave: 'tem_telefonia',
          rotulo: 'Cobertura de telefonia',
          tipo: 'select',
          opcoes: [
            { valor: 'gprs', rotulo: 'GPRS' },
            { valor: 'satelite', rotulo: 'Satélite' },
            { valor: 'sem_sinal', rotulo: 'Sem sinal' },
          ],
        },
      ],
    },
  ],
};

const SCHEMA_PCD: SchemaFicha = {
  codigo: 2,
  rotulo: TIPOS_DOCUMENTO[2].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Configuração da PCD',
      campos: [
        {
          chave: 'tipo_servico',
          rotulo: 'Tipo de serviço',
          tipo: 'select',
          obrigatorio: true,
          opcoes: [
            { valor: 'instalacao', rotulo: 'Instalação' },
            { valor: 'manutencao', rotulo: 'Manutenção' },
            { valor: 'substituicao', rotulo: 'Substituição' },
            { valor: 'desativacao', rotulo: 'Desativação' },
          ],
        },
        {
          chave: 'modelo_datalogger',
          rotulo: 'Modelo do datalogger',
          tipo: 'texto',
        },
        {
          chave: 'modelo_sensor_nivel',
          rotulo: 'Modelo do sensor de nível',
          tipo: 'texto',
        },
        {
          chave: 'modelo_modem',
          rotulo: 'Modelo do modem',
          tipo: 'texto',
        },
        {
          chave: 'transmissao',
          rotulo: 'Transmissão',
          tipo: 'select',
          opcoes: [
            { valor: 'gprs', rotulo: 'GPRS' },
            { valor: 'satelite', rotulo: 'Satélite' },
            { valor: 'sem_transmissao', rotulo: 'Sem transmissão' },
          ],
        },
      ],
    },
    {
      titulo: 'Parâmetros operacionais',
      campos: [
        {
          chave: 'intervalo_registro_min',
          rotulo: 'Intervalo de registro',
          tipo: 'numero',
          unidade: 'min',
          min: 1,
        },
        {
          chave: 'intervalo_transmissao_min',
          rotulo: 'Intervalo de transmissão',
          tipo: 'numero',
          unidade: 'min',
          min: 1,
        },
        {
          chave: 'tensao_bateria_v',
          rotulo: 'Tensão da bateria',
          tipo: 'numero',
          unidade: 'V',
        },
        {
          chave: 'corrente_painel_solar_ma',
          rotulo: 'Corrente do painel solar',
          tipo: 'numero',
          unidade: 'mA',
        },
        {
          chave: 'offset_transdutor_cm',
          rotulo: 'Offset do transdutor',
          tipo: 'numero',
          unidade: 'cm',
        },
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

const SCHEMA_TROCA_OBSERVADOR: SchemaFicha = {
  codigo: 6,
  rotulo: TIPOS_DOCUMENTO[6].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Observador anterior',
      campos: [
        {
          chave: 'observador_anterior_nome',
          rotulo: 'Nome do observador anterior',
          tipo: 'texto',
        },
        {
          chave: 'observador_anterior_data_inicio',
          rotulo: 'Data de início (anterior)',
          tipo: 'texto',
          ajuda: 'Formato AAAA-MM-DD ou descritivo (ex.: "início 2018").',
        },
        {
          chave: 'observador_anterior_motivo_saida',
          rotulo: 'Motivo da saída',
          tipo: 'select',
          opcoes: [
            { valor: 'aposentadoria', rotulo: 'Aposentadoria' },
            { valor: 'mudanca', rotulo: 'Mudança de localidade' },
            { valor: 'falecimento', rotulo: 'Falecimento' },
            { valor: 'desinteresse', rotulo: 'Desinteresse' },
            { valor: 'outro', rotulo: 'Outro' },
          ],
        },
      ],
    },
    {
      titulo: 'Novo observador',
      campos: [
        {
          chave: 'observador_novo_nome',
          rotulo: 'Nome do novo observador',
          tipo: 'texto',
          obrigatorio: true,
        },
        {
          chave: 'observador_novo_documento',
          rotulo: 'CPF ou documento',
          tipo: 'texto',
        },
        {
          chave: 'observador_novo_telefone',
          rotulo: 'Telefone de contato',
          tipo: 'texto',
        },
        {
          chave: 'observador_novo_endereco',
          rotulo: 'Endereço',
          tipo: 'textarea',
        },
        {
          chave: 'observador_novo_data_inicio',
          rotulo: 'Data de início (novo observador)',
          tipo: 'texto',
        },
        {
          chave: 'orientacao_realizada',
          rotulo: 'Orientação/treinamento realizado nesta visita',
          tipo: 'checkbox',
        },
      ],
    },
  ],
};

const SCHEMA_VAZAO: SchemaFicha = {
  codigo: 7,
  rotulo: TIPOS_DOCUMENTO[7].rotulo,
  disponivel: true,
  secoes: [
    {
      titulo: 'Medição de descarga líquida',
      campos: [
        {
          chave: 'metodo_medicao',
          rotulo: 'Método',
          tipo: 'select',
          obrigatorio: true,
          opcoes: [
            { valor: 'molinete', rotulo: 'Molinete (convencional)' },
            { valor: 'adcp', rotulo: 'ADCP (acústico Doppler)' },
            { valor: 'flutuador', rotulo: 'Flutuador' },
            { valor: 'eletromagnetico', rotulo: 'Eletromagnético' },
          ],
        },
        {
          chave: 'equipamento_modelo',
          rotulo: 'Modelo do equipamento',
          tipo: 'texto',
        },
        {
          chave: 'cota_inicial_cm',
          rotulo: 'Cota inicial',
          tipo: 'numero',
          unidade: 'cm',
        },
        {
          chave: 'cota_final_cm',
          rotulo: 'Cota final',
          tipo: 'numero',
          unidade: 'cm',
        },
        {
          chave: 'cota_media_cm',
          rotulo: 'Cota média',
          tipo: 'numero',
          unidade: 'cm',
        },
        {
          chave: 'vazao_calculada_m3s',
          rotulo: 'Vazão calculada',
          tipo: 'numero',
          unidade: 'm³/s',
          min: 0,
        },
        {
          chave: 'velocidade_media_ms',
          rotulo: 'Velocidade média',
          tipo: 'numero',
          unidade: 'm/s',
          min: 0,
        },
        {
          chave: 'area_molhada_m2',
          rotulo: 'Área molhada',
          tipo: 'numero',
          unidade: 'm²',
          min: 0,
        },
        {
          chave: 'largura_superficie_m',
          rotulo: 'Largura na superfície',
          tipo: 'numero',
          unidade: 'm',
          min: 0,
        },
      ],
    },
    {
      titulo: 'Sedimentometria (opcional)',
      campos: [
        {
          chave: 'mediu_sedimentos',
          rotulo: 'Realizada medição de descarga sólida',
          tipo: 'checkbox',
        },
        {
          chave: 'concentracao_sedimentos_mgL',
          rotulo: 'Concentração de sedimentos',
          tipo: 'numero',
          unidade: 'mg/L',
          min: 0,
        },
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
    case 'texto':
    case 'textarea':
      base = z.string();
      break;
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
  return z.object(shape).passthrough();
}
