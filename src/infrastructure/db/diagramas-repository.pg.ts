import 'server-only';
import type { DiagramasRepository } from '@/application/ports/diagramas-repository';
import type {
  Diagrama,
  DiagramaResumo,
  NovoDiagrama,
} from '@/domain/diagramas/diagrama';
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';
import { DiagramaNaoEncontrado, FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

type LinhaResumo = {
  id: string;
  nome: string;
  bacia: string | null;
  atualizado_em: Date;
};

type LinhaCompleta = LinhaResumo & {
  descricao: string | null;
  elementos: ElementoDiagrama[];
  criado_por: string | null;
  criado_em: Date;
};

function mapearResumo(linha: LinhaResumo): DiagramaResumo {
  return {
    id: linha.id,
    nome: linha.nome,
    bacia: linha.bacia,
    atualizadoEm: linha.atualizado_em,
  };
}

function mapearCompleto(linha: LinhaCompleta): Diagrama {
  return {
    id: linha.id,
    nome: linha.nome,
    bacia: linha.bacia,
    descricao: linha.descricao,
    // postgres.js já desserializa jsonb; defensivo contra null legado.
    elementos: Array.isArray(linha.elementos) ? linha.elementos : [],
    criadoPor: linha.criado_por,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
  };
}

export const diagramasRepository: DiagramasRepository = {
  async listar() {
    try {
      const linhas = await sql<LinhaResumo[]>`
        SELECT id, nome, bacia, atualizado_em
          FROM diagramas
         ORDER BY atualizado_em DESC
      `;
      return linhas.map(mapearResumo);
    } catch (e) {
      throw new FalhaRepositorio('diagramas.listar', e);
    }
  },

  async obter(id) {
    try {
      const linhas = await sql<LinhaCompleta[]>`
        SELECT id, nome, bacia, descricao, elementos,
               criado_por, criado_em, atualizado_em
          FROM diagramas
         WHERE id = ${id}::uuid
      `;
      const linha = linhas[0];
      return linha ? mapearCompleto(linha) : null;
    } catch (e) {
      throw new FalhaRepositorio('diagramas.obter', e);
    }
  },

  async criar(dados: NovoDiagrama, criadoPor) {
    try {
      const elementos = dados.elementos ?? [];
      const linhas = await sql<LinhaCompleta[]>`
        INSERT INTO diagramas (nome, bacia, descricao, elementos, criado_por)
        VALUES (
          ${dados.nome},
          ${dados.bacia ?? null},
          ${dados.descricao ?? null},
          ${JSON.stringify(elementos)}::jsonb,
          ${criadoPor}::uuid
        )
        RETURNING id, nome, bacia, descricao, elementos,
                  criado_por, criado_em, atualizado_em
      `;
      const linha = linhas[0];
      if (!linha) throw new FalhaRepositorio('diagramas.criar', 'INSERT sem RETURNING');
      return mapearCompleto(linha);
    } catch (e) {
      if (e instanceof FalhaRepositorio) throw e;
      throw new FalhaRepositorio('diagramas.criar', e);
    }
  },

  async renomear(id, nome) {
    try {
      const linhas = await sql<{ id: string }[]>`
        UPDATE diagramas SET nome = ${nome}
         WHERE id = ${id}::uuid
         RETURNING id
      `;
      if (linhas.length === 0) {
        throw new DiagramaNaoEncontrado(id);
      }
    } catch (e) {
      if (e instanceof DiagramaNaoEncontrado) throw e;
      throw new FalhaRepositorio('diagramas.renomear', e);
    }
  },

  async duplicar(id, criadoPor) {
    try {
      // Copia em uma transação curta: lê a origem e insere a cópia. O nome
      // ganha sufixo " (cópia)"; os elementos são reaproveitados tal qual.
      return await sql.begin(async (tx) => {
        const origem = await tx<
          { nome: string; bacia: string | null; descricao: string | null; elementos: ElementoDiagrama[] }[]
        >`
          SELECT nome, bacia, descricao, elementos
            FROM diagramas
           WHERE id = ${id}::uuid
        `;
        const base = origem[0];
        if (!base) {
          throw new DiagramaNaoEncontrado(id);
        }
        const elementos = Array.isArray(base.elementos) ? base.elementos : [];
        const inserida = await tx<LinhaCompleta[]>`
          INSERT INTO diagramas (nome, bacia, descricao, elementos, criado_por)
          VALUES (
            ${`${base.nome} (cópia)`},
            ${base.bacia},
            ${base.descricao},
            ${JSON.stringify(elementos)}::jsonb,
            ${criadoPor}::uuid
          )
          RETURNING id, nome, bacia, descricao, elementos,
                    criado_por, criado_em, atualizado_em
        `;
        const linha = inserida[0];
        if (!linha) throw new FalhaRepositorio('diagramas.duplicar', 'INSERT sem RETURNING');
        return mapearCompleto(linha);
      });
    } catch (e) {
      if (e instanceof DiagramaNaoEncontrado) throw e;
      throw new FalhaRepositorio('diagramas.duplicar', e);
    }
  },

  async salvarElementos(id, elementos) {
    try {
      const linhas = await sql<{ id: string }[]>`
        UPDATE diagramas SET elementos = ${JSON.stringify(elementos)}::jsonb
         WHERE id = ${id}::uuid
         RETURNING id
      `;
      if (linhas.length === 0) {
        throw new DiagramaNaoEncontrado(id);
      }
    } catch (e) {
      if (e instanceof DiagramaNaoEncontrado) throw e;
      throw new FalhaRepositorio('diagramas.salvarElementos', e);
    }
  },

  async excluir(id) {
    try {
      const linhas = await sql<{ id: string }[]>`
        DELETE FROM diagramas
         WHERE id = ${id}::uuid
         RETURNING id
      `;
      if (linhas.length === 0) {
        throw new DiagramaNaoEncontrado(id);
      }
    } catch (e) {
      if (e instanceof DiagramaNaoEncontrado) throw e;
      throw new FalhaRepositorio('diagramas.excluir', e);
    }
  },
};
