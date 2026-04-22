import { desconformidadesRepository } from '@/infrastructure/repositories';
import { TabelaPrefixosAna } from '@/components/features/desconformidades/TabelaPrefixosAna';
import { Alerta } from '@/components/ui/Alerta';

export const dynamic = 'force-dynamic';

export default async function PaginaPrefixoAna() {
  try {
    const itens = await desconformidadesRepository.listarPrefixosAnaDesconformes();
    return (
      <section
        role="tabpanel"
        id="painel-prefixo-ana"
        aria-labelledby="aba-prefixo-ana"
        className="space-y-4"
      >
        <p className="text-sm text-gov-texto">
          Verificamos <strong>{itens.length.toLocaleString('pt-BR')}</strong>{' '}
          postos com código da ANA fora do padrão oficial (8 dígitos).
          A correção sugerida é preencher os dígitos faltantes à esquerda.
        </p>
        <TabelaPrefixosAna itens={itens} />
      </section>
    );
  } catch {
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar desconformidades de prefixo ANA">
        Não foi possível recuperar a listagem. Tente novamente em instantes.
      </Alerta>
    );
  }
}
