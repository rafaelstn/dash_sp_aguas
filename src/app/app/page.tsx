import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { CardTipoFicha } from '@/components/mobile/CardTipoFicha';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { SCHEMAS_FICHA } from '@/domain/fichas/schemas';
import { CODIGOS_TIPO_DOCUMENTO } from '@/domain/tipo-documento';

/**
 * Home do app — grade de tipos de ficha disponíveis. US-MOB-002.
 *
 * Atende fluxo "Técnico abre app → vê grade de cards → seleciona tipo →
 * navega pra busca de posto" descrito em `docs/spec-modulo-mobile.md` §2.
 *
 * Decisão: por enquanto o card leva direto pra `/app/postos?tipo=<codigo>`
 * (busca de posto). Pendência Fernanda Sprint 3: copy descritiva final
 * de cada card e ícone temático por tipo. As descrições abaixo são
 * placeholder explícito.
 */

const DESCRICOES_PLACEHOLDER: Record<number, string> = {
  1: 'Cadastro descritivo do posto: estrutura, equipamentos, observador.',
  2: 'Plataforma de Coleta de Dados — telemetria do posto.',
  3: 'Inspeção em campo: situação encontrada, leituras, fotos.',
  4: 'Levantamento de cotas via nivelamento topográfico.',
  5: 'Levantamento da seção transversal do curso d’água.',
  6: 'Registro de troca de observador responsável pelo posto.',
  7: 'Medição de vazão (descarga líquida) com molinete ou ADCP.',
};

export default async function MobileHomePage() {
  const usuario = await obterUsuarioAtual();
  const nome = usuario?.nome ?? usuario?.email?.split('@')[0] ?? 'Técnico';

  return (
    <>
      <HeaderMobile
        titulo="Selecionar ficha"
        subtitulo={`Olá, ${nome}`}
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
          Toque em um tipo para começar uma nova ficha. Você poderá escolher
          o posto na próxima tela.
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
                  descricao={DESCRICOES_PLACEHOLDER[codigo]}
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
