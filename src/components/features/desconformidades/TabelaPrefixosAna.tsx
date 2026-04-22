import type { DesconformidadePrefixoAna } from '@/domain/desconformidade';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { BotaoMarcarRevisado } from './BotaoMarcarRevisado';

const DESCRICAO_CLASSE: Record<DesconformidadePrefixoAna['classe'], string> = {
  faltando_zero_esquerda: 'Faltando zero à esquerda (7 dígitos em vez dos 8 oficiais)',
  outlier_ana: 'Outlier — quantidade de dígitos fora do padrão',
};

export function TabelaPrefixosAna({
  itens,
}: {
  itens: readonly DesconformidadePrefixoAna[];
}) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma desconformidade de prefixo ANA"
        descricao="Todos os códigos ANA preenchidos aderem ao padrão oficial de 8 dígitos."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Postos com prefixo ANA fora do padrão oficial de 8 dígitos.
        </caption>
        <thead>
          <tr className="bg-gov-superficie text-left text-sm">
            <th scope="col" className="p-3 border-b border-gov-borda">Prefixo</th>
            <th scope="col" className="p-3 border-b border-gov-borda">ANA atual</th>
            <th scope="col" className="p-3 border-b border-gov-borda">ANA sugerido</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Classe</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Ação</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id} className="border-b border-gov-borda">
              <td className="p-3 font-mono text-gov-azul">{item.prefixo}</td>
              <td className="p-3 font-mono text-sm">{item.prefixoAnaAtual ?? '—'}</td>
              <td className="p-3 font-mono text-sm text-gov-sucesso">
                {item.prefixoAnaSugerido ?? '—'}
              </td>
              <td className="p-3 text-sm">{DESCRICAO_CLASSE[item.classe]}</td>
              <td className="p-3">
                <BotaoMarcarRevisado
                  tipoEntidade="posto"
                  idEntidade={item.prefixo}
                  categoria="PREFIXO_ANA"
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
