import Link from 'next/link';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { SCHEMAS_FICHA } from '@/domain/fichas/schemas';
import { CODIGOS_TIPO_DOCUMENTO } from '@/domain/tipo-documento';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

/**
 * Shell do formulário de ficha (US-MOB-004) — placeholder para Sprint 3.
 *
 * Fernanda implementa aqui o renderer dinâmico que lê
 * `SCHEMAS_FICHA[codigo].secoes` e gera os widgets.
 *
 * Esta versão exibe:
 *  - cabeçalho com prefixo do posto + tipo
 *  - resumo das seções/quantidades de campos do schema (debug visível)
 *  - botão de voltar
 *
 * Não persiste nada. Não envia nada.
 */
export default async function NovaFichaPage({
  params,
}: {
  params: Promise<{ prefixo: string; tipo: string }>;
}) {
  const { prefixo, tipo } = await params;
  const codigoNumero = Number(tipo);

  const ehCodigoValido = (
    n: number,
  ): n is CodigoTipoDocumento =>
    CODIGOS_TIPO_DOCUMENTO.includes(n as CodigoTipoDocumento);

  if (!Number.isInteger(codigoNumero) || !ehCodigoValido(codigoNumero)) {
    return (
      <>
        <HeaderMobile titulo="Tipo inválido" voltarHref="/app" />
        <div className="mx-auto w-full max-w-content px-4 py-4">
          <div
            role="alert"
            className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            Tipo de ficha desconhecido: <code>{tipo}</code>.
          </div>
        </div>
      </>
    );
  }

  const schema = SCHEMAS_FICHA[codigoNumero];
  const totalCampos = schema.secoes.reduce(
    (acc, secao) => acc + secao.campos.length,
    0,
  );

  return (
    <>
      <HeaderMobile
        titulo={schema.rotulo}
        subtitulo={`Posto ${prefixo}`}
        voltarHref={`/app/postos?tipo=${codigoNumero}`}
      />
      <div className="mx-auto w-full max-w-content space-y-4 px-4 py-5">
        <section
          aria-labelledby="resumo-ficha-titulo"
          className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
        >
          <h2
            id="resumo-ficha-titulo"
            className="text-md font-semibold text-app-fg"
          >
            {schema.rotulo}
          </h2>
          <p className="mt-1 text-xs text-app-fg-muted">
            {schema.secoes.length} seção
            {schema.secoes.length === 1 ? '' : 'ões'} · {totalCampos} campos
            no schema oficial.
          </p>

          <ul className="mt-3 space-y-1 text-sm text-app-fg">
            {schema.secoes.map((secao, idx) => (
              <li
                key={`${idx}-${secao.titulo}`}
                className="flex items-center justify-between border-b border-app-border-subtle py-1.5 last:border-0"
              >
                <span>{secao.titulo}</span>
                <span className="text-2xs text-app-fg-muted">
                  {secao.campos.length} campo
                  {secao.campos.length === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div
          role="status"
          className="rounded-gov-card border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-semibold">Em desenvolvimento (Sprint 3).</p>
          <p className="mt-1 text-xs">
            O formulário dinâmico será implementado por Fernanda. Esta tela
            é apenas o esqueleto de rota — a navegação e o layout PWA já
            estão prontos.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/app/postos?tipo=${codigoNumero}`}
            className="min-h-[44px] flex-1 inline-flex items-center justify-center rounded border border-app-border px-3 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
          >
            Trocar posto
          </Link>
          <Link
            href="/app"
            className="min-h-[44px] flex-1 inline-flex items-center justify-center rounded border border-app-border px-3 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    </>
  );
}
