import type {
  ArquivoIndexado,
  FormatoNomeArquivo,
} from '@/domain/arquivo-indexado';
import type { GrupoArquivosPorTipo } from '@/application/ports/arquivos-repository';
import { TIPOS_DOCUMENTO } from '@/domain/tipo-documento';
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
 * Lista de arquivos antigos do HD agrupados por Tipo de Documento (US-010).
 * Cada linha expõe botão "Abrir pasta" — copia o caminho para o Explorer.
 *
 * Fichas DIGITAIS (entrada via app de campo / formulário web) são exibidas
 * em outra seção da página do posto via `<HistoricoFichas>`.
 */
export function ListaArquivos({
  grupos,
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

  // Indexa os grupos por código pra lookup O(1) ao montar abas.
  const grupoPorCodigo = new Map<number, GrupoArquivosPorTipo>();
  for (const g of grupos) {
    if (g.codTipoDocumento !== null) {
      grupoPorCodigo.set(g.codTipoDocumento, g);
    }
  }

  // SEMPRE constrói as 7 abas oficiais (1..7) na mesma ordem do
  // HistoricoFichas — paridade visual entre as duas tab bars. Tipos
  // sem arquivo no posto mostram empty state interno.
  const abas: AbaArquivos[] = Object.values(TIPOS_DOCUMENTO)
    .sort((a, b) => a.codigo - b.codigo)
    .map((tipo) => {
      const grupo = grupoPorCodigo.get(tipo.codigo);
      const arquivos = grupo?.arquivos ?? [];
      return {
        id: String(tipo.codigo),
        rotulo: tipo.rotulo,
        contagem: arquivos.length,
        conteudo:
          arquivos.length === 0 ? (
            <EmptyAbaArquivos rotuloTipo={tipo.rotulo} />
          ) : (
            <ul className="divide-y divide-app-border-subtle rounded-gov-card border border-app-border-subtle bg-app-surface">
              {arquivos.map((a) => (
                <LinhaArquivo key={a.id} arquivo={a} />
              ))}
            </ul>
          ),
      };
    });

  // Caso raro: arquivos sem classificação de tipo (codTipoDocumento null
  // no parser do indexer). Adiciona aba extra "Sem classificação" no
  // final pra não esconder esses arquivos.
  const semClassificacao = grupos.find((g) => g.codTipoDocumento === null);
  if (semClassificacao && semClassificacao.arquivos.length > 0) {
    abas.push({
      id: 'sem-classificacao',
      rotulo: semClassificacao.rotulo,
      contagem: semClassificacao.arquivos.length,
      conteudo: (
        <ul className="divide-y divide-app-border-subtle rounded-gov-card border border-app-border-subtle bg-app-surface">
          {semClassificacao.arquivos.map((a) => (
            <LinhaArquivo key={a.id} arquivo={a} />
          ))}
        </ul>
      ),
    });
  }

  return <AbasArquivos abas={abas} />;
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
 * Empty state mostrado dentro de uma aba sem arquivos daquele tipo.
 * Mensagem é puramente informativa — diferente do empty de fichas
 * digitais, aqui não tem CTA porque arquivos vêm do indexador (não
 * dá pra "criar manualmente" um PDF do HD via UI).
 */
function EmptyAbaArquivos({ rotuloTipo }: { rotuloTipo: string }) {
  return (
    <EstadoVazio
      titulo={`Nenhum arquivo de ${rotuloTipo} indexado`}
      descricao="A varredura do HD de rede não encontrou arquivos deste tipo neste posto."
    />
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
