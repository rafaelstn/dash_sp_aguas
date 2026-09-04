import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { JanelaPeriodo } from '@/application/ports/series-medicao-repository';

/**
 * Leitura e validação da janela de período das rotas de série histórica.
 *
 * Existe num arquivo só, e não copiada em cada rota, por uma razão concreta: o
 * projeto já pagou por valor escrito duas vezes no mesmo lugar (o teto de dias
 * e o formato da data). Duas cópias de um limite são uma divergência agendada,
 * e a divergência aparece como "a rota A aceita o período que a rota B recusa",
 * que ninguém lê como defeito de validação.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE O PERÍODO É OBRIGATÓRIO AQUI, E OPCIONAL NAS ROTAS DO SIBH
 * ─────────────────────────────────────────────────────────────────────────
 * As rotas do Monitor que leem o SIBH assumem "últimos 30 dias" quando a
 * pessoa não diz nada, e ali isso é razoável: aquela fonte está viva.
 *
 * Aqui não. As cinco séries do órgão param em agosto de 2025 (MEDIDO), então um
 * padrão de "últimos 30 dias" devolveria VAZIO para todo posto da base, e a
 * tela mostraria "sem dado" para postos com quarenta mil leituras. Sem período
 * não há consulta: é a diferença entre a pessoa escolher a janela e o sistema
 * escolher a janela errada por ela.
 */

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Teto da janela numa resposta.
 *
 * Não é limite de desempenho: MEDIDO em 03/09/2026, o resumo diário da série
 * INTEIRA do maior posto de cota (70.068 leituras, 35.034 dias) leva 473 ms. É
 * limite de TAMANHO DE RESPOSTA: 35 mil dias em JSON são alguns megabytes num
 * navegador, e a série tem 137 anos. Dez anos por vez é o que cabe num gráfico
 * que alguém consegue ler.
 */
export const MAX_DIAS_JANELA = 3660;

const esquema = z
  .object({
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.'),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.'),
  })
  .transform((valores, ctx) => {
    const interpretar = (texto: string, campo: 'desde' | 'ate'): number => {
      const ms = Date.parse(`${texto}T00:00:00.000Z`);
      if (Number.isNaN(ms)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: 'Data inválida.' });
        return Number.NaN;
      }
      return ms;
    };

    const desdeMs = interpretar(valores.desde, 'desde');
    const ateMs = interpretar(valores.ate, 'ate');
    if (Number.isNaN(desdeMs) || Number.isNaN(ateMs)) return z.NEVER;

    if (desdeMs > ateMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['desde'],
        message: 'O início do período não pode ser posterior ao fim.',
      });
      return z.NEVER;
    }

    if (ateMs - desdeMs > MAX_DIAS_JANELA * MS_POR_DIA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ate'],
        message: `O período não pode exceder ${MAX_DIAS_JANELA} dias.`,
      });
      return z.NEVER;
    }

    return { desde: new Date(desdeMs), ate: new Date(ateMs) };
  });

/**
 * Devolve a janela, ou a resposta 400 pronta.
 *
 * O chamador distingue os dois por `instanceof NextResponse`, que é o padrão já
 * usado por `exigirUsuario` nas rotas deste projeto.
 */
export function lerJanela(parametros: URLSearchParams, headers: Headers): JanelaPeriodo | NextResponse {
  const analise = esquema.safeParse({
    desde: parametros.get('desde') ?? undefined,
    ate: parametros.get('ate') ?? undefined,
  });

  if (!analise.success) {
    return NextResponse.json(
      {
        erro: 'periodo_invalido',
        mensagem:
          'Informe o período com desde e ate no formato AAAA-MM-DD. A série do órgão é histórica, então não há período padrão.',
        motivos: analise.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }

  return analise.data;
}
