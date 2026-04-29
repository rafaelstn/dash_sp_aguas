import Link from 'next/link';
import type { FichaVisita } from '@/domain/ficha-visita';
import type { CampoFicha, SchemaFicha } from '@/domain/fichas/schemas';
import { TIPOS_DOCUMENTO } from '@/domain/tipo-documento';
import { BotoesAcaoFicha } from './BotoesAcaoFicha';

export interface DetalheFichaProps {
  prefixo: string;
  ficha: FichaVisita;
  schema: SchemaFicha;
}

/**
 * Visualização read-only de uma ficha. Mostra metadados (técnico, data,
 * coords) + cada seção do schema com os valores preenchidos. Campos
 * vazios mostram "—" pra deixar claro que não foram informados.
 */
export function DetalheFicha({ prefixo, ficha, schema }: DetalheFichaProps) {
  const tipo = TIPOS_DOCUMENTO[ficha.codTipoDocumento];

  return (
    <article className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border-subtle pb-2">
        <div>
          <p className="text-2xs uppercase tracking-wider text-app-fg-subtle">
            {tipo?.rotulo ?? `Tipo ${ficha.codTipoDocumento}`}
          </p>
          <h1 className="text-xl font-semibold text-app-fg">
            Visita em {ficha.dataVisita.toLocaleDateString('pt-BR')}
          </h1>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            {ficha.tecnicoNome} · enviada em{' '}
            {ficha.criadaEm.toLocaleString('pt-BR')}
          </p>
        </div>
        <BotoesAcaoFicha prefixo={prefixo} fichaId={ficha.id} />
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 text-sm font-semibold text-app-fg">
          Identificação
        </h2>
        <Item rotulo="Data" valor={ficha.dataVisita.toLocaleDateString('pt-BR')} />
        <Item rotulo="Técnico" valor={ficha.tecnicoNome} />
        <Item rotulo="Hora de início" valor={ficha.horaInicio?.slice(0, 5) ?? '—'} />
        <Item rotulo="Hora de término" valor={ficha.horaFim?.slice(0, 5) ?? '—'} />
        <Item
          rotulo="Latitude (GPS)"
          valor={ficha.latitudeCapturada !== null ? ficha.latitudeCapturada.toFixed(6) : '—'}
        />
        <Item
          rotulo="Longitude (GPS)"
          valor={ficha.longitudeCapturada !== null ? ficha.longitudeCapturada.toFixed(6) : '—'}
        />
      </section>

      {schema.secoes.map((secao) => (
        <section key={secao.titulo} className="grid gap-3 sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-sm font-semibold text-app-fg">
            {secao.titulo}
          </h2>
          {secao.campos.map((campo) => (
            <Item
              key={campo.chave}
              rotulo={campo.rotulo}
              valor={formatarValor(campo, ficha.dados[campo.chave])}
            />
          ))}
        </section>
      ))}

      {ficha.observacoes && (
        <section>
          <h2 className="text-sm font-semibold text-app-fg">
            Observações gerais
          </h2>
          <p className="mt-1 whitespace-pre-wrap rounded border border-app-border-subtle bg-app-surface p-3 text-sm text-app-fg">
            {ficha.observacoes}
          </p>
        </section>
      )}

      <footer className="flex flex-wrap items-center gap-3 border-t border-app-border-subtle pt-3 text-xs text-app-fg-muted">
        <span>Origem: {ficha.origem}</span>
        <span>Status: {ficha.status}</span>
        <Link
          href={`/postos/${encodeURIComponent(prefixo)}`}
          className="ml-auto text-gov-azul hover:underline"
        >
          ← Voltar para o posto
        </Link>
      </footer>
    </article>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded border border-app-border-subtle bg-app-surface p-2.5">
      <dt className="text-2xs uppercase tracking-wider text-app-fg-subtle">
        {rotulo}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-app-fg break-words">
        {valor}
      </dd>
    </div>
  );
}

function formatarValor(campo: CampoFicha, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  switch (campo.tipo) {
    case 'checkbox':
      return valor ? 'Sim' : 'Não';
    case 'select': {
      const opcao = campo.opcoes?.find((o) => o.valor === valor);
      return opcao ? opcao.rotulo : String(valor);
    }
    case 'numero':
      return campo.unidade
        ? `${valor} ${campo.unidade}`
        : String(valor);
    default:
      return String(valor);
  }
}
