import type { CampoFicha } from './schemas';
import { parseNumeroPtBR } from '@/lib/numero-pt-br';

/** Erros de formulário indexados por chave de campo (ou `__campo` do cabeçalho). */
export type ErrosCampos = Record<string, string>;

/**
 * Valida o cabeçalho da ficha (nome do técnico e data da visita). Retorna o
 * mapa de erros por chave (`__tecnicoNome`, `__dataVisita`); vazio se válido.
 */
export function validarCabecalhoFicha(cabecalho: {
  tecnicoNome: string;
  dataVisita: string;
}): ErrosCampos {
  const erros: ErrosCampos = {};
  if (!cabecalho.tecnicoNome.trim()) {
    erros['__tecnicoNome'] = 'Informe seu nome (mínimo 1 caractere).';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cabecalho.dataVisita)) {
    erros['__dataVisita'] = 'Data deve estar no formato AAAA-MM-DD.';
  }
  return erros;
}

/**
 * Normaliza os dados crus do formulário para o formato que o schema Zod espera:
 * strings de campo `numero` viram número pt-BR (ou ficam cruas se inválidas),
 * campos opcionais vazios viram `null`, obrigatórios vazios viram `undefined`
 * (para o Zod acusar), `checkbox` vira boolean e `tabela` é normalizada célula
 * a célula. Considera apenas os campos visíveis.
 */
export function normalizarDadosFicha(
  camposVisiveis: CampoFicha[],
  dados: Record<string, unknown>,
): Record<string, unknown> {
  const normalizados: Record<string, unknown> = {};
  for (const campo of camposVisiveis) {
    const bruto = dados[campo.chave];
    if (campo.tipo === 'tabela') {
      const linhas = Array.isArray(bruto)
        ? (bruto as Array<Record<string, unknown>>)
        : [];
      normalizados[campo.chave] = linhas.map((linha) => {
        const obj: Record<string, unknown> = {};
        for (const col of campo.colunas ?? []) {
          const cru = linha?.[col.chave];
          if (col.tipo === 'numero') {
            if (cru === '' || cru === null || cru === undefined) {
              obj[col.chave] = null;
              continue;
            }
            const n = parseNumeroPtBR(typeof cru === 'string' ? cru : String(cru));
            obj[col.chave] = Number.isNaN(n) ? cru : n;
            continue;
          }
          obj[col.chave] = cru === '' || cru === undefined ? null : cru;
        }
        return obj;
      });
      continue;
    }
    if (campo.tipo === 'numero') {
      if (bruto === '' || bruto === null || bruto === undefined) {
        normalizados[campo.chave] = campo.obrigatorio ? undefined : null;
        continue;
      }
      const n = parseNumeroPtBR(typeof bruto === 'string' ? bruto : String(bruto));
      normalizados[campo.chave] = Number.isNaN(n) ? bruto : n;
      continue;
    }
    if (campo.tipo === 'checkbox') {
      normalizados[campo.chave] = Boolean(bruto);
      continue;
    }
    if (bruto === '' || bruto === undefined) {
      normalizados[campo.chave] = campo.obrigatorio ? undefined : null;
      continue;
    }
    normalizados[campo.chave] = bruto;
  }
  return normalizados;
}

/** Traduz o código de erro do Zod para mensagem pt-BR amigável. */
export function mensagemZodPtBR(codigo: string, original: string): string {
  switch (codigo) {
    case 'invalid_type':
      return 'Tipo inválido para este campo.';
    case 'too_small':
      return 'Valor abaixo do mínimo permitido.';
    case 'too_big':
      return 'Valor acima do máximo permitido.';
    case 'invalid_enum_value':
      return 'Selecione uma opção válida.';
    case 'invalid_string':
      // Regex de formato (coordenada, mês/ano) carrega mensagem pt-BR própria.
      return original || 'Texto inválido.';
    default:
      return original || 'Valor inválido.';
  }
}
