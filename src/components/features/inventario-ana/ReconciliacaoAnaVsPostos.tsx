import Link from 'next/link';
import type { AnaRevisaoEstacao } from '@/domain/ana-revisao';
import type { Posto } from '@/domain/posto';

interface Props {
  estacao: AnaRevisaoEstacao;
  posto: Posto | null;
}

interface Campo {
  rotulo: string;
  ana: string | number | null;
  postos: string | number | null;
}

function formatar(v: string | number | null): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toString();
  return v;
}

function diferentes(a: string | number | null, b: string | number | null): boolean {
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  return String(a).trim() !== String(b).trim();
}

/**
 * Bloco "Reconciliação ANA × postos" — F3 da análise Fernanda.
 *
 * Mostra lado a lado o snapshot que a ANA mandou (cinza, read-only) vs
 * o que está em `postos` agora (azul, fonte da verdade). Campos com
 * divergência ganham fundo amarelo. Botão "Editar posto" direto no header
 * (não secundário).
 */
export function ReconciliacaoAnaVsPostos({ estacao, posto }: Props) {
  const campos: Campo[] = [
    {
      rotulo: 'Nome da estação',
      ana: estacao.nome,
      postos: posto?.nomeEstacao ?? null,
    },
    {
      rotulo: 'Código adicional (prefixo SP)',
      ana: estacao.codigoAdicional,
      postos: posto?.prefixo ?? null,
    },
    {
      rotulo: 'Latitude',
      ana: estacao.latitude,
      postos: posto?.latitude ?? null,
    },
    {
      rotulo: 'Longitude',
      ana: estacao.longitude,
      postos: posto?.longitude ?? null,
    },
    {
      rotulo: 'Município',
      ana: estacao.municipioNome,
      postos: posto?.municipio ?? null,
    },
    {
      rotulo: 'Bacia hidrográfica',
      ana: estacao.baciaNome,
      postos: posto?.baciaHidrografica ?? null,
    },
    {
      rotulo: 'Sub-bacia',
      ana: estacao.subbaciaNome,
      postos: posto?.subUgrhiNome ?? null,
    },
    {
      rotulo: 'Tipo de estação',
      ana: estacao.estacaoTipo,
      postos: posto?.tipoPosto ?? null,
    },
    {
      rotulo: 'Pluviômetro — fim de operação',
      ana: estacao.pluviometroFim,
      postos: posto?.anaPluviometroFim ?? null,
    },
    {
      rotulo: 'Telemetria — fim de operação',
      ana: estacao.telemetriaFim,
      postos: posto?.anaTelemetriaFim ?? null,
    },
  ];

  const camposComDiff = campos.filter((c) => diferentes(c.ana, c.postos));

  return (
    <section
      aria-labelledby="sec-reconciliacao"
      className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id="sec-reconciliacao"
            className="text-sm font-semibold text-app-fg"
          >
            Reconciliação ANA × Postos
          </h2>
          <p className="mt-0.5 text-2xs text-app-fg-muted">
            ANA é auditor. Postos é a fonte da verdade. Amarelo = SPÁguas já
            corrigiu este campo desde a planilha que a ANA mandou.
          </p>
        </div>
        {posto ? (
          <Link
            href={`/postos/${encodeURIComponent(posto.prefixo)}/editar`}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Editar posto {posto.prefixo}
          </Link>
        ) : (
          <span className="rounded bg-amber-100 px-2 py-1 text-2xs text-amber-900">
            Sem match em postos
          </span>
        )}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Comparação campo a campo entre o snapshot ANA e o cadastro atual
            em postos
          </caption>
          <thead>
            <tr className="bg-app-surface-2 text-left">
              <th
                scope="col"
                className="border-b border-app-border-subtle px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
              >
                Campo
              </th>
              <th
                scope="col"
                className="border-b border-app-border-subtle px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
              >
                <span aria-hidden="true">📋</span> O que ANA mandou (snapshot)
              </th>
              <th
                scope="col"
                className="border-b border-app-border-subtle px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
              >
                <span aria-hidden="true">✓</span> Postos (verdade)
              </th>
            </tr>
          </thead>
          <tbody>
            {campos.map((c) => {
              const div = diferentes(c.ana, c.postos);
              return (
                <tr
                  key={c.rotulo}
                  className={`border-b border-app-border-subtle last:border-0 ${div ? 'bg-yellow-50' : ''}`}
                >
                  <th
                    scope="row"
                    className="px-3 py-1.5 text-left text-xs font-medium text-app-fg-muted"
                  >
                    {c.rotulo}
                  </th>
                  <td className="px-3 py-1.5 text-sm text-app-fg-subtle">
                    {formatar(c.ana)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-sm ${div ? 'font-semibold text-app-fg' : 'text-app-fg'}`}
                  >
                    {posto ? formatar(c.postos) : <em className="text-app-fg-subtle">(sem cadastro SP)</em>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {posto && camposComDiff.length > 0 ? (
        <p className="mt-3 rounded border-l-4 border-yellow-500 bg-yellow-50 p-2 text-xs text-amber-900">
          <strong>{camposComDiff.length} campo(s)</strong> já foram corrigidos
          em postos. Sairão em amarelo na planilha exportada pra ANA.
        </p>
      ) : posto ? (
        <p className="mt-3 rounded border-l-4 border-green-600 bg-green-50 p-2 text-xs text-green-900">
          Todos os campos coincidem com a planilha ANA. Marque esta estação
          como revisada se quiser fechar o ciclo.
        </p>
      ) : null}
    </section>
  );
}
