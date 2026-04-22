import { desconformidadesRepository } from '@/infrastructure/repositories';
import { TabelaArquivosDesconformes } from '@/components/features/desconformidades/TabelaArquivosDesconformes';
import { Alerta } from '@/components/ui/Alerta';

export const dynamic = 'force-dynamic';

export default async function PaginaArquivosOrfaos() {
  try {
    const itens = await desconformidadesRepository.listarArquivosOrfaos();
    return (
      <section
        role="tabpanel"
        id="painel-arquivos-orfaos"
        aria-labelledby="aba-arquivos-orfaos"
        className="space-y-4"
      >
        <p className="text-sm text-gov-texto">
          Arquivos cujo nome adere à regex oficial, porém o prefixo capturado
          não foi localizado no cadastro de postos. A lista é limitada a 500
          registros ordenados pela data de modificação.
        </p>
        <TabelaArquivosDesconformes
          itens={itens}
          categoria="ARQUIVO_ORFAO"
          tituloVazio="Nenhum arquivo órfão indexado até o momento"
          descricaoVazia="Aguardando varredura do worker de indexação."
        />
      </section>
    );
  } catch {
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar arquivos órfãos">
        Não foi possível recuperar a listagem. Tente novamente em instantes.
      </Alerta>
    );
  }
}
