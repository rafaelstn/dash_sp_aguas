'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { Drawer } from './Drawer';
import { CampoDetalhe, ListaDetalhe, Valor } from './CampoDetalhe';
import { TrilhaMovimentacoes } from './TrilhaMovimentacoes';
import { BotaoExportarExcel } from './BotaoExportarExcel';
import { listarMovimentacoes, listarSaldos, obterMaterial, urlExportarMovimentacoes } from './api';
import { ErroEstoque } from './erros';
import { somarQuantidades } from './saldos-agrupados';
import { ROTULO_NATUREZA, ROTULO_UNIDADE_FISICA, formatarDataHora } from './rotulos';
import type { MaterialDTO, MovimentacaoDTO, SaldoContextoDTO } from './dtos';

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
  historico: MovimentacaoDTO[];
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
    Promise.all([
      obterMaterial(materialId, controlador.signal),
      listarSaldos({ materialId }, controlador.signal),
      listarMovimentacoes({ materialId, porPagina: 100 }, controlador.signal),
    ])
      .then(([material, saldos, movs]) => {
        if (ativo) {
          setEstado({
            fase: 'ok',
            dados: { material, saldos: saldos.itens, historico: movs.itens },
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
  }, [materialId, versao]);

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
              {estado.dados.historico.length > 0 ? (
                <BotaoExportarExcel
                  compacto
                  url={urlExportarMovimentacoes({ materialId: estado.dados.material.id })}
                  rotulo="Exportar movimentações"
                  arquivoFallback="movimentacoes-material"
                  descricao="Exporta as movimentações deste material."
                />
              ) : null}
            </div>
            <TrilhaMovimentacoes movimentacoes={estado.dados.historico} nomeLocal={nomeLocal} />
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
