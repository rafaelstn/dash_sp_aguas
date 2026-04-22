import 'server-only';
import type { DesconformidadesRepository } from '@/application/ports/desconformidades-repository';
import type {
  ArquivoDesconforme,
  CategoriaArquivoOrfao,
  ClassePrefixo,
  ClassePrefixoAna,
  ContagensDesconformidade,
  DesconformidadePrefixo,
  DesconformidadePrefixoAna,
} from '@/domain/desconformidade';
import { FalhaRepositorio } from '@/domain/errors';
import type { CodigoTipoDado } from '@/domain/tipo-dado';
import { sql } from './client';

type LinhaViewPrefixo = {
  id: string;
  prefixo: string;
  prefixo_ana: string | null;
  classe_prefixo: string;
  classe_prefixo_ana: string;
  sugestao_prefixo: string | null;
  sugestao_prefixo_ana: string | null;
};

type LinhaArquivoOrfao = {
  id: string;
  nome_arquivo: string;
  caminho_absoluto: string;
  tamanho_bytes: string;
  data_modificacao: Date;
  categoria: CategoriaArquivoOrfao;
  tipo_dado: CodigoTipoDado | null;
  status_revisao: 'pendente' | 'revisado' | null;
};

const CLASSES_PREFIXO_DESCONFORMES: readonly ClassePrefixo[] = [
  'suspeita_troca_letra_digito',
  'placeholder_interrogacao',
  'outlier_prefixo',
];

const CLASSES_PREFIXO_ANA_DESCONFORMES: readonly ClassePrefixoAna[] = [
  'faltando_zero_esquerda',
  'outlier_ana',
];

function isClassePrefixoDesconforme(v: string): v is ClassePrefixo {
  return (CLASSES_PREFIXO_DESCONFORMES as readonly string[]).includes(v);
}

function isClassePrefixoAnaDesconforme(v: string): v is ClassePrefixoAna {
  return (CLASSES_PREFIXO_ANA_DESCONFORMES as readonly string[]).includes(v);
}

export const desconformidadesRepository: DesconformidadesRepository = {
  async listarPrefixosPrincipaisDesconformes() {
    try {
      const linhas = await sql<LinhaViewPrefixo[]>`
        SELECT v.id, v.prefixo, v.prefixo_ana, v.classe_prefixo,
               v.classe_prefixo_ana, v.sugestao_prefixo, v.sugestao_prefixo_ana
          FROM v_postos_desconformes v
         WHERE v.classe_prefixo NOT LIKE 'conforme_%'
         ORDER BY v.prefixo
      `;

      const ids = linhas.map((l) => l.prefixo);
      const revisoes = ids.length ? await buscarRevisoes('posto', ids, 'PREFIXO_PRINCIPAL') : new Map();

      return linhas
        .filter((l) => isClassePrefixoDesconforme(l.classe_prefixo))
        .map<DesconformidadePrefixo>((l) => ({
          id: l.id,
          prefixo: l.prefixo,
          classe: l.classe_prefixo as ClassePrefixo,
          sugestao: l.sugestao_prefixo,
          statusRevisao: revisoes.get(l.prefixo) ?? 'pendente',
        }));
    } catch (e) {
      throw new FalhaRepositorio('listarPrefixosPrincipaisDesconformes', e);
    }
  },

  async listarPrefixosAnaDesconformes() {
    try {
      const linhas = await sql<LinhaViewPrefixo[]>`
        SELECT v.id, v.prefixo, v.prefixo_ana, v.classe_prefixo,
               v.classe_prefixo_ana, v.sugestao_prefixo, v.sugestao_prefixo_ana
          FROM v_postos_desconformes v
         WHERE v.classe_prefixo_ana IN ('faltando_zero_esquerda','outlier_ana')
         ORDER BY v.prefixo
      `;
      const ids = linhas.map((l) => l.prefixo);
      const revisoes = ids.length ? await buscarRevisoes('posto', ids, 'PREFIXO_ANA') : new Map();

      return linhas
        .filter((l) => isClassePrefixoAnaDesconforme(l.classe_prefixo_ana))
        .map<DesconformidadePrefixoAna>((l) => ({
          id: l.id,
          prefixo: l.prefixo,
          prefixoAnaAtual: l.prefixo_ana,
          prefixoAnaSugerido:
            l.classe_prefixo_ana === 'faltando_zero_esquerda' && l.prefixo_ana
              ? l.prefixo_ana.padStart(8, '0')
              : null,
          classe: l.classe_prefixo_ana as ClassePrefixoAna,
          sugestao: l.sugestao_prefixo_ana,
          statusRevisao: revisoes.get(l.prefixo) ?? 'pendente',
        }));
    } catch (e) {
      throw new FalhaRepositorio('listarPrefixosAnaDesconformes', e);
    }
  },

  async listarArquivosOrfaos() {
    return buscarArquivosPorCategoria('PREFIXO_DESCONHECIDO', 'ARQUIVO_ORFAO');
  },

  async listarArquivosMalformados() {
    return buscarArquivosPorCategoria('NOME_FORA_DO_PADRAO', 'ARQUIVO_MALFORMADO');
  },

  async contar() {
    try {
      const [prefPrincipal, prefAna, orfaos, malformados] = await Promise.all([
        sql<{ total: string }[]>`
          SELECT COUNT(*)::text AS total
            FROM v_postos_desconformes
           WHERE classe_prefixo NOT LIKE 'conforme_%'
        `,
        sql<{ total: string }[]>`
          SELECT COUNT(*)::text AS total
            FROM v_postos_desconformes
           WHERE classe_prefixo_ana IN ('faltando_zero_esquerda','outlier_ana')
        `,
        sql<{ total: string }[]>`
          SELECT COUNT(*)::text AS total
            FROM arquivos_orfaos
           WHERE categoria = 'PREFIXO_DESCONHECIDO'
        `,
        sql<{ total: string }[]>`
          SELECT COUNT(*)::text AS total
            FROM arquivos_orfaos
           WHERE categoria = 'NOME_FORA_DO_PADRAO'
        `,
      ]);

      const contagens: ContagensDesconformidade = {
        prefixoPrincipal: Number(prefPrincipal[0]?.total ?? 0),
        prefixoAna: Number(prefAna[0]?.total ?? 0),
        arquivosOrfaos: Number(orfaos[0]?.total ?? 0),
        arquivosMalformados: Number(malformados[0]?.total ?? 0),
      };
      return contagens;
    } catch (e) {
      throw new FalhaRepositorio('contarDesconformidades', e);
    }
  },
};

async function buscarArquivosPorCategoria(
  categoriaBanco: CategoriaArquivoOrfao,
  categoriaRevisao: 'ARQUIVO_ORFAO' | 'ARQUIVO_MALFORMADO',
): Promise<ArquivoDesconforme[]> {
  try {
    const linhas = await sql<LinhaArquivoOrfao[]>`
      SELECT o.id, o.nome_arquivo, o.caminho_absoluto, o.tamanho_bytes::text,
             o.data_modificacao, o.categoria, o.tipo_dado,
             r.status AS status_revisao
        FROM arquivos_orfaos o
        LEFT JOIN revisoes_desconformidade r
          ON r.tipo_entidade = 'arquivo'
         AND r.id_entidade   = o.caminho_absoluto
         AND r.categoria     = ${categoriaRevisao}
       WHERE o.categoria = ${categoriaBanco}
       ORDER BY o.data_modificacao DESC
       LIMIT 500
    `;
    return linhas.map<ArquivoDesconforme>((l) => ({
      id: l.id,
      nomeArquivo: l.nome_arquivo,
      caminhoAbsoluto: l.caminho_absoluto,
      tamanhoBytes: Number(l.tamanho_bytes),
      dataModificacao: l.data_modificacao,
      categoria: l.categoria,
      tipoDado: l.tipo_dado,
      statusRevisao: l.status_revisao ?? 'pendente',
    }));
  } catch (e) {
    throw new FalhaRepositorio(`listarArquivosPorCategoria:${categoriaBanco}`, e);
  }
}

async function buscarRevisoes(
  tipoEntidade: 'posto' | 'arquivo',
  ids: string[],
  categoria: 'PREFIXO_PRINCIPAL' | 'PREFIXO_ANA' | 'ARQUIVO_ORFAO' | 'ARQUIVO_MALFORMADO',
): Promise<Map<string, 'pendente' | 'revisado'>> {
  const linhas = await sql<{ id_entidade: string; status: 'pendente' | 'revisado' }[]>`
    SELECT id_entidade, status
      FROM revisoes_desconformidade
     WHERE tipo_entidade = ${tipoEntidade}
       AND categoria     = ${categoria}
       AND id_entidade   IN ${sql(ids)}
  `;
  const mapa = new Map<string, 'pendente' | 'revisado'>();
  for (const l of linhas) {
    mapa.set(l.id_entidade, l.status);
  }
  return mapa;
}
