import 'server-only';
import type {
  ArquivosRepository,
  GrupoArquivosPorTipo,
} from '@/application/ports/arquivos-repository';
import type {
  ArquivoIndexado,
  FormatoNomeArquivo,
} from '@/domain/arquivo-indexado';
import { FalhaRepositorio } from '@/domain/errors';
import type { CodigoTipoDado } from '@/domain/tipo-dado';
import {
  rotuloTipoDocumento,
  type CodigoTipoDocumento,
} from '@/domain/tipo-documento';
import { sql } from './client';

type LinhaArquivo = {
  id: string;
  prefixo: string;
  nome_arquivo: string;
  caminho_absoluto: string;
  tamanho_bytes: string;
  data_modificacao: Date;
  hash_conteudo: string | null;
  indexado_em: Date;
  lote_indexacao: string;
  tipo_dado: CodigoTipoDado | null;
  cod_tipo_documento: number | null;
  cod_encarregado: string | null;
  data_documento: Date | null;
  parte_opcional: string | null;
  nome_valido: boolean;
  formato_nome: FormatoNomeArquivo;
};

function mapear(linha: LinhaArquivo): ArquivoIndexado {
  return {
    id: linha.id,
    prefixo: linha.prefixo,
    nomeArquivo: linha.nome_arquivo,
    caminhoAbsoluto: linha.caminho_absoluto,
    tamanhoBytes: Number(linha.tamanho_bytes),
    dataModificacao: linha.data_modificacao,
    hashConteudo: linha.hash_conteudo,
    indexadoEm: linha.indexado_em,
    loteIndexacao: linha.lote_indexacao,
    tipoDado: linha.tipo_dado,
    codTipoDocumento:
      linha.cod_tipo_documento !== null
        ? (linha.cod_tipo_documento as CodigoTipoDocumento)
        : null,
    codEncarregado: linha.cod_encarregado,
    dataDocumento: linha.data_documento,
    parteOpcional: linha.parte_opcional,
    nomeValido: linha.nome_valido,
    formatoNome: linha.formato_nome,
  };
}

const COLUNAS = sql`
  id, prefixo, nome_arquivo, caminho_absoluto, tamanho_bytes,
  data_modificacao, hash_conteudo, indexado_em, lote_indexacao,
  tipo_dado, cod_tipo_documento, cod_encarregado, data_documento,
  parte_opcional, nome_valido, formato_nome
`;

export const arquivosRepository: ArquivosRepository = {
  async listarPorPrefixo(prefixo) {
    try {
      const linhas = await sql<LinhaArquivo[]>`
        SELECT ${COLUNAS}
          FROM arquivos_indexados
         WHERE prefixo = ${prefixo}
         ORDER BY data_modificacao DESC
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('listarPorPrefixo', e);
    }
  },

  async foiIndexadoAlgumaVez(prefixo) {
    try {
      const linhas = await sql<{ existe: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM arquivos_indexados WHERE prefixo = ${prefixo}
        ) AS existe
      `;
      return Boolean(linhas[0]?.existe);
    } catch (e) {
      throw new FalhaRepositorio('foiIndexadoAlgumaVez', e);
    }
  },

  async listarAgrupadosPorTipo(prefixo) {
    try {
      const linhas = await sql<LinhaArquivo[]>`
        SELECT ${COLUNAS}
          FROM arquivos_indexados
         WHERE prefixo = ${prefixo}
         ORDER BY cod_tipo_documento ASC NULLS LAST,
                  data_documento DESC NULLS LAST,
                  data_modificacao DESC
      `;
      const arquivos = linhas.map(mapear);
      return agruparPorTipoDocumento(arquivos);
    } catch (e) {
      throw new FalhaRepositorio('listarAgrupadosPorTipo', e);
    }
  },
};

function agruparPorTipoDocumento(arquivos: ArquivoIndexado[]): GrupoArquivosPorTipo[] {
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

  // grupos com código definido primeiro (ordenados), "Sem classificação" por último
  resultado.sort((a, b) => {
    if (a.codTipoDocumento === null) return 1;
    if (b.codTipoDocumento === null) return -1;
    return a.codTipoDocumento - b.codTipoDocumento;
  });

  return resultado;
}
