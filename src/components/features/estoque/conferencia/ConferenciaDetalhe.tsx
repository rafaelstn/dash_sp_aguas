'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Plus, XCircle } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { LiveRegion } from '@/components/a11y/LiveRegion';
import { ROTULO_NATUREZA, ROTULO_UNIDADE_FISICA, formatarDataHora } from '../rotulos';
import { acaoConferencia, obterConferencia } from '../conferencia-api';
import { ErroEstoque } from '../erros';
import type { DetalheConferenciaDTO } from '../conferencia-dtos';
import { useResolvedores } from './resolvedores';
import { BadgeStatusConferencia } from './BadgeConferencia';
import { ContagemPanel } from './ContagemPanel';
import { DivergenciasPanel } from './DivergenciasPanel';
import { AdicionarSobraDialog } from './AdicionarSobraDialog';

interface Props {
  conferenciaId: string;
  podeGerenciar: boolean;
}

type Carga =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; detalhe: DetalheConferenciaDTO };

type AcaoPendente = 'concluir' | 'cancelar' | null;

/**
 * Detalhe de uma conferencia: cabecalho (escopo/natureza/status), resumo de
 * divergencias e, conforme o status, a tela de CONTAGEM (aberta) ou o painel de
 * DIVERGENCIAS/reconciliacao (concluida). Acoes de escrita (concluir, cancelar,
 * adicionar sobra) so aparecem para quem gerencia; o backend e a autoridade.
 */
export function ConferenciaDetalhe({ conferenciaId, podeGerenciar }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });
  const [versao, setVersao] = useState(0);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(
    null,
  );
  const [anuncio, setAnuncio] = useState('');
  const [acaoPendente, setAcaoPendente] = useState<AcaoPendente>(null);
  const [sobraAberta, setSobraAberta] = useState(false);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  const conferencia = carga.fase === 'ok' ? carga.detalhe.conferencia : null;
  const resolvedores = useResolvedores(conferencia);

  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    setCarga((prev) => (prev.fase === 'ok' ? prev : { fase: 'carregando' }));
    obterConferencia(conferenciaId, c.signal)
      .then((d) => {
        if (ativo) setCarga({ fase: 'ok', detalhe: d });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        setCarga({
          fase: 'erro',
          mensagem:
            e instanceof ErroEstoque ? e.message : 'Não foi possível carregar a conferência.',
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [conferenciaId, versao]);

  const notificar = useCallback((tipo: 'sucesso' | 'erro', texto: string) => {
    setFeedback({ tipo, texto });
    setAnuncio(texto);
  }, []);

  async function confirmarAcao() {
    if (!acaoPendente) return;
    try {
      const conf = await acaoConferencia(conferenciaId, { acao: acaoPendente });
      setAcaoPendente(null);
      notificar(
        'sucesso',
        conf.status === 'concluida'
          ? 'Conferência concluída. Revise as divergências e reconcilie.'
          : 'Conferência cancelada.',
      );
      recarregar();
    } catch (e) {
      throw new Error(
        e instanceof ErroEstoque ? e.message : 'Não foi possível concluir a ação. Tente novamente.',
      );
    }
  }

  if (carga.fase === 'carregando') {
    return (
      <div className="space-y-4">
        <VoltarLink />
        <SkeletonGrupo rotulo="Carregando conferência">
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-gov-card bg-app-border-subtle" />
            <div className="h-24 animate-pulse rounded-gov-card bg-app-border-subtle" />
            <div className="h-64 animate-pulse rounded-gov-card bg-app-border-subtle" />
          </div>
        </SkeletonGrupo>
      </div>
    );
  }

  if (carga.fase === 'erro') {
    return (
      <div className="space-y-4">
        <VoltarLink />
        <Alerta tipo="erro" titulo="Erro ao carregar">
          {carga.mensagem}
        </Alerta>
        <Button type="button" variante="secundario" onClick={recarregar}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const { conferencia: conf, resumo } = carga.detalhe;
  const aberta = conf.status === 'aberta';
  const concluida = conf.status === 'concluida';

  return (
    <div className="space-y-4">
      <LiveRegion mensagem={anuncio} />
      <VoltarLink />

      {/* Cabecalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-app-fg">
              {ROTULO_UNIDADE_FISICA[conf.unidade]} · {ROTULO_NATUREZA[conf.natureza]}
            </h1>
            <BadgeStatusConferencia status={conf.status} />
          </div>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            {conf.localId ? 'Escopo por local específico' : 'Escopo: unidade inteira'} · Aberta em{' '}
            {formatarDataHora(conf.criadaEm)}
            {conf.concluidaEm ? ` · Concluída em ${formatarDataHora(conf.concluidaEm)}` : ''}
          </p>
        </div>

        {podeGerenciar ? (
          <div className="flex flex-wrap items-center gap-2">
            {aberta ? (
              <>
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() => setSobraAberta(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Adicionar sobra
                </Button>
                <Button
                  type="button"
                  onClick={() => setAcaoPendente('concluir')}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Concluir conferência
                </Button>
              </>
            ) : null}
            {aberta ? (
              <Button
                type="button"
                variante="perigo"
                onClick={() => setAcaoPendente('cancelar')}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Cancelar
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {feedback ? (
        <Alerta
          tipo={feedback.tipo === 'sucesso' ? 'sucesso' : 'erro'}
          titulo={feedback.tipo === 'sucesso' ? 'Tudo certo' : 'Não foi possível concluir'}
        >
          {feedback.texto}
        </Alerta>
      ) : null}

      {/* Resumo */}
      <ResumoCards
        cards={[
          { rotulo: 'Total de itens', valor: resumo.totalItens },
          { rotulo: 'Contados', valor: resumo.contados },
          { rotulo: 'Divergentes', valor: resumo.divergentes, alerta: true },
          { rotulo: 'Reconciliados', valor: resumo.reconciliados },
          { rotulo: 'Pendentes', valor: resumo.pendentesReconciliacao, alerta: true },
        ]}
      />

      {conf.status === 'cancelada' ? (
        <Alerta tipo="aviso" titulo="Conferência cancelada">
          Esta conferência foi cancelada e não teve efeito no estoque. Abra uma nova conferência
          para inventariar este escopo.
        </Alerta>
      ) : aberta ? (
        <ContagemPanel
          conferencia={conf}
          podeGerenciar={podeGerenciar}
          resolvedores={resolvedores}
          aoMudar={() => recarregar()}
          aoNotificar={notificar}
        />
      ) : concluida ? (
        <DivergenciasPanel
          conferencia={conf}
          resumo={resumo}
          podeGerenciar={podeGerenciar}
          resolvedores={resolvedores}
          aoMudar={() => recarregar()}
          aoNotificar={notificar}
        />
      ) : null}

      {/* Confirmacao concluir/cancelar */}
      <ConfirmDialog
        aberto={acaoPendente !== null}
        titulo={acaoPendente === 'concluir' ? 'Concluir conferência' : 'Cancelar conferência'}
        descricao={
          acaoPendente === 'concluir' ? (
            <>
              Concluir a contagem? Depois de concluída, a contagem fica final (auditável) e você
              passa a tratar as divergências. Itens ainda não contados continuam como estavam.
            </>
          ) : (
            <>
              Cancelar esta conferência? Ela é descartada e <strong>não</strong> altera o estoque.
              Esta ação não pode ser desfeita.
            </>
          )
        }
        variante={acaoPendente === 'cancelar' ? 'perigo' : 'normal'}
        rotuloConfirmar={acaoPendente === 'concluir' ? 'Concluir' : 'Cancelar conferência'}
        rotuloCancelar="Voltar"
        aoConfirmar={confirmarAcao}
        aoCancelar={() => setAcaoPendente(null)}
      />

      {/* Adicionar sobra */}
      <AdicionarSobraDialog
        aberto={sobraAberta}
        conferencia={conf}
        locais={resolvedores.locais}
        aoFechar={() => setSobraAberta(false)}
        aoAdicionar={(msg) => {
          setSobraAberta(false);
          notificar('sucesso', msg);
          recarregar();
        }}
      />
    </div>
  );
}

function VoltarLink() {
  return (
    <Link
      href="/estoque/conferencias"
      className="inline-flex items-center gap-1 text-xs font-medium text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Todas as conferências
    </Link>
  );
}

function ResumoCards({
  cards,
}: {
  cards: { rotulo: string; valor: number; alerta?: boolean }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const emAlerta = c.alerta === true && c.valor > 0;
        return (
          <div
            key={c.rotulo}
            className={[
              'rounded-gov-card border px-3 py-2',
              emAlerta ? 'border-amber-300 bg-amber-50' : 'border-app-border-subtle bg-app-surface',
            ].join(' ')}
          >
            <dt className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
              {c.rotulo}
            </dt>
            <dd
              className={[
                'mt-0.5 text-lg font-semibold tabular',
                emAlerta ? 'text-amber-900' : 'text-app-fg',
              ].join(' ')}
            >
              {c.valor.toLocaleString('pt-BR')}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
