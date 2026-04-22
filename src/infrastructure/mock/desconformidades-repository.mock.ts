import 'server-only';

import type { DesconformidadesRepository } from '@/application/ports/desconformidades-repository';
import type {
  ArquivoDesconforme,
  ClassePrefixo,
  ClassePrefixoAna,
  ContagensDesconformidade,
  DesconformidadePrefixo,
  DesconformidadePrefixoAna,
} from '@/domain/desconformidade';
import type { Posto } from '@/domain/posto';
import { TIPOS_DADO } from '@/domain/tipo-dado';
import {
  ARQUIVOS_ORFAOS_FIXTURES,
  POSTOS_FIXTURES,
  REVISOES_FIXTURES,
} from './fixtures';

/**
 * Adapter in-memory de DesconformidadesRepository (MODO DEMO).
 *
 * A classificação aplica as mesmas regex oficiais publicadas em
 * `src/domain/tipo-dado.ts` — o mesmo espelho usado pela view
 * `v_postos_desconformes` no banco. Assim o comportamento visual em modo
 * demo reflete fielmente o que o cliente verá no banco real.
 */

const REGEX_TIPOS_DADO: readonly RegExp[] = Object.values(TIPOS_DADO).map(
  (t) => new RegExp(t.regexPrefixo),
);

function prefixoPrincipalConforme(prefixo: string): boolean {
  return REGEX_TIPOS_DADO.some((r) => r.test(prefixo));
}

function classificarPrefixoPrincipal(posto: Posto): ClassePrefixo | null {
  if (prefixoPrincipalConforme(posto.prefixo)) return null;
  if (posto.prefixo.includes('?')) return 'placeholder_interrogacao';

  // Heurística: se trocar o primeiro par (letra <-> dígito) o prefixo
  // passa a casar com alguma regex, trata-se de troca de letra/dígito.
  if (posto.prefixo.length >= 2) {
    const c0 = posto.prefixo[0]!;
    const c1 = posto.prefixo[1]!;
    const invertido = c1 + c0 + posto.prefixo.slice(2);
    if (prefixoPrincipalConforme(invertido)) {
      return 'suspeita_troca_letra_digito';
    }
  }
  return 'outlier_prefixo';
}

function sugestaoPrefixoPrincipal(
  posto: Posto,
  classe: ClassePrefixo,
): string | null {
  switch (classe) {
    case 'suspeita_troca_letra_digito':
      return `Verificar se o prefixo deveria ser "${
        posto.prefixo[1]! + posto.prefixo[0]! + posto.prefixo.slice(2)
      }".`;
    case 'placeholder_interrogacao':
      return 'Substituir o caractere "?" pelo dígito/letra correspondente.';
    case 'outlier_prefixo':
      return 'Revisar o prefixo junto ao cliente — não casa com nenhum formato oficial.';
  }
}

function classificarPrefixoAna(
  posto: Posto,
): { classe: ClassePrefixoAna; sugerido: string | null } | null {
  const ana = posto.prefixoAna;
  if (!ana || ana.trim() === '') return null;
  if (/^[0-9]{8}$/.test(ana)) return null;
  if (/^[0-9]{1,7}$/.test(ana)) {
    return {
      classe: 'faltando_zero_esquerda',
      sugerido: ana.padStart(8, '0'),
    };
  }
  return { classe: 'outlier_ana', sugerido: null };
}

function statusRevisao(
  tipoEntidade: 'posto' | 'arquivo',
  idEntidade: string,
  categoria:
    | 'PREFIXO_PRINCIPAL'
    | 'PREFIXO_ANA'
    | 'ARQUIVO_ORFAO'
    | 'ARQUIVO_MALFORMADO',
): 'pendente' | 'revisado' {
  const achado = REVISOES_FIXTURES.find(
    (r) =>
      r.tipoEntidade === tipoEntidade &&
      r.idEntidade === idEntidade &&
      r.categoria === categoria,
  );
  return achado?.status ?? 'pendente';
}

export const desconformidadesRepository: DesconformidadesRepository = {
  async listarPrefixosPrincipaisDesconformes() {
    const itens: DesconformidadePrefixo[] = [];
    for (const p of POSTOS_FIXTURES) {
      const classe = classificarPrefixoPrincipal(p);
      if (!classe) continue;
      itens.push({
        id: p.id,
        prefixo: p.prefixo,
        classe,
        sugestao: sugestaoPrefixoPrincipal(p, classe),
        statusRevisao: statusRevisao('posto', p.prefixo, 'PREFIXO_PRINCIPAL'),
      });
    }
    return itens.sort((a, b) => a.prefixo.localeCompare(b.prefixo));
  },

  async listarPrefixosAnaDesconformes() {
    const itens: DesconformidadePrefixoAna[] = [];
    for (const p of POSTOS_FIXTURES) {
      const classificacao = classificarPrefixoAna(p);
      if (!classificacao) continue;
      itens.push({
        id: p.id,
        prefixo: p.prefixo,
        prefixoAnaAtual: p.prefixoAna,
        prefixoAnaSugerido: classificacao.sugerido,
        classe: classificacao.classe,
        sugestao:
          classificacao.classe === 'faltando_zero_esquerda'
            ? `Preencher zeros à esquerda: "${classificacao.sugerido}".`
            : 'Revisar o código ANA junto à base oficial da Agência Nacional de Águas.',
        statusRevisao: statusRevisao('posto', p.prefixo, 'PREFIXO_ANA'),
      });
    }
    return itens.sort((a, b) => a.prefixo.localeCompare(b.prefixo));
  },

  async listarArquivosOrfaos() {
    return listarOrfaosPorCategoria('PREFIXO_DESCONHECIDO', 'ARQUIVO_ORFAO');
  },

  async listarArquivosMalformados() {
    return listarOrfaosPorCategoria('NOME_FORA_DO_PADRAO', 'ARQUIVO_MALFORMADO');
  },

  async contar(): Promise<ContagensDesconformidade> {
    const prefixoPrincipal = POSTOS_FIXTURES.filter(
      (p) => classificarPrefixoPrincipal(p) !== null,
    ).length;
    const prefixoAna = POSTOS_FIXTURES.filter(
      (p) => classificarPrefixoAna(p) !== null,
    ).length;
    const arquivosOrfaos = ARQUIVOS_ORFAOS_FIXTURES.filter(
      (a) => a.categoria === 'PREFIXO_DESCONHECIDO',
    ).length;
    const arquivosMalformados = ARQUIVOS_ORFAOS_FIXTURES.filter(
      (a) => a.categoria === 'NOME_FORA_DO_PADRAO',
    ).length;
    return { prefixoPrincipal, prefixoAna, arquivosOrfaos, arquivosMalformados };
  },
};

function listarOrfaosPorCategoria(
  categoriaBanco: 'PREFIXO_DESCONHECIDO' | 'NOME_FORA_DO_PADRAO',
  categoriaRevisao: 'ARQUIVO_ORFAO' | 'ARQUIVO_MALFORMADO',
): ArquivoDesconforme[] {
  return ARQUIVOS_ORFAOS_FIXTURES
    .filter((a) => a.categoria === categoriaBanco)
    .slice()
    .sort((a, b) => b.dataModificacao.getTime() - a.dataModificacao.getTime())
    .slice(0, 500)
    .map<ArquivoDesconforme>((a) => ({
      ...a,
      statusRevisao: statusRevisao('arquivo', a.caminhoAbsoluto, categoriaRevisao),
    }));
}
