'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { Drawer } from './Drawer';
import { CampoDetalhe, ListaDetalhe, Valor } from './CampoDetalhe';
import { BadgeAbaixoMinimo } from './Badges';
import { TrilhaMovimentacoes } from './TrilhaMovimentacoes';
import { BotaoExportarExcel } from './BotaoExportarExcel';
import { listarMovimentacoes, listarSaldos, obterMaterial, urlExportarMovimentacoes } from './api';
import { ErroEstoque } from './erros';
import { abaixoDoMinimo } from '@/domain/estoque/reposicao';
import { somarQuantidades } from './saldos-agrupados';
import { ROTULO_NATUREZA, ROTULO_UNIDADE_FISICA, formatarDataHora } from './rotulos';
import type { MaterialDTO, MovimentacaoTrilhaDTO, SaldoContextoDTO } from './dtos';

interface Props {
  materialId: string | null;
  versao: number;
  podeGerenciar: boolean;
  nomeCategoria: (id: string | null) => string;
  nomeLocal: (id: string | null) => string;
  aoFechar: () => void;
  aoMovimentar: (material: MaterialDTO, tamanhos: string[]) => void;
  aoEditar: (material: MaterialDTO) => void;
  aoExcluir: (material: MaterialDTO) => void;
}

interface Dados {
  material: MaterialDTO;
  saldos: SaldoContextoDTO[];
  historico: MovimentacaoTrilhaDTO[];
  /**
   * Resposta de QUEM decidiu, e nao o `podeGerenciar` que chega por prop: so e
   * `true` quando a listagem da trilha devolveu os eventos de fato. O drawer da
   * unidade recebe o equivalente pronto do servidor (`historicoVisivel` no
   * envelope); aqui a rota de movimentacao responde 403, entao o campo e
   * derivado da RESPOSTA, nunca do papel que o navegador acha que tem.
   */
  historicoVisivel: boolean;
}

type Estado =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; dados: Dados };

/**
 * Drawer de detalhe de um material quantificavel: dados do catalogo, saldo por
 * local/tamanho e trilha de auditoria. Escrita so para quem pode gerenciar.
 */
export function MaterialDetalhe({
  materialId,
  versao,
  podeGerenciar,
  nomeCategoria,
  nomeLocal,
  aoFechar,
  aoMovimentar,
  aoEditar,
  aoExcluir,
}: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });

  useEffect(() => {
    if (!materialId) return;
    let ativo = true;
    const controlador = new AbortController();
    setEstado({ fase: 'carregando' });
    // A trilha e gestor-only no backend (gate de gestor em
    // `GET /api/estoque/movimentacoes`). Sem este desvio, o 403 dela caia no
    // MESMO `.catch` do catalogo e do saldo, e o drawer INTEIRO virava erro
    // para quem so tem leitura: a pessoa perdia o material e o saldo, que ela
    // pode ver, por causa de uma parte que ela nao pode.
    //
    // O `podeGerenciar` continua valendo como OTIMIZACAO (nao pedir o que vai
    // ser recusado), e nao como veredito: se o papel no navegador estiver
    // defasado, ou se o critario do gate mudar no backend, a chamada sai e
    // volta 403. Por isso o 403 e tratado como RECUSA aqui, no lugar de subir
    // para o `.catch` comum e reabrir o mesmo defeito por outro caminho.
    // Erro que NAO e de permissao (5xx, rede) continua subindo de proposito:
    // ali a tela precisa dizer que falhou, nao que e restrito.
    const trilha: Promise<{ itens: MovimentacaoTrilhaDTO[]; visivel: boolean }> = podeGerenciar
      ? listarMovimentacoes({ materialId, porPagina: 100 }, controlador.signal)
          .then((r) => ({ itens: r.itens, visivel: true }))
          .catch((e: unknown) => {
            if (e instanceof ErroEstoque && e.status === 403) {
              return { itens: [] as MovimentacaoTrilhaDTO[], visivel: false };
            }
            throw e;
          })
      : Promise.resolve({ itens: [] as MovimentacaoTrilhaDTO[], visivel: false });
    Promise.all([
      obterMaterial(materialId, controlador.signal),
      listarSaldos({ materialId }, controlador.signal),
      trilha,
    ])
      .then(([material, saldos, movs]) => {
        if (ativo) {
          setEstado({
            fase: 'ok',
            dados: {
              material,
              saldos: saldos.itens,
              historico: movs.itens,
              historicoVisivel: movs.visivel,
            },
          });
        }
      })
      .catch((e) => {
        if (!ativo || controlador.signal.aborted) return;
        setEstado({
          fase: 'erro',
          mensagem:
            e instanceof ErroEstoque ? e.message : 'Não foi possível carregar o material.',
        });
      });
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [materialId, versao, podeGerenciar]);

  const material = estado.fase === 'ok' ? estado.dados.material : null;
  const tamanhos =
    estado.fase === 'ok'
      ? [...new Set(estado.dados.saldos.map((s) => s.tamanho).filter((t): t is string => !!t))]
      : [];

  const acoes =
    podeGerenciar && material ? (
      <>
        <BotaoAcao
          icone={ArrowLeftRight}
          rotulo="Movimentar"
          onClick={() => aoMovimentar(material, tamanhos)}
        />
        <BotaoAcao icone={Pencil} rotulo="Editar" onClick={() => aoEditar(material)} />
        <BotaoAcao icone={Trash2} rotulo="Excluir" perigo onClick={() => aoExcluir(material)} />
      </>
    ) : null;

  const colunasSaldo: ColunaTabela<SaldoContextoDTO>[] = [
    {
      chave: 'local',
      cabecalho: 'Local',
      render: (s) => <span className="text-app-fg">{s.localRotulo}</span>,
    },
    {
      chave: 'unidade',
      cabecalho: 'Unidade',
      render: (s) => <span className="text-app-fg-muted">{ROTULO_UNIDADE_FISICA[s.unidade]}</span>,
    },
    {
      chave: 'tamanho',
      cabecalho: 'Tamanho',
      render: (s) =>
        s.tamanho ? (
          <span className="text-app-fg-muted">{s.tamanho}</span>
        ) : (
          <span className="text-app-fg-subtle">—</span>
        ),
    },
    {
      chave: 'quantidade',
      cabecalho: 'Saldo',
      alinhar: 'right',
      render: (s) => (
        <span className="tabular font-semibold text-app-fg">
          {s.quantidade.toLocaleString('pt-BR')}
        </span>
      ),
    },
  ];

  return (
    <Drawer
      aberto={materialId !== null}
      titulo={material ? material.descricao : 'Material quantificável'}
      subtitulo={material ? [material.marca, material.modelo].filter(Boolean).join(' · ') || undefined : undefined}
      acoes={acoes}
      aoFechar={aoFechar}
    >
      {estado.fase === 'carregando' ? (
        <SkeletonGrupo rotulo="Carregando detalhe do material">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-app-border-subtle" />
            ))}
          </div>
        </SkeletonGrupo>
      ) : estado.fase === 'erro' ? (
        <Alerta tipo="erro" titulo="Erro ao carregar">
          {estado.mensagem}
        </Alerta>
      ) : (
        <div className="space-y-6">
          <section>
            <ListaDetalhe>
              <CampoDetalhe rotulo="Natureza">
                {ROTULO_NATUREZA[estado.dados.material.natureza]}
              </CampoDetalhe>
              <CampoDetalhe rotulo="Situação do cadastro">
                {estado.dados.material.ativo ? 'Ativo' : 'Inativo'}
              </CampoDetalhe>
              <CampoDetalhe rotulo="Marca">
                <Valor texto={estado.dados.material.marca} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Modelo">
                <Valor texto={estado.dados.material.modelo} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Categoria">
                <Valor texto={nomeCategoria(estado.dados.material.categoriaId)} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Unidade de medida">
                <Valor texto={estado.dados.material.unidadeMedida} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Saldo total">
                <span className="tabular font-semibold">
                  {somarQuantidades(estado.dados.saldos).toLocaleString('pt-BR')}
                </span>
              </CampoDetalhe>
              {estado.dados.material.natureza === 'quantificavel' ? (
                <>
                  <CampoDetalhe rotulo="Quantidade mínima">
                    {estado.dados.material.quantidadeMinima != null ? (
                      <span className="tabular">
                        {estado.dados.material.quantidadeMinima.toLocaleString('pt-BR')}
                      </span>
                    ) : (
                      <span className="text-app-fg-subtle">Sem mínimo definido</span>
                    )}
                  </CampoDetalhe>
                  <CampoDetalhe rotulo="Reposição">
                    {estado.dados.material.quantidadeMinima == null ? (
                      <span className="text-app-fg-subtle">Sem alerta configurado</span>
                    ) : abaixoDoMinimo(
                        somarQuantidades(estado.dados.saldos),
                        estado.dados.material.quantidadeMinima,
                      ) ? (
                      <BadgeAbaixoMinimo minimo={estado.dados.material.quantidadeMinima} />
                    ) : (
                      <span className="text-gov-sucesso">Em nível adequado</span>
                    )}
                  </CampoDetalhe>
                </>
              ) : null}
              <CampoDetalhe rotulo="Cadastrado em">
                {formatarDataHora(estado.dados.material.criadoEm)}
              </CampoDetalhe>
            </ListaDetalhe>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-app-fg">Saldo por local</h3>
            <Tabela
              legenda="Saldo do material por local e tamanho"
              colunas={colunasSaldo}
              itens={estado.dados.saldos}
              chaveItem={(s) => s.id}
              densidade="compact"
              vazio={
                <p className="px-4 py-6 text-center text-sm text-app-fg-muted">
                  Sem saldo registrado em nenhum local.
                </p>
              }
            />
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-app-fg">Trilha de movimentação</h3>
              {/* O export tambem e gestor-only (o gate roda antes do parse
                  do tipo em `GET /api/estoque/export`), e tem a MESMA regra de
                  backend da listagem da trilha. Entao a condicao e o que o
                  servidor JA respondeu sobre a trilha, nao o papel do cliente:
                  oferecer para recusar depois e pior que nao oferecer. */}
              {estado.dados.historicoVisivel && estado.dados.historico.length > 0 ? (
                <BotaoExportarExcel
                  compacto
                  url={urlExportarMovimentacoes({ materialId: estado.dados.material.id })}
                  rotulo="Exportar movimentações"
                  arquivoFallback="movimentacoes-material"
                  descricao="Exporta as movimentações deste material."
                />
              ) : null}
            </div>
            <TrilhaMovimentacoes
              movimentacoes={estado.dados.historico}
              nomeLocal={nomeLocal}
              podeVerTrilha={estado.dados.historicoVisivel}
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}

function BotaoAcao({
  icone: Icone,
  rotulo,
  onClick,
  perigo,
}: {
  icone: typeof Pencil;
  rotulo: string;
  onClick: () => void;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
        perigo
          ? 'border-red-300 text-gov-perigo hover:bg-red-50'
          : 'border-app-border-input text-app-fg hover:bg-app-surface-2',
      ].join(' ')}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {rotulo}
    </button>
  );
}
