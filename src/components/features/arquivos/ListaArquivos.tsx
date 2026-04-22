import type {
  ArquivoIndexado,
  FormatoNomeArquivo,
} from '@/domain/arquivo-indexado';
import type { GrupoArquivosPorTipo } from '@/application/ports/arquivos-repository';
import { formatarDataHora, formatarTamanho, formatarValor } from '@/lib/format';
import { Alerta } from '@/components/ui/Alerta';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { CaminhoRede } from './CaminhoRede';

export interface ListaArquivosProps {
  grupos: GrupoArquivosPorTipo[];
  total: number;
  prefixoJaIndexado: boolean;
}

/**
 * Lista de arquivos agrupados por Tipo de Documento (US-010).
 * Grupos sem arquivos não são renderizados. O grupo "Sem classificação"
 * aparece por último e concentra arquivos sem `cod_tipo_documento`.
 */
export function ListaArquivos({ grupos, total, prefixoJaIndexado }: ListaArquivosProps) {
  if (!prefixoJaIndexado) {
    return (
      <Alerta tipo="aviso" titulo="Indexação ainda não executada para este prefixo">
        Os arquivos associados a este posto ainda não foram varridos pelo worker de indexação.
        Procure o operador responsável pelo processo.
      </Alerta>
    );
  }

  if (total === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum arquivo indexado para este prefixo"
        descricao="Já houve varredura, mas nenhum arquivo correspondente foi encontrado no HD de rede."
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gov-muted">
        Total: {total} {total === 1 ? 'arquivo' : 'arquivos'} em {grupos.length}{' '}
        {grupos.length === 1 ? 'grupo' : 'grupos'}.
      </p>

      {grupos.map((grupo) => {
        const cabecalhoId = `grupo-${grupo.codTipoDocumento ?? 'sem-classificacao'}`;
        return (
          <section
            key={grupo.codTipoDocumento ?? 'sem-classificacao'}
            aria-labelledby={cabecalhoId}
            className="space-y-3"
          >
            <h3
              id={cabecalhoId}
              className="text-base font-semibold text-gov-texto border-b border-gov-borda pb-1"
            >
              <span>{grupo.rotulo}</span>
              <span className="ml-2 text-sm text-gov-muted font-normal">
                ({grupo.arquivos.length}{' '}
                {grupo.arquivos.length === 1 ? 'arquivo' : 'arquivos'})
              </span>
            </h3>
            <ul className="space-y-3">
              {grupo.arquivos.map((a) => (
                <LinhaArquivo key={a.id} arquivo={a} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function LinhaArquivo({ arquivo }: { arquivo: ArquivoIndexado }) {
  const dataDocumento = arquivo.dataDocumento
    ? arquivo.dataDocumento.toLocaleDateString('pt-BR')
    : null;

  return (
    <li className="border border-gov-borda rounded p-4 bg-white">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-gov-texto break-words">{arquivo.nomeArquivo}</p>
        <BadgeFormatoNome formato={arquivo.formatoNome} />
      </div>
      <dl className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gov-muted">
        {dataDocumento && (
          <div>
            <dt className="font-semibold">Data do documento</dt>
            <dd>{dataDocumento}</dd>
          </div>
        )}
        {arquivo.codEncarregado && (
          <div>
            <dt className="font-semibold">Encarregado</dt>
            <dd>{arquivo.codEncarregado}</dd>
          </div>
        )}
        {arquivo.parteOpcional && (
          <div className="col-span-2">
            <dt className="font-semibold">Complemento</dt>
            <dd className="break-words">{formatarValor(arquivo.parteOpcional)}</dd>
          </div>
        )}
        <div>
          <dt className="font-semibold">Tamanho</dt>
          <dd>{formatarTamanho(arquivo.tamanhoBytes)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Modificado em</dt>
          <dd>{formatarDataHora(arquivo.dataModificacao)}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <CaminhoRede caminho={arquivo.caminhoAbsoluto} />
      </div>
    </li>
  );
}

/**
 * Badge suave indicando o formato do nome do arquivo. Só aparece para
 * formatos não-COMPLETO (o COMPLETO é o padrão, não precisa de marcação).
 * PARCIAL e LEGADO são CONFORMES — o badge é informativo, não de alerta.
 */
function BadgeFormatoNome({ formato }: { formato: FormatoNomeArquivo }) {
  if (formato === 'COMPLETO') return null;

  const rotulo =
    formato === 'PARCIAL' ? 'sem cód. encarregado' : 'arquivo histórico';

  return (
    <span
      className="inline-flex items-center rounded-full bg-gov-fundo-suave border border-gov-borda px-2 py-0.5 text-xs font-medium text-gov-muted"
      title={`Formato ${formato.toLowerCase()}`}
    >
      {rotulo}
    </span>
  );
}
