import type { DesconformidadePrefixo } from '@/domain/desconformidade';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { BotaoMarcarRevisado } from './BotaoMarcarRevisado';

const DESCRICAO_CLASSE: Record<DesconformidadePrefixo['classe'], string> = {
  suspeita_troca_letra_digito: 'Suspeita de inversão entre letra e dígito iniciais',
  placeholder_interrogacao: 'Placeholder com interrogação literal',
  outlier_prefixo: 'Outlier — prefixo fora de qualquer padrão oficial',
};

export function TabelaPrefixosPrincipais({
  itens,
}: {
  itens: readonly DesconformidadePrefixo[];
}) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma desconformidade de prefixo principal"
        descricao="Todos os prefixos principais cadastrados aderem ao padrão oficial."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Postos com prefixo principal fora do padrão oficial. Cada linha
          apresenta o prefixo atual, a classe do problema, a sugestão textual
          e a ação de marcação como revisado.
        </caption>
        <thead>
          <tr className="bg-gov-superficie text-left text-sm">
            <th scope="col" className="p-3 border-b border-gov-borda">Prefixo</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Classe do problema</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Sugestão de correção</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Ação</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id} className="border-b border-gov-borda">
              <td className="p-3 font-mono text-gov-azul">{item.prefixo}</td>
              <td className="p-3 text-sm">{DESCRICAO_CLASSE[item.classe]}</td>
              <td className="p-3 text-sm text-gov-texto">
                {item.sugestao ?? 'Sem sugestão automática.'}
              </td>
              <td className="p-3">
                <BotaoMarcarRevisado
                  tipoEntidade="posto"
                  idEntidade={item.prefixo}
                  categoria="PREFIXO_PRINCIPAL"
                  statusInicial={item.statusRevisao}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
