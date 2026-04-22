import { desconformidadesRepository } from '@/infrastructure/db/desconformidades-repository.pg';
import { TabelaArquivosDesconformes } from '@/components/features/desconformidades/TabelaArquivosDesconformes';
import { Alerta } from '@/components/ui/Alerta';

export const dynamic = 'force-dynamic';

export default async function PaginaArquivosMalformados() {
  try {
    const itens = await desconformidadesRepository.listarArquivosMalformados();
    return (
      <section
        role="tabpanel"
        id="painel-arquivos-malformados"
        aria-labelledby="aba-arquivos-malformados"
        className="space-y-4"
      >
        <p className="text-sm text-gov-texto">
          Arquivos cujo nome não adere à regex oficial do cliente.
          Esses documentos exigem renomeação na pasta-fonte para que
          voltem a ser recuperáveis pelo sistema.
        </p>
        <TabelaArquivosDesconformes
          itens={itens}
          categoria="ARQUIVO_MALFORMADO"
          tituloVazio="Nenhum arquivo malformado indexado até o momento"
          descricaoVazia="Aguardando varredura do worker de indexação."
        />
      </section>
    );
  } catch {
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar arquivos malformados">
        Não foi possível recuperar a listagem. Tente novamente em instantes.
      </Alerta>
    );
  }
}
