'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, ShieldCheck } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import {
  carregarItensCompleto,
  reconciliarEmOndas,
  type ProgressoLote,
} from '../conferencia-api';
import { ErroEstoque } from '../erros';
import {
  TAMANHO_ONDA_LOTE,
  autoriaDoItem,
  descreverAjuste,
  divergenciaDoItem,
  idsElegiveisLote,
  itemReconciliado,
  resumirLote,
} from '../conferencia-ui';
import type {
  ConferenciaDTO,
  ConferenciaItemDTO,
  ResultadoReconciliacaoDTO,
  ResumoDivergenciasDTO,
} from '../conferencia-dtos';
import type { Resolvedores } from './resolvedores';
import { BadgeDivergencia, BadgeReconciliado } from './BadgeConferencia';
import { ReconciliarDialog } from './ReconciliarDialog';

interface Props {
  conferencia: ConferenciaDTO;
  resumo: ResumoDivergenciasDTO;
  podeGerenciar: boolean;
  resolvedores: Resolvedores;
  aoMudar: () => void;
  aoNotificar: (tipo: 'sucesso' | 'erro', texto: string) => void;
}

type Carga =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; itens: ConferenciaItemDTO[]; total: number; parcial: boolean };

/**
 * Painel de DIVERGÊNCIAS + reconciliação (sessão concluída). Lista as divergências
 * mostrando o que o sistema tinha vs. o contado e QUAL ajuste será gerado.
 * Reconciliar por item (dialog que mostra o ajuste e confirma) ou em lote (mostra
 * o resumo do que será aplicado e confirma). Trata base alterada, item já
 * reconciliado e o resultado parcial do lote. Escrita só para quem gerencia.
 */
export function DivergenciasPanel({
  conferencia,
  resumo,
  podeGerenciar,
  resolvedores,
  aoMudar,
  aoNotificar,
}: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });
  const [versao, setVersao] = useState(0);
  const [itemDialog, setItemDialog] = useState<ConferenciaItemDTO | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);
  const [progresso, setProgresso] = useState<ProgressoLote | null>(null);
  const conferenciaId = conferencia.id;

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    setCarga({ fase: 'carregando' });
    carregarItensCompleto(conferenciaId, { apenasDivergentes: true }, c.signal)
      .then((carregado) => {
        if (ativo) setCarga({ fase: 'ok', ...carregado });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        setCarga({
          fase: 'erro',
          mensagem:
            e instanceof ErroEstoque ? e.message : 'Não foi possível carregar as divergências.',
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [conferenciaId, versao]);

  const itens = useMemo(() => (carga.fase === 'ok' ? carga.itens : []), [carga]);
  const elegiveis = useMemo(() => idsElegiveisLote(itens), [itens]);
  const resumoLote = useMemo(
    () => resumirLote(itens, resolvedores.nomeLocal),
    [itens, resolvedores.nomeLocal],
  );

  const aoReconciliarItem = useCallback(
    (resultado: ResultadoReconciliacaoDTO) => {
      setItemDialog(null);
      if (resultado.jaReconciliado) {
        aoNotificar('sucesso', 'Este item já havia sido reconciliado.');
      } else if (resultado.aviso === 'base_alterada') {
        aoNotificar(
          'erro',
          'Reconciliado, mas o saldo do sistema mudou desde a contagem. Confira o item no estoque.',
        );
      } else {
        aoNotificar('sucesso', 'Item reconciliado com sucesso.');
      }
      recarregar();
      aoMudar();
    },
    [aoNotificar, recarregar, aoMudar],
  );

  async function confirmarLote() {
    setProgresso({ enviados: 0, total: elegiveis.length });
    try {
      const { resultado, interrompido } = await reconciliarEmOndas(
        conferenciaId,
        elegiveis,
        setProgresso,
      );
      setLoteAberto(false);
      const houveBaseAlterada = resultado.itens.some((i) => i.aviso === 'base_alterada');
      const aplicados = resultado.reconciliados.toLocaleString('pt-BR');
      if (interrompido) {
        // O que passou esta aplicado de verdade; dizer so "erro" faria o operador
        // reprocessar as cegas.
        aoNotificar(
          'erro',
          `${interrompido} O processamento parou com ${aplicados} de ${elegiveis.length.toLocaleString('pt-BR')} item(ns) já aplicado(s). Recarregue e reconcilie o que restou.`,
        );
      } else if (resultado.falhas > 0) {
        aoNotificar(
          'erro',
          `${aplicados} reconciliado(s), ${resultado.falhas.toLocaleString('pt-BR')} com falha. Reveja os itens que restaram.`,
        );
      } else if (houveBaseAlterada) {
        aoNotificar(
          'erro',
          `${aplicados} reconciliado(s). Atenção: o saldo do sistema mudou desde a contagem em algum item.`,
        );
      } else {
        aoNotificar('sucesso', `${aplicados} item(ns) reconciliado(s).`);
      }
      recarregar();
      aoMudar();
    } catch (e) {
      throw new Error(
        e instanceof ErroEstoque ? e.message : 'Não foi possível reconciliar o lote.',
      );
    } finally {
      setProgresso(null);
    }
  }

  if (carga.fase === 'carregando') {
    return (
      <SkeletonGrupo rotulo="Carregando divergências">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-gov-card bg-app-border-subtle" />
          ))}
        </div>
      </SkeletonGrupo>
    );
  }

  if (carga.fase === 'erro') {
    return (
      <div className="space-y-3">
        <Alerta tipo="erro" titulo="Erro ao carregar">
          {carga.mensagem}
        </Alerta>
        <Button type="button" variante="secundario" onClick={recarregar}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={ShieldCheck}
        titulo="Nenhuma divergência"
        descricao="A contagem bateu com o sistema neste escopo. Não há ajustes a reconciliar."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-app-fg">Divergências</h2>
          <p className="text-2xs text-app-fg-muted">
            {resumo.pendentesReconciliacao.toLocaleString('pt-BR')} pendente(s) de reconciliação de{' '}
            {itens.length.toLocaleString('pt-BR')} divergência(s)
          </p>
        </div>
        {podeGerenciar && elegiveis.length > 0 ? (
          <Button
            type="button"
            onClick={() => setLoteAberto(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm"
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Reconciliar todos ({elegiveis.length})
          </Button>
        ) : null}
      </div>

      {carga.parcial ? (
        <Alerta tipo="aviso" titulo="Lista parcial">
          Esta conferência tem {carga.total.toLocaleString('pt-BR')} divergências e a tela carregou
          as {itens.length.toLocaleString('pt-BR')} primeiras. Reconciliar em lote aplica apenas o
          que está listado; repita a operação depois de recarregar para tratar o restante.
        </Alerta>
      ) : null}

      {!podeGerenciar ? (
        <Alerta tipo="info" titulo="Somente leitura">
          Você pode consultar as divergências, mas apenas um administrador pode reconciliá-las.
        </Alerta>
      ) : null}

      <ul className="space-y-2">
        {itens.map((item) => (
          <li key={item.id}>
            <LinhaDivergencia
              item={item}
              podeGerenciar={podeGerenciar}
              resolvedores={resolvedores}
              aoReconciliar={() => setItemDialog(item)}
            />
          </li>
        ))}
      </ul>

      <ReconciliarDialog
        aberto={itemDialog !== null}
        conferenciaId={conferenciaId}
        item={itemDialog}
        resolvedores={resolvedores}
        aoFechar={() => setItemDialog(null)}
        aoReconciliar={aoReconciliarItem}
      />

      <ConfirmDialog
        aberto={loteAberto}
        titulo="Reconciliar todas as divergências"
        descricao={
          <div className="space-y-2">
            <p>Confira o que será aplicado ao estoque antes de confirmar:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {resumoLote.entradas > 0 ? (
                <li>{resumoLote.entradas.toLocaleString('pt-BR')} entrada(s) por sobra física</li>
              ) : null}
              {resumoLote.saidas > 0 ? (
                <li>{resumoLote.saidas.toLocaleString('pt-BR')} saída(s) por falta física</li>
              ) : null}
              {resumoLote.transferencias > 0 ? (
                <li>
                  {resumoLote.transferencias.toLocaleString('pt-BR')} transferência(s) de local
                </li>
              ) : null}
              {resumoLote.apuracoes > 0 ? (
                <li>
                  {resumoLote.apuracoes.toLocaleString('pt-BR')} não localizado(s): marcados como
                  apurados, sem baixa automática
                </li>
              ) : null}
            </ul>
            <p className="text-2xs text-app-fg-muted">
              Cada item gera uma movimentação atômica e rastreável. Um item com problema não impede
              os demais.
              {resumoLote.total > TAMANHO_ONDA_LOTE
                ? ` O envio é feito em ${Math.ceil(resumoLote.total / TAMANHO_ONDA_LOTE)} etapas de até ${TAMANHO_ONDA_LOTE} itens.`
                : ''}
            </p>
            {progresso ? (
              <p aria-live="polite" className="text-2xs font-medium text-app-fg tabular">
                Aplicando: {progresso.enviados.toLocaleString('pt-BR')} de{' '}
                {progresso.total.toLocaleString('pt-BR')} item(ns).
              </p>
            ) : null}
          </div>
        }
        rotuloConfirmar={`Reconciliar ${resumoLote.total}`}
        rotuloCancelar="Voltar"
        aoConfirmar={confirmarLote}
        aoCancelar={() => setLoteAberto(false)}
      />
    </div>
  );
}

function LinhaDivergencia({
  item,
  podeGerenciar,
  resolvedores,
  aoReconciliar,
}: {
  item: ConferenciaItemDTO;
  podeGerenciar: boolean;
  resolvedores: Resolvedores;
  aoReconciliar: () => void;
}) {
  const div = divergenciaDoItem(item);
  const ajuste = descreverAjuste(item, resolvedores.nomeLocal);
  const reconciliado = itemReconciliado(item);
  const quant = item.materialId !== null;

  return (
    <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-app-fg">{resolvedores.rotuloItem(item)}</p>
          <p className="mt-0.5 text-2xs text-app-fg-muted">
            {resolvedores.nomeLocal(item.localEsperadoId)}
            {item.tamanho ? ` · Tamanho ${item.tamanho}` : ''}
            {item.origem === 'sobra' ? ' · Sobra' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {div.tipo ? <BadgeDivergencia tipo={div.tipo} /> : null}
          {reconciliado ? <BadgeReconciliado /> : null}
        </div>
      </div>

      {/* Sistema vs contado */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-xs">
        {quant ? (
          <>
            <Numero rotulo="Sistema" valor={item.quantidadeSistema ?? 0} />
            <Numero rotulo="Contado" valor={item.quantidadeContada ?? 0} destaque />
          </>
        ) : (
          <div className="col-span-2 text-2xs text-app-fg-muted">
            {item.situacao === 'encontrado_em_outro_local'
              ? `Encontrado em ${resolvedores.nomeLocal(item.localEncontradoId)}`
              : 'Não localizado na contagem'}
          </div>
        )}
      </div>

      {/* Ajuste previsto */}
      <div className="mt-2 rounded border border-app-border-subtle bg-app-surface-2 px-3 py-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
          Ajuste previsto
        </p>
        <p className="mt-0.5 text-sm text-app-fg">{ajuste.texto}</p>
      </div>

      {/* Trilha: o ajuste patrimonial deriva da contagem, entao quem contou faz
          parte da evidencia, nao e detalhe de interface. */}
      <p className="mt-2 text-2xs text-app-fg-muted">{autoriaDoItem(item)}</p>

      {podeGerenciar && !reconciliado ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={aoReconciliar}
            className="inline-flex min-h-11 items-center gap-2 rounded bg-gov-azul px-4 py-2 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Reconciliar
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div
      className={[
        'rounded border px-3 py-2',
        destaque ? 'border-gov-azul bg-blue-50' : 'border-app-border-subtle bg-app-surface',
      ].join(' ')}
    >
      <span className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
        {rotulo}
      </span>
      <p className="text-lg font-semibold tabular text-app-fg">{valor.toLocaleString('pt-BR')}</p>
    </div>
  );
}
