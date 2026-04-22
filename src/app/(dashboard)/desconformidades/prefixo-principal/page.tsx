import { desconformidadesRepository } from '@/infrastructure/repositories';
import { TabelaPrefixosPrincipais } from '@/components/features/desconformidades/TabelaPrefixosPrincipais';
import { Alerta } from '@/components/ui/Alerta';

export const dynamic = 'force-dynamic';

export default async function PaginaPrefixoPrincipal() {
  try {
    const itens = await desconformidadesRepository.listarPrefixosPrincipaisDesconformes();
    return (
      <section
        role="tabpanel"
        id="painel-prefixo-principal"
        aria-labelledby="aba-prefixo-principal"
        className="space-y-4"
      >
        <p className="text-sm text-gov-texto">
          Verificamos <strong>{itens.length.toLocaleString('pt-BR')}</strong>{' '}
          postos cujo prefixo principal diverge das regex oficiais por tipo de
          dado. Para cada linha, apresentamos a classe do problema e uma
          sugestão textual de correção para orientar a revisão na planilha-fonte.
        </p>
        <TabelaPrefixosPrincipais itens={itens} />
      </section>
    );
  } catch {
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar desconformidades de prefixo principal">
        Não foi possível recuperar a listagem. Tente novamente em instantes.
      </Alerta>
    );
  }
}
