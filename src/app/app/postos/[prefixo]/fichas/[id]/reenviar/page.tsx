import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { FormularioFichaMobile } from '@/components/mobile/FormularioFichaMobile';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { triagemRepository } from '@/infrastructure/repositories';
import { SCHEMAS_FICHA } from '@/domain/fichas/schemas';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

/**
 * Reenvio de ficha devolvida (US-MOB-006 + spec §4.3 devolvida → pendente).
 *
 * Server Component:
 *  - busca a ficha original pelo id
 *  - valida: ela é do técnico autenticado E está em estado `devolvida`
 *  - pré-popula o renderer com dados originais + motivo do aprovador
 *  - o renderer envia com `fichaOrigemId` no body — Lucas faz a transição
 *    no backend criando NOVA linha apontando pra original
 */

export const dynamic = 'force-dynamic';

export default async function ReenviarFichaPage({
  params,
}: {
  params: Promise<{ prefixo: string; id: string }>;
}) {
  const { prefixo: prefixoRaw, id } = await params;
  const prefixo = decodeURIComponent(prefixoRaw);

  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect(
      `/login?returnTo=/app/postos/${encodeURIComponent(prefixo)}/fichas/${encodeURIComponent(id)}/reenviar`,
    );
  }

  const ficha = await triagemRepository.obterPorId(id);

  if (!ficha) {
    return (
      <PaginaErroReenvio
        titulo="Ficha não encontrada"
        mensagem={`Não foi possível localizar a ficha ${id}.`}
      />
    );
  }

  if (ficha.tecnicoId !== usuario.id) {
    return (
      <PaginaErroReenvio
        titulo="Sem permissão para reenviar"
        mensagem="Esta ficha foi submetida por outro técnico."
      />
    );
  }

  if (ficha.estado !== 'devolvida') {
    return (
      <PaginaErroReenvio
        titulo="Esta ficha não está em devolução"
        mensagem={`Estado atual: ${ficha.estado}. Apenas fichas devolvidas podem ser reenviadas.`}
      />
    );
  }

  if (ficha.prefixo !== prefixo) {
    // Inconsistência de URL com a ficha real — redireciona para a URL canônica.
    redirect(
      `/app/postos/${encodeURIComponent(ficha.prefixo)}/fichas/${ficha.id}/reenviar`,
    );
  }

  const codigo = ficha.codTipoDocumento as CodigoTipoDocumento;
  const schema = SCHEMAS_FICHA[codigo];
  if (!schema) {
    return (
      <PaginaErroReenvio
        titulo="Tipo de ficha desconhecido"
        mensagem={`Código ${codigo} não corresponde a um tipo cadastrado.`}
      />
    );
  }

  const tecnicoNomeSugerido =
    ficha.tecnicoNome ||
    usuario.nome ||
    usuario.email.split('@')[0] ||
    'técnico';

  return (
    <>
      <HeaderMobile
        titulo={`Reenviar ${schema.rotulo}`}
        subtitulo={`Posto ${prefixo}`}
        voltarHref="/app/minhas-fichas"
      />
      <div className="mx-auto w-full max-w-content px-4 pb-24 pt-4">
        <FormularioFichaMobile
          schema={schema}
          prefixo={prefixo}
          usuarioId={usuario.id}
          tecnicoNomeSugerido={tecnicoNomeSugerido}
          fichaOrigemId={ficha.id}
          motivoDevolucao={ficha.motivoDecisao}
          dadosIniciais={ficha.dados}
          cabecalhoInicial={{
            dataVisita: ficha.dataVisita.toISOString().slice(0, 10),
            horaInicio: ficha.horaInicio,
            horaFim: ficha.horaFim,
            tecnicoNome: ficha.tecnicoNome,
            observacoes: ficha.observacoes,
            latitudeCapturada: ficha.latitudeCapturada,
            longitudeCapturada: ficha.longitudeCapturada,
            precisaoGpsM: ficha.precisaoGpsM,
            consentiuGps:
              ficha.latitudeCapturada !== null &&
              ficha.longitudeCapturada !== null,
          }}
        />
      </div>
    </>
  );
}

function PaginaErroReenvio({
  titulo,
  mensagem,
}: {
  titulo: string;
  mensagem: string;
}) {
  return (
    <>
      <HeaderMobile titulo={titulo} voltarHref="/app/minhas-fichas" />
      <div className="mx-auto w-full max-w-content px-4 py-4">
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {mensagem}
        </div>
        <Link
          href="/app/minhas-fichas"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded border border-app-border px-3 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
        >
          Voltar para Minhas fichas
        </Link>
      </div>
    </>
  );
}
