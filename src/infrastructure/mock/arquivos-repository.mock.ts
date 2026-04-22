import 'server-only';

import type {
  ArquivosRepository,
  GrupoArquivosPorTipo,
} from '@/application/ports/arquivos-repository';
import type { ArquivoIndexado } from '@/domain/arquivo-indexado';
import {
  rotuloTipoDocumento,
  type CodigoTipoDocumento,
} from '@/domain/tipo-documento';
import { ARQUIVOS_FIXTURES } from './fixtures';

/**
 * Adapter in-memory de ArquivosRepository (MODO DEMO).
 * A lógica de agrupamento é equivalente à do .pg (ver arquivos-repository.pg.ts).
 */

function porDataModificacaoDesc(a: ArquivoIndexado, b: ArquivoIndexado): number {
  return b.dataModificacao.getTime() - a.dataModificacao.getTime();
}

function agruparPorTipoDocumento(
  arquivos: ArquivoIndexado[],
): GrupoArquivosPorTipo[] {
  const grupos = new Map<number | 'null', ArquivoIndexado[]>();
  for (const arquivo of arquivos) {
    const chave = arquivo.codTipoDocumento ?? 'null';
    const atual = grupos.get(chave);
    if (atual) {
      atual.push(arquivo);
    } else {
      grupos.set(chave, [arquivo]);
    }
  }

  const resultado: GrupoArquivosPorTipo[] = [];
  for (const [chave, lista] of grupos.entries()) {
    const codTipoDocumento =
      chave === 'null' ? null : (chave as CodigoTipoDocumento);
    resultado.push({
      codTipoDocumento,
      rotulo: rotuloTipoDocumento(codTipoDocumento),
      arquivos: lista,
    });
  }

  resultado.sort((a, b) => {
    if (a.codTipoDocumento === null) return 1;
    if (b.codTipoDocumento === null) return -1;
    return a.codTipoDocumento - b.codTipoDocumento;
  });

  return resultado;
}

export const arquivosRepository: ArquivosRepository = {
  async listarPorPrefixo(prefixo) {
    return ARQUIVOS_FIXTURES
      .filter((a) => a.prefixo === prefixo)
      .slice()
      .sort(porDataModificacaoDesc);
  },

  async foiIndexadoAlgumaVez(prefixo) {
    return ARQUIVOS_FIXTURES.some((a) => a.prefixo === prefixo);
  },

  async listarAgrupadosPorTipo(prefixo) {
    const arquivos = ARQUIVOS_FIXTURES
      .filter((a) => a.prefixo === prefixo)
      .slice()
      .sort((a, b) => {
        const codA = a.codTipoDocumento;
        const codB = b.codTipoDocumento;
        if (codA === null && codB === null) {
          // cai para critérios seguintes
        } else if (codA === null) {
          return 1;
        } else if (codB === null) {
          return -1;
        } else if (codA !== codB) {
          return codA - codB;
        }

        const dataA = a.dataDocumento?.getTime() ?? -Infinity;
        const dataB = b.dataDocumento?.getTime() ?? -Infinity;
        if (dataA !== dataB) return dataB - dataA;

        return b.dataModificacao.getTime() - a.dataModificacao.getTime();
      });
    return agruparPorTipoDocumento(arquivos);
  },
};
