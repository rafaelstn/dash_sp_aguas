import 'server-only';
import type { FichasVisitaRepository } from '@/application/ports/fichas-visita-repository';
import type {
  FichaVisita,
  OrigemFicha,
  StatusFicha,
} from '@/domain/ficha-visita';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

type LinhaFicha = {
  id: string;
  prefixo: string;
  cod_tipo_documento: number;
  data_visita: Date;
  hora_inicio: string | null;
  hora_fim: string | null;
  tecnico_nome: string;
  tecnico_id: string | null;
  latitude_capturada: string | null;
  longitude_capturada: string | null;
  observacoes: string | null;
  dados: Record<string, unknown>;
  origem: string;
  status: string;
  criada_em: Date;
  atualizada_em: Date;
};

function mapear(linha: LinhaFicha): FichaVisita {
  return {
    id: linha.id,
    prefixo: linha.prefixo,
    codTipoDocumento: linha.cod_tipo_documento as CodigoTipoDocumento,
    dataVisita: linha.data_visita,
    horaInicio: linha.hora_inicio,
    horaFim: linha.hora_fim,
    tecnicoNome: linha.tecnico_nome,
    tecnicoId: linha.tecnico_id,
    latitudeCapturada:
      linha.latitude_capturada !== null ? Number(linha.latitude_capturada) : null,
    longitudeCapturada:
      linha.longitude_capturada !== null ? Number(linha.longitude_capturada) : null,
    observacoes: linha.observacoes,
    dados: linha.dados ?? {},
    origem: linha.origem as OrigemFicha,
    status: linha.status as StatusFicha,
    criadaEm: linha.criada_em,
    atualizadaEm: linha.atualizada_em,
  };
}

const COLUNAS_SELECT = sql`
  id, prefixo, cod_tipo_documento, data_visita, hora_inicio, hora_fim,
  tecnico_nome, tecnico_id, latitude_capturada, longitude_capturada,
  observacoes, dados, origem, status, criada_em, atualizada_em
`;

export const fichasVisitaRepository: FichasVisitaRepository = {
  async listarPorPosto(prefixo) {
    try {
      const linhas = await sql<LinhaFicha[]>`
        SELECT ${COLUNAS_SELECT} FROM fichas_visita
         WHERE prefixo = ${prefixo}
         ORDER BY data_visita DESC, criada_em DESC
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('fichas_visita.listarPorPosto', e);
    }
  },

  async listarPorPostoETipo(prefixo, codigo) {
    try {
      const linhas = await sql<LinhaFicha[]>`
        SELECT ${COLUNAS_SELECT} FROM fichas_visita
         WHERE prefixo = ${prefixo}
           AND cod_tipo_documento = ${codigo}
         ORDER BY data_visita DESC, criada_em DESC
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('fichas_visita.listarPorPostoETipo', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaFicha[]>`
        SELECT ${COLUNAS_SELECT} FROM fichas_visita
         WHERE id = ${id}::uuid
         LIMIT 1
      `;
      return linhas[0] ? mapear(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('fichas_visita.obterPorId', e);
    }
  },

  async criar(entrada) {
    try {
      const linhas = await sql<LinhaFicha[]>`
        INSERT INTO fichas_visita (
          prefixo, cod_tipo_documento, data_visita, hora_inicio, hora_fim,
          tecnico_nome, tecnico_id, latitude_capturada, longitude_capturada,
          observacoes, dados, origem, status
        ) VALUES (
          ${entrada.prefixo},
          ${entrada.codTipoDocumento},
          ${entrada.dataVisita.toISOString().slice(0, 10)},
          ${entrada.horaInicio},
          ${entrada.horaFim},
          ${entrada.tecnicoNome},
          ${entrada.tecnicoId}::uuid,
          ${entrada.latitudeCapturada},
          ${entrada.longitudeCapturada},
          ${entrada.observacoes},
          ${JSON.stringify(entrada.dados)}::jsonb,
          ${entrada.origem ?? 'web_simulada'},
          ${entrada.status ?? 'enviada'}
        )
        RETURNING ${COLUNAS_SELECT}
      `;
      const inserida = linhas[0];
      if (!inserida) throw new Error('INSERT não retornou linha');
      return mapear(inserida);
    } catch (e) {
      throw new FalhaRepositorio('fichas_visita.criar', e);
    }
  },

  async atualizar(id, entrada) {
    try {
      // Constrói SET dinâmico só com os campos enviados.
      const fragmentos: ReturnType<typeof sql>[] = [];
      if (entrada.dataVisita !== undefined) {
        fragmentos.push(
          sql`data_visita = ${entrada.dataVisita.toISOString().slice(0, 10)}`,
        );
      }
      if (entrada.horaInicio !== undefined)
        fragmentos.push(sql`hora_inicio = ${entrada.horaInicio}`);
      if (entrada.horaFim !== undefined)
        fragmentos.push(sql`hora_fim = ${entrada.horaFim}`);
      if (entrada.tecnicoNome !== undefined)
        fragmentos.push(sql`tecnico_nome = ${entrada.tecnicoNome}`);
      if (entrada.tecnicoId !== undefined)
        fragmentos.push(sql`tecnico_id = ${entrada.tecnicoId}::uuid`);
      if (entrada.latitudeCapturada !== undefined)
        fragmentos.push(sql`latitude_capturada = ${entrada.latitudeCapturada}`);
      if (entrada.longitudeCapturada !== undefined)
        fragmentos.push(sql`longitude_capturada = ${entrada.longitudeCapturada}`);
      if (entrada.observacoes !== undefined)
        fragmentos.push(sql`observacoes = ${entrada.observacoes}`);
      if (entrada.dados !== undefined)
        fragmentos.push(sql`dados = ${JSON.stringify(entrada.dados)}::jsonb`);
      if (entrada.origem !== undefined)
        fragmentos.push(sql`origem = ${entrada.origem}`);
      if (entrada.status !== undefined)
        fragmentos.push(sql`status = ${entrada.status}`);

      const primeiro = fragmentos[0];
      if (!primeiro) {
        // Nada pra atualizar — devolve a linha como está.
        const atual = await this.obterPorId(id);
        if (!atual) throw new Error(`Ficha ${id} não encontrada`);
        return atual;
      }

      // Monta `SET col1 = v1, col2 = v2, ...` intercalando vírgulas.
      let setClause = primeiro;
      for (let i = 1; i < fragmentos.length; i += 1) {
        const frag = fragmentos[i];
        if (!frag) continue;
        setClause = sql`${setClause}, ${frag}`;
      }

      const linhas = await sql<LinhaFicha[]>`
        UPDATE fichas_visita
           SET ${setClause}
         WHERE id = ${id}::uuid
         RETURNING ${COLUNAS_SELECT}
      `;
      const atualizada = linhas[0];
      if (!atualizada) throw new Error(`Ficha ${id} não encontrada`);
      return mapear(atualizada);
    } catch (e) {
      throw new FalhaRepositorio('fichas_visita.atualizar', e);
    }
  },

  async apagar(id) {
    try {
      await sql`DELETE FROM fichas_visita WHERE id = ${id}::uuid`;
    } catch (e) {
      throw new FalhaRepositorio('fichas_visita.apagar', e);
    }
  },
};
