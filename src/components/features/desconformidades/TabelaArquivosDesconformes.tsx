import type { ArquivoDesconforme } from '@/domain/desconformidade';
import { formatarDataHora, formatarTamanho } from '@/lib/format';
import { rotuloTipoDado } from '@/domain/tipo-dado';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { BotaoMarcarRevisado } from './BotaoMarcarRevisado';

export interface TabelaArquivosDesconformesProps {
  itens: readonly ArquivoDesconforme[];
  categoria: 'ARQUIVO_ORFAO' | 'ARQUIVO_MALFORMADO';
  tituloVazio: string;
  descricaoVazia: string;
}

const DESCRICAO_CATEGORIA: Record<ArquivoDesconforme['categoria'], string> = {
  PREFIXO_DESCONHECIDO:
    'Nome adere ao padrão, porém o prefixo não foi localizado em postos cadastrados.',
  NOME_FORA_DO_PADRAO: 'Nome do arquivo não adere à regex oficial do cliente.',
  EXTENSAO_NAO_PDF: 'Extensão de arquivo não suportada.',
};

export function TabelaArquivosDesconformes({
  itens,
  categoria,
  tituloVazio,
  descricaoVazia,
}: TabelaArquivosDesconformesProps) {
  const colunas: readonly ColunaTabela<ArquivoDesconforme>[] = [
    {
      chave: 'arquivo',
      cabecalho: 'Arquivo',
      largura: '20rem',
      render: (item) => (
        <div className="max-w-xs">
          <p className="break-words font-medium text-app-fg">
            {item.nomeArquivo}
          </p>
          <p className="mt-1 text-xs text-app-fg-muted">
            {DESCRICAO_CATEGORIA[item.categoria]}
          </p>
        </div>
      ),
    },
    {
      chave: 'tipo',
      cabecalho: 'Tipo de dado',
      render: (item) => (
        <span className="text-app-fg">{rotuloTipoDado(item.tipoDado)}</span>
      ),
    },
    {
      chave: 'caminho',
      cabecalho: 'Caminho',
      render: (item) => (
        <span className="mono block max-w-md break-all text-xs text-app-fg-muted">
          {item.caminhoAbsoluto}
        </span>
      ),
    },
    {
      chave: 'metadados',
      cabecalho: 'Metadados',
      render: (item) => (
        <div className="text-xs text-app-fg-muted">
          <div className="tabular">{formatarTamanho(item.tamanhoBytes)}</div>
          <div className="tabular">{formatarDataHora(item.dataModificacao)}</div>
        </div>
      ),
    },
    {
      chave: 'acao',
      cabecalho: 'Ação',
      alinhar: 'right',
      interativa: true,
      render: (item) => (
        <div className="flex justify-end">
          <BotaoMarcarRevisado
            tipoEntidade="arquivo"
            idEntidade={item.caminhoAbsoluto}
            categoria={categoria}
            statusInicial={item.statusRevisao}
          />
        </div>
      ),
    },
  ];

  return (
    <Tabela
      legenda="Arquivos identificados como desconformes pelo worker de indexação. Cada linha apresenta o arquivo, o tipo de dado, o caminho, os metadados e a ação de marcar como revisado."
      colunas={colunas}
      itens={itens}
      densidade="normal"
      chaveItem={(item) => item.id}
      vazio={<EstadoVazio titulo={tituloVazio} descricao={descricaoVazia} />}
    />
  );
}
