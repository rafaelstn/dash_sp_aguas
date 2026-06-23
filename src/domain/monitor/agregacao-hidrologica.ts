/**
 * Agregação pluviométrica por dia hidrológico.
 *
 * Domínio puro: recebe medições horárias do SIBH e soma por dia
 * hidrológico. Sem I/O, sem dependência de infraestrutura. Toda a regra
 * do corte de janela (07:00 do dia D até 06:59 do dia D+1) vive aqui pra
 * ser testável de forma isolada.
 *
 * REGRA DO DIA HIDROLÓGICO (convenção DAEE/ANA)
 *   A chuva é acumulada de 07:00 do dia D até 06:59 do dia D+1. O valor
 *   resultante é atribuído ao dia D. Consequência prática:
 *     - medição às 06:59 pertence ao dia hidrológico ANTERIOR (D menos 1);
 *     - medição às 07:00 inicia um NOVO dia hidrológico (D).
 */

import type { MedicaoSibh } from '@/application/ports/sibh-gateway';

/**
 * Resultado da agregação de um dia hidrológico.
 */
export interface AgregacaoDiaria {
  /** Dia hidrológico de referência no formato 'YYYY-MM-DD'. */
  data: string;
  /** Soma das medições (mm) do dia, arredondada a 2 casas. */
  totalMm: number;
  /** Quantidade de medições somadas no dia. */
  medicoesCount: number;
  /** Início da janela: '07:00' do dia de referência ('YYYY-MM-DD HH:mm'). */
  dataInicio: string;
  /** Fim da janela: '06:59' do dia seguinte ('YYYY-MM-DD HH:mm'). */
  dataFim: string;
}

/**
 * Converte um número 0..n em string de 2 dígitos com zero à esquerda.
 */
function pad2(valor: number): string {
  return valor < 10 ? `0${valor}` : String(valor);
}

/**
 * Componentes de data/hora extraídos do timestamp de uma medição.
 */
interface PartesMomento {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

/**
 * Faz parse defensivo do timestamp do SIBH no formato 'YYYY/MM/DD HH:mm'.
 * Retorna `null` quando o formato é inesperado, pra a medição ser
 * descartada em vez de poluir a soma com NaN.
 */
function extrairPartes(momento: string): PartesMomento | null {
  const match = momento
    .trim()
    .match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, ano, mes, dia, hora, minuto] = match;
  return {
    ano: Number(ano),
    mes: Number(mes),
    dia: Number(dia),
    hora: Number(hora),
    minuto: Number(minuto),
  };
}

/**
 * Determina o dia hidrológico ('YYYY-MM-DD') ao qual uma medição pertence.
 * Antes das 07:00 a medição cai no dia anterior; das 07:00 em diante, no
 * próprio dia.
 */
function diaHidrologico(partes: PartesMomento): string {
  // Usa UTC pra evitar deslocamento por timezone da máquina ao subtrair dias.
  const base = Date.UTC(partes.ano, partes.mes - 1, partes.dia);
  const ref = partes.hora < 7 ? new Date(base - 24 * 60 * 60 * 1000) : new Date(base);
  const ano = ref.getUTCFullYear();
  const mes = ref.getUTCMonth() + 1;
  const dia = ref.getUTCDate();
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

/**
 * Calcula os limites textuais da janela hidrológica de um dia de referência.
 * dataInicio = '07:00' do dia; dataFim = '06:59' do dia seguinte.
 */
function janela(diaRef: string): { dataInicio: string; dataFim: string } {
  const partes = diaRef.split('-').map(Number);
  const ano = partes[0] ?? 0;
  const mes = partes[1] ?? 1;
  const dia = partes[2] ?? 1;
  const inicio = `${diaRef} 07:00`;

  const dMais1 = new Date(Date.UTC(ano, mes - 1, dia) + 24 * 60 * 60 * 1000);
  const fim = `${dMais1.getUTCFullYear()}-${pad2(dMais1.getUTCMonth() + 1)}-${pad2(
    dMais1.getUTCDate(),
  )} 06:59`;

  return { dataInicio: inicio, dataFim: fim };
}

/**
 * Agrega medições horárias por dia hidrológico (07:00 -> 06:59).
 *
 * Função pura: mesma entrada produz sempre a mesma saída, sem efeitos
 * colaterais. Medições com timestamp em formato inesperado são ignoradas.
 *
 * @param medicoes Medições horárias já normalizadas (port SibhGateway).
 * @returns Agregações ordenadas da data mais recente para a mais antiga.
 */
export function agregarDiario(medicoes: MedicaoSibh[]): AgregacaoDiaria[] {
  const porDia = new Map<string, { total: number; count: number }>();

  for (const medicao of medicoes) {
    const partes = extrairPartes(medicao.momento);
    if (!partes) continue;
    if (!Number.isFinite(medicao.valorMm)) continue;

    const dia = diaHidrologico(partes);
    const atual = porDia.get(dia) ?? { total: 0, count: 0 };
    porDia.set(dia, {
      total: atual.total + medicao.valorMm,
      count: atual.count + 1,
    });
  }

  const resultado: AgregacaoDiaria[] = [];
  for (const [dia, dados] of porDia) {
    const { dataInicio, dataFim } = janela(dia);
    resultado.push({
      data: dia,
      totalMm: Math.round(dados.total * 100) / 100,
      medicoesCount: dados.count,
      dataInicio,
      dataFim,
    });
  }

  return resultado.sort((a, b) => b.data.localeCompare(a.data));
}
