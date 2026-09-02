import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { FormularioFichaMobile } from '@/components/mobile/FormularioFichaMobile';
import { SCHEMAS_FICHA } from '@/domain/fichas/schemas';
import { CODIGOS_TIPO_DOCUMENTO } from '@/domain/tipo-documento';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';
import { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';

/**
 * Tela de nova ficha (US-MOB-004 + US-MOB-005).
 *
 * Server Component:
 *  - valida `[tipo]` (1..7)
 *  - obtém o usuário (técnico) — middleware já garante login, mas
 *    repassamos `id` e nome sugerido pro Client Component
 *  - delega o renderer do formulário pro `FormularioFichaMobile`
 *
 * O Client Component cuida de auto-save, GPS, foto, validação dupla e
 * submissão idempotente via `POST /api/app/fichas`.
 */
export default async function NovaFichaPage({
  params,
}: {
  params: Promise<{ prefixo: string; tipo: string }>;
}) {
  const { prefixo: prefixoRaw, tipo } = await params;
  const prefixo = decodeURIComponent(prefixoRaw);
  const codigoNumero = Number(tipo);

  const ehCodigoValido = (n: number): n is CodigoTipoDocumento =>
    CODIGOS_TIPO_DOCUMENTO.includes(n as CodigoTipoDocumento);

  if (!Number.isInteger(codigoNumero) || !ehCodigoValido(codigoNumero)) {
    return (
      <>
        <HeaderMobile titulo="Tipo de ficha inválido" voltarHref="/app" />
        <div className="px-safe mx-auto w-full max-w-content py-4">
          <div
            role="alert"
            className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            Tipo de ficha desconhecido: <code>{tipo}</code>.
          </div>
          <Link
            href="/app"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded border border-app-border px-3 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
          >
            Voltar ao início
          </Link>
        </div>
      </>
    );
  }

  const schema = SCHEMAS_FICHA[codigoNumero];

  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    // Middleware deveria ter pego antes; defensivo.
    redirect(`/login?returnTo=/app/postos/${encodeURIComponent(prefixo)}/fichas/nova/${codigoNumero}`);
  }

  const semIdentidade = usuario.id === USUARIO_SEM_IDENTIDADE.id;
  // Sem identificação, o campo nasce VAZIO. Pré-preencher com o nome do
  // usuário institucional gravaria "Acesso sem identificação" no lugar do
  // autor, ou seja, a ausência de identidade viraria a identidade do
  // registro, que é exatamente o contrário do que a ficha precisa neste
  // estado: aqui o nome digitado é a única autoria que vai existir.
  const tecnicoNomeSugerido = semIdentidade
    ? ''
    : usuario.nome ?? usuario.email.split('@')[0] ?? 'técnico';

  return (
    <>
      <HeaderMobile
        titulo={schema.rotulo}
        subtitulo={`Posto ${prefixo}`}
        voltarHref={`/app/postos?tipo=${codigoNumero}`}
      />
      <div className="px-safe mx-auto w-full max-w-content pb-6 pt-4">
        <FormularioFichaMobile
          schema={schema}
          prefixo={prefixo}
          usuarioId={usuario.id}
          tecnicoNomeSugerido={tecnicoNomeSugerido}
          semIdentidade={semIdentidade}
        />
      </div>
    </>
  );
}
