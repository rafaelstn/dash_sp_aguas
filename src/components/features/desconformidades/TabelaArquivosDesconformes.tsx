import type { ArquivoDesconforme } from '@/domain/desconformidade';
import { formatarDataHora, formatarTamanho } from '@/lib/format';
import { rotuloTipoDado } from '@/domain/tipo-dado';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { BotaoMarcarRevisado } from './BotaoMarcarRevisado';

export interface TabelaArquivosDesconformesProps {
  itens: readonly ArquivoDesconforme[];
  categoria: 'ARQUIVO_ORFAO' | 'ARQUIVO_MALFORMADO';
  tituloVazio: string;
  descricaoVazia: string;
}

const DESCRICAO_CATEGORIA: Record<ArquivoDesconforme['categoria'], string> = {
  PREFIXO_DESCONHECIDO: 'Nome adere ao padrão, porém o prefixo não foi localizado em postos cadastrados.',
  NOME_FORA_DO_PADRAO: 'Nome do arquivo não adere à regex oficial do cliente.',
  EXTENSAO_NAO_PDF: 'Extensão de arquivo não suportada.',
};

export function TabelaArquivosDesconformes({
  itens,
  categoria,
  tituloVazio,
  descricaoVazia,
}: TabelaArquivosDesconformesProps) {
  if (itens.length === 0) {
    return <EstadoVazio titulo={tituloVazio} descricao={descricaoVazia} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Arquivos identificados como desconformes pelo worker de indexação.
        </caption>
        <thead>
          <tr className="bg-gov-superficie text-left text-sm">
            <th scope="col" className="p-3 border-b border-gov-borda">Arquivo</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Tipo de dado</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Caminho</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Metadados</th>
            <th scope="col" className="p-3 border-b border-gov-borda">Ação</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id} className="border-b border-gov-borda align-top">
              <td className="p-3 text-sm font-medium text-gov-texto break-words max-w-xs">
                {item.nomeArquivo}
                <p className="text-xs text-gov-muted mt-1">
                  {DESCRICAO_CATEGORIA[item.categoria]}
                </p>
              </td>
              <td className="p-3 text-sm">{rotuloTipoDado(item.tipoDado)}</td>
              <td className="p-3 text-xs font-mono text-gov-muted break-all max-w-md">
                {item.caminhoAbsoluto}
              </td>
              <td className="p-3 text-xs text-gov-muted">
                <div>{formatarTamanho(item.tamanhoBytes)}</div>
                <div>{formatarDataHora(item.dataModificacao)}</div>
              </td>
              <td className="p-3">
                <BotaoMarcarRevisado
                  tipoEntidade="arquivo"
                  idEntidade={item.caminhoAbsoluto}
                  categoria={categoria}
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
