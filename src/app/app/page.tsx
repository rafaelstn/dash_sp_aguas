import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { CardTipoFicha } from '@/components/mobile/CardTipoFicha';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { SCHEMAS_FICHA } from '@/domain/fichas/schemas';
import { CODIGOS_TIPO_DOCUMENTO } from '@/domain/tipo-documento';

/**
 * Home do app — grade de tipos de ficha disponíveis. US-MOB-002.
 *
 * Atende fluxo "técnico abre app → vê grade de cards → seleciona tipo →
 * navega para a busca de posto" descrito em `docs/spec-modulo-mobile.md` §2.
 *
 * Por enquanto o card leva direto para `/app/postos?tipo=<codigo>`
 * (busca de posto). As descrições abaixo são definitivas (Sprint 1.S3,
 * Camila — auditoria de copy formal SPÁguas) e devem ser atualizadas
 * apenas quando o cliente sinalizar mudança de escopo.
 */

const DESCRICOES_TIPO_FICHA: Record<number, string> = {
  1: 'Caracterização do posto: estação, bacia, acesso e infraestrutura.',
  2: 'Configuração e parâmetros operacionais da PCD do posto.',
  3: 'Situação do posto, leituras e serviços executados em campo.',
  4: 'Cotas das RNs e das réguas do posto, com erro de fechamento.',
  5: 'Seção transversal do curso d’água: largura, profundidade, verticais.',
  6: 'Substituição do observador responsável pelo posto.',
  7: 'Medição de descarga líquida com molinete, ADCP ou flutuador.',
};

export default async function MobileHomePage() {
  const usuario = await obterUsuarioAtual();
  const nome = usuario?.nome ?? usuario?.email?.split('@')[0] ?? 'técnico';

  return (
    <>
      <HeaderMobile
        titulo="Selecionar tipo de ficha"
        subtitulo={`Sessão de ${nome}`}
        acaoDireita={
          <a
            href="/auth/sair"
            className="min-h-[44px] rounded px-2 py-2 text-xs font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          >
            Sair
          </a>
        }
      />

      <div className="mx-auto w-full max-w-content px-4 py-5">
        <p className="mb-4 text-xs text-app-fg-muted">
          Selecione o tipo de ficha a preencher. O posto será informado na
          próxima etapa.
        </p>

        <ul
          className="grid grid-cols-2 gap-3 md:grid-cols-3"
          aria-label="Tipos de ficha disponíveis"
        >
          {CODIGOS_TIPO_DOCUMENTO.map((codigo) => {
            const schema = SCHEMAS_FICHA[codigo];
            return (
              <li key={codigo}>
                <CardTipoFicha
                  codigo={codigo}
                  rotulo={schema.rotulo}
                  descricao={DESCRICOES_TIPO_FICHA[codigo]}
                  href={`/app/postos?tipo=${codigo}`}
                  disponivel={schema.disponivel}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
