'use client';

import { useEffect } from 'react';
import type { FichaVisita } from '@/domain/ficha-visita';
import type { Posto } from '@/domain/posto';
import type { CampoFicha, SchemaFicha } from '@/domain/fichas/schemas';
import { TIPOS_DOCUMENTO } from '@/domain/tipo-documento';

export interface TemplateImpressaoProps {
  ficha: FichaVisita;
  posto: Posto;
  schema: SchemaFicha;
  /** Quando true, abre o diálogo de impressão automaticamente após render. */
  imprimirAoCarregar?: boolean;
}

/**
 * Template otimizado pra impressão / "Salvar como PDF". Layout sóbrio
 * (governo) inspirado no modelo FCTH original — cabeçalho institucional,
 * tabelas com bordas, marca d'água sutil de origem, rodapé com técnico
 * e timestamps.
 *
 * Estilo `@media print`:
 *   - oculta navegação/footer do app (classe `.so-tela`)
 *   - força A4, margens razoáveis
 *   - quebras de página entre seções principais
 *   - cores em preto puro pra economia de toner
 *
 * Por que `'use client'`: precisamos do `useEffect` pra disparar
 * `window.print()` quando `imprimirAoCarregar` está ligado, e do
 * `<button>` que chama `window.print()` direto.
 */
export function TemplateImpressao({
  ficha,
  posto,
  schema,
  imprimirAoCarregar = false,
}: TemplateImpressaoProps) {
  useEffect(() => {
    if (!imprimirAoCarregar) return;
    // Pequeno delay pra dar tempo do browser pintar antes do print dialog.
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, [imprimirAoCarregar]);

  const tipo = TIPOS_DOCUMENTO[ficha.codTipoDocumento];

  return (
    <>
      <style>{`
        @page { size: A4; margin: 16mm 14mm; }
        @media print {
          html, body { background: white !important; }
          .so-tela { display: none !important; }
          .pagina-impressao {
            color: #000 !important;
            font-size: 10pt;
          }
          .pagina-impressao h1, .pagina-impressao h2, .pagina-impressao h3 {
            color: #000 !important;
          }
          .secao-impressao { page-break-inside: avoid; }
          .quebra-pagina { page-break-before: always; }
          a { color: #000 !important; text-decoration: none !important; }
        }
        .pagina-impressao {
          font-family: ui-sans-serif, system-ui, sans-serif;
          color: #1f2937;
          background: #fff;
          max-width: 210mm;
          margin: 0 auto;
          padding: 8mm;
        }
        .pagina-impressao h1 { font-size: 14pt; margin: 0; font-weight: 700; }
        .pagina-impressao h2 {
          font-size: 11pt;
          margin: 14pt 0 6pt;
          padding-bottom: 2pt;
          border-bottom: 1px solid #94a3b8;
          font-weight: 600;
        }
        .impressao-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4pt 12pt;
        }
        .impressao-grid > div {
          border-bottom: 1px dotted #cbd5e1;
          padding: 2pt 0;
          font-size: 9.5pt;
        }
        .impressao-grid dt {
          font-size: 7.5pt;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
        }
        .impressao-grid dd {
          font-weight: 500;
          margin: 1pt 0 0;
        }
        .observacoes-impressao {
          margin-top: 8pt;
          padding: 6pt 8pt;
          border: 1px solid #cbd5e1;
          font-size: 9.5pt;
          white-space: pre-wrap;
          min-height: 12mm;
        }
        .cabecalho-impressao {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12pt;
          padding-bottom: 6pt;
          border-bottom: 2px solid #1e3a8a;
        }
        .cabecalho-impressao .gov-marca {
          font-size: 8pt;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #1e3a8a;
          font-weight: 700;
        }
        .cabecalho-impressao .doc-titulo {
          text-align: right;
          font-size: 10pt;
        }
        .rodape-impressao {
          margin-top: 12pt;
          padding-top: 4pt;
          border-top: 1px solid #94a3b8;
          font-size: 8pt;
          color: #64748b;
          display: flex;
          justify-content: space-between;
          gap: 8pt;
        }
      `}</style>

      <div className="so-tela mb-4 flex flex-wrap items-center gap-3 rounded border border-app-border-subtle bg-app-surface p-3 print:hidden">
        <p className="flex-1 text-xs text-app-fg-muted">
          Pré-visualização de impressão. Use <kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">P</kbd> e
          escolha <em>“Salvar como PDF”</em> como destino.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-gov-azul px-3 py-1.5 text-xs font-medium text-white hover:bg-gov-azul-escuro"
        >
          Imprimir / Salvar como PDF
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded border border-gov-borda bg-white px-3 py-1.5 text-xs font-medium text-gov-texto hover:bg-app-surface-2"
        >
          Fechar
        </button>
      </div>

      <article className="pagina-impressao">
        <header className="cabecalho-impressao">
          <div>
            <div className="gov-marca">Governo do Estado de São Paulo</div>
            <h1>SPÁguas — Ficha Técnica</h1>
            <p style={{ margin: '2pt 0 0', fontSize: '9pt', color: '#475569' }}>
              {tipo?.rotulo ?? `Tipo de documento ${ficha.codTipoDocumento}`}
            </p>
          </div>
          <div className="doc-titulo">
            <div style={{ fontSize: '8pt', color: '#64748b' }}>Posto</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '14pt', fontWeight: 700, color: '#1e3a8a' }}>
              {posto.prefixo}
            </div>
            {posto.nomeEstacao && (
              <div style={{ fontSize: '9pt', marginTop: '2pt' }}>
                {posto.nomeEstacao}
              </div>
            )}
          </div>
        </header>

        <section className="secao-impressao">
          <h2>Identificação da estação</h2>
          <dl className="impressao-grid">
            <Item rotulo="Prefixo" valor={posto.prefixo} />
            <Item rotulo="Nome da estação" valor={posto.nomeEstacao ?? '—'} />
            <Item rotulo="Município" valor={posto.municipio ?? '—'} />
            <Item rotulo="UGRHI" valor={posto.ugrhiNome ?? posto.ugrhiNumero ?? '—'} />
            <Item rotulo="Bacia" valor={posto.baciaHidrografica ?? '—'} />
            <Item rotulo="Curso d’água" valor={(posto as { cursoDagua?: string }).cursoDagua ?? '—'} />
            <Item rotulo="Tipo de posto" valor={posto.tipoPosto ?? '—'} />
            <Item rotulo="Mantenedor" valor={posto.mantenedor ?? '—'} />
            <Item
              rotulo="Latitude (cadastro)"
              valor={posto.latitude !== null ? posto.latitude.toFixed(6) : '—'}
            />
            <Item
              rotulo="Longitude (cadastro)"
              valor={posto.longitude !== null ? posto.longitude.toFixed(6) : '—'}
            />
          </dl>
        </section>

        <section className="secao-impressao">
          <h2>Dados da visita</h2>
          <dl className="impressao-grid">
            <Item
              rotulo="Data da visita"
              valor={ficha.dataVisita.toLocaleDateString('pt-BR')}
            />
            <Item rotulo="Técnico responsável" valor={ficha.tecnicoNome} />
            <Item
              rotulo="Hora de início"
              valor={ficha.horaInicio ? ficha.horaInicio.slice(0, 5) : '—'}
            />
            <Item
              rotulo="Hora de término"
              valor={ficha.horaFim ? ficha.horaFim.slice(0, 5) : '—'}
            />
            <Item
              rotulo="Lat. capturada (GPS)"
              valor={
                ficha.latitudeCapturada !== null
                  ? ficha.latitudeCapturada.toFixed(6)
                  : '—'
              }
            />
            <Item
              rotulo="Long. capturada (GPS)"
              valor={
                ficha.longitudeCapturada !== null
                  ? ficha.longitudeCapturada.toFixed(6)
                  : '—'
              }
            />
            <Item rotulo="Origem" valor={rotuloOrigem(ficha.origem)} />
            <Item rotulo="Status" valor={rotuloStatus(ficha.status)} />
          </dl>
        </section>

        {schema.secoes.map((secao) => (
          <section key={secao.titulo} className="secao-impressao">
            <h2>{secao.titulo}</h2>
            <dl className="impressao-grid">
              {secao.campos.map((campo) => (
                <Item
                  key={campo.chave}
                  rotulo={campo.rotulo}
                  valor={formatarValor(campo, ficha.dados[campo.chave])}
                />
              ))}
            </dl>
          </section>
        ))}

        {ficha.observacoes && (
          <section className="secao-impressao">
            <h2>Observações</h2>
            <div className="observacoes-impressao">{ficha.observacoes}</div>
          </section>
        )}

        <footer className="rodape-impressao">
          <span>
            Gerada em {new Date().toLocaleString('pt-BR')} pelo SPÁguas
          </span>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>
            Ficha #{ficha.id.slice(0, 8)}
          </span>
        </footer>
      </article>
    </>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

function formatarValor(campo: CampoFicha, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  switch (campo.tipo) {
    case 'checkbox':
      return valor ? '☒ Sim' : '☐ Não';
    case 'select': {
      const opcao = campo.opcoes?.find((o) => o.valor === valor);
      return opcao ? opcao.rotulo : String(valor);
    }
    case 'numero':
      return campo.unidade ? `${valor} ${campo.unidade}` : String(valor);
    default:
      return String(valor);
  }
}

function rotuloOrigem(o: FichaVisita['origem']): string {
  switch (o) {
    case 'web_simulada':
      return 'Web (simulada)';
    case 'app_campo':
      return 'App de campo';
    case 'importacao':
      return 'Importação';
  }
}

function rotuloStatus(s: FichaVisita['status']): string {
  switch (s) {
    case 'rascunho':
      return 'Rascunho';
    case 'enviada':
      return 'Enviada';
    case 'aprovada':
      return 'Aprovada';
  }
}
