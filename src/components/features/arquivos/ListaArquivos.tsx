import type {
  ArquivoIndexado,
  FormatoNomeArquivo,
} from '@/domain/arquivo-indexado';
import type { GrupoArquivosPorTipo } from '@/application/ports/arquivos-repository';
import {
  formatarDataHora,
  formatarTamanho,
  formatarValor,
} from '@/lib/format';
import { Alerta } from '@/components/ui/Alerta';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { CaminhoRede } from './CaminhoRede';
import { AbrirNoExplorer } from './AbrirNoExplorer';
import { AbasArquivos, type AbaArquivos } from './AbasArquivos';

export interface ListaArquivosProps {
  grupos: GrupoArquivosPorTipo[];
  total: number;
  prefixoJaIndexado: boolean;
}

/**
 * Lista de arquivos agrupados por Tipo de Documento (US-010).
 * Cada linha expõe botão "Abrir pasta" — copia o caminho para o Explorer.
 */
export function ListaArquivos({
  grupos,
  total,
  prefixoJaIndexado,
}: ListaArquivosProps) {
  if (!prefixoJaIndexado) {
    return (
      <Alerta
        tipo="aviso"
        titulo="Indexação ainda não executada para este prefixo"
      >
        Os arquivos associados a este posto ainda não foram varridos pelo
        worker de indexação. Procure o operador responsável pelo processo.
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

  // Pré-renderiza cada grupo como JSX no Server Component — as abas (client)
  // só organizam a exibição. Isso mantém toLocaleDateString & cia no server,
  // sem hydration mismatch no browser.
  const abas: AbaArquivos[] = grupos.map((grupo) => ({
    // codTipoDocumento é numérico (1..7) no domínio — converte pra string
    // porque o id é usado em aria-controls/htmlFor que só aceitam string.
    id:
      grupo.codTipoDocumento !== null
        ? String(grupo.codTipoDocumento)
        : 'sem-classificacao',
    rotulo: grupo.rotulo,
    contagem: grupo.arquivos.length,
    conteudo: (
      <ul className="divide-y divide-app-border-subtle rounded-gov-card border border-app-border-subtle bg-app-surface">
        {grupo.arquivos.map((a) => (
          <LinhaArquivo key={a.id} arquivo={a} />
        ))}
      </ul>
    ),
  }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-app-fg-muted tabular">
        <span className="font-medium text-app-fg">
          {total.toLocaleString('pt-BR')}
        </span>{' '}
        {total === 1 ? 'arquivo' : 'arquivos'} em {grupos.length}{' '}
        {grupos.length === 1 ? 'grupo' : 'grupos'}
      </p>

      <AbasArquivos abas={abas} />
    </div>
  );
}

function LinhaArquivo({ arquivo }: { arquivo: ArquivoIndexado }) {
  const dataDocumento = arquivo.dataDocumento
    ? arquivo.dataDocumento.toLocaleDateString('pt-BR')
    : null;

  return (
    <li className="px-3 py-2 hover:bg-app-surface-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className="truncate text-sm font-medium text-app-fg"
              title={arquivo.nomeArquivo}
            >
              {arquivo.nomeArquivo}
            </p>
            <BadgeFormatoNome formato={arquivo.formatoNome} />
          </div>

          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-app-fg-muted tabular">
            {dataDocumento && (
              <MetaItem rotulo="Documento" valor={dataDocumento} />
            )}
            {arquivo.codEncarregado && (
              <MetaItem rotulo="Encarregado" valor={arquivo.codEncarregado} />
            )}
            <MetaItem
              rotulo="Tamanho"
              valor={formatarTamanho(arquivo.tamanhoBytes)}
            />
            <MetaItem
              rotulo="Modificado"
              valor={formatarDataHora(arquivo.dataModificacao)}
            />
            {arquivo.parteOpcional && (
              <MetaItem
                rotulo="Compl."
                valor={formatarValor(arquivo.parteOpcional)}
              />
            )}
          </dl>

          <div className="mt-1.5">
            <CaminhoRede caminho={arquivo.caminhoAbsoluto} />
          </div>
        </div>

        <div className="shrink-0">
          <AbrirNoExplorer caminhoAbsoluto={arquivo.caminhoAbsoluto} />
        </div>
      </div>
    </li>
  );
}

function MetaItem({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-app-fg-subtle">{rotulo}:</dt>
      <dd className="font-medium text-app-fg">{valor}</dd>
    </div>
  );
}

/**
 * Badge indicando formato do nome do arquivo. Só aparece para formatos
 * não-COMPLETO. PARCIAL e LEGADO são CONFORMES — badge informativo, não de alerta.
 */
function BadgeFormatoNome({ formato }: { formato: FormatoNomeArquivo }) {
  if (formato === 'COMPLETO') return null;
  const rotulo =
    formato === 'PARCIAL' ? 'sem cód. encarregado' : 'arquivo histórico';
  return (
    <span
      className="inline-flex items-center rounded border border-app-border-subtle bg-app-surface-2 px-1.5 py-0.5 text-2xs font-medium text-app-fg-muted"
      title={`Formato ${formato.toLowerCase()}`}
    >
      {rotulo}
    </span>
  );
}
