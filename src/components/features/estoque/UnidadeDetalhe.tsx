'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { Drawer } from './Drawer';
import { BadgeEstado, BadgeStatus } from './Badges';
import { CampoDetalhe, ListaDetalhe, Valor } from './CampoDetalhe';
import { TrilhaMovimentacoes } from './TrilhaMovimentacoes';
import { obterUnidade } from './api';
import { ErroEstoque } from './erros';
import { formatarData, formatarDataHora } from './rotulos';
import type { DetalheUnidadeDTO, UnidadeDTO } from './dtos';

interface Props {
  unidadeId: string | null;
  /** Bump para forcar refetch apos uma movimentacao/edicao. */
  versao: number;
  podeGerenciar: boolean;
  nomeLocal: (id: string | null) => string;
  aoFechar: () => void;
  aoMovimentar: (u: UnidadeDTO) => void;
  aoEditar: (u: UnidadeDTO) => void;
  aoExcluir: (u: UnidadeDTO) => void;
}

type Estado =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; dados: DetalheUnidadeDTO };

/**
 * Drawer de detalhe de um item serializado: dados completos + trilha de
 * auditoria. Acoes de escrita (movimentar, editar, excluir) so aparecem para
 * quem pode gerenciar.
 */
export function UnidadeDetalhe({
  unidadeId,
  versao,
  podeGerenciar,
  nomeLocal,
  aoFechar,
  aoMovimentar,
  aoEditar,
  aoExcluir,
}: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });

  useEffect(() => {
    if (!unidadeId) return;
    let ativo = true;
    const controlador = new AbortController();
    setEstado({ fase: 'carregando' });
    obterUnidade(unidadeId, controlador.signal)
      .then((dados) => {
        if (ativo) setEstado({ fase: 'ok', dados });
      })
      .catch((e) => {
        if (!ativo || controlador.signal.aborted) return;
        setEstado({
          fase: 'erro',
          mensagem:
            e instanceof ErroEstoque ? e.message : 'Não foi possível carregar o item.',
        });
      });
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [unidadeId, versao]);

  const u = estado.fase === 'ok' ? estado.dados.unidade : null;

  const acoes =
    podeGerenciar && u ? (
      <>
        <BotaoAcao icone={ArrowLeftRight} rotulo="Movimentar" onClick={() => aoMovimentar(u)} />
        <BotaoAcao icone={Pencil} rotulo="Editar" onClick={() => aoEditar(u)} />
        <BotaoAcao icone={Trash2} rotulo="Excluir" perigo onClick={() => aoExcluir(u)} />
      </>
    ) : null;

  return (
    <Drawer
      aberto={unidadeId !== null}
      titulo={u ? u.descricao : 'Item serializado'}
      subtitulo={u ? [u.marca, u.modelo].filter(Boolean).join(' · ') || undefined : undefined}
      acoes={acoes}
      aoFechar={aoFechar}
    >
      {estado.fase === 'carregando' ? (
        <SkeletonGrupo rotulo="Carregando detalhe do item">
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
              <CampoDetalhe rotulo="Situação">
                <BadgeStatus status={estado.dados.unidade.status} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Estado físico">
                <BadgeEstado estado={estado.dados.unidade.estado} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Local" largo>
                <Valor texto={nomeLocal(estado.dados.unidade.localId)} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Patrimônio PAT.DAEE">
                <Valor texto={estado.dados.unidade.patDaee} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Código SP Águas">
                <Valor texto={estado.dados.unidade.codigoSpaguas} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Número de série / IMEI">
                <Valor texto={estado.dados.unidade.numeroSerie} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Outros patrimônios">
                <Valor texto={estado.dados.unidade.outrosPat} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Código material">
                <Valor texto={estado.dados.unidade.codigo} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Hélice">
                <Valor texto={estado.dados.unidade.helice} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Data de aquisição">
                {formatarData(estado.dados.unidade.dataAquisicao)}
              </CampoDetalhe>
              <CampoDetalhe rotulo="Cadastrado em">
                {formatarDataHora(estado.dados.unidade.criadoEm)}
              </CampoDetalhe>
              {estado.dados.unidade.observacao ? (
                <CampoDetalhe rotulo="Observação (texto original)" largo>
                  <Valor texto={estado.dados.unidade.observacao} />
                </CampoDetalhe>
              ) : null}
            </ListaDetalhe>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-app-fg">Trilha de movimentação</h3>
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
