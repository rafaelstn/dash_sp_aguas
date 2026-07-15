'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Package, PackageOpen } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { LiveRegion } from '@/components/a11y/LiveRegion';
import { BadgeEstado, BadgeStatus } from './Badges';
import { CampoDetalhe, ListaDetalhe, Valor } from './CampoDetalhe';
import { TrilhaMovimentacoes } from './TrilhaMovimentacoes';
import { MovimentacaoDialog, type AlvoMovimentacao } from './MovimentacaoDialog';
import { listarLocais, obterUnidade } from './api';
import { ErroEstoque } from './erros';
import { formatarData, formatarDataHora } from './rotulos';
import type { DetalheUnidadeDTO, LocalDTO } from './dtos';

interface Props {
  /** UUID cru da unidade serializada (vindo do QR/rota). */
  id: string;
  /** Papel do ator resolvido no servidor: admin/super_admin movimentam. */
  podeGerenciar: boolean;
}

type Carga =
  | { fase: 'carregando' }
  | { fase: 'nao-encontrado' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; dados: DetalheUnidadeDTO };

/**
 * Pagina de leitura de um item serializado, alvo do QR de patrimonio. Qualquer
 * celular abre a URL (sem leitor proprio); sem sessao, cai no login e volta
 * para ca. Layout de leitura (container estreito), estados cobertos e trilha de
 * auditoria reaproveitada. A acao de escrita (Movimentar) so aparece para quem
 * pode gerenciar; o backend continua sendo a autoridade.
 */
export function PatrimonioDetalhe({ id, podeGerenciar }: Props) {
  const [versao, setVersao] = useState(0);
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });
  const [locais, setLocais] = useState<LocalDTO[]>([]);
  const [movAberto, setMovAberto] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  // Locais para resolver o rotulo a partir do `localId` (UUID cru da unidade).
  // Tolerante: se falhar, a tela degrada (mostra o item, local nao identificado).
  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    listarLocais(undefined, c.signal)
      .then((r) => {
        if (ativo) setLocais(r.itens);
      })
      .catch(() => {
        /* degrade: sem os locais o rotulo fica indisponivel, nao quebra a tela */
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [versao]);

  // Detalhe do item + trilha (o historico ja chega com `operador`).
  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    setCarga({ fase: 'carregando' });
    obterUnidade(id, c.signal)
      .then((dados) => {
        if (ativo) setCarga({ fase: 'ok', dados });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        // id invalido (400) ou inexistente (404) => estado dedicado, nao "erro".
        const naoEncontrado =
          e instanceof ErroEstoque &&
          (e.status === 404 ||
            e.status === 400 ||
            e.codigo === 'unidade_nao_encontrada' ||
            e.codigo === 'id_invalido');
        if (naoEncontrado) {
          setCarga({ fase: 'nao-encontrado' });
          return;
        }
        setCarga({
          fase: 'erro',
          mensagem:
            e instanceof ErroEstoque ? e.message : 'Não foi possível carregar o item.',
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [id, versao]);

  const localPorId = useMemo(() => new Map(locais.map((l) => [l.id, l])), [locais]);
  const nomeLocal = useCallback(
    (lid: string | null) =>
      lid ? (localPorId.get(lid)?.rotulo ?? 'Local não identificado') : '—',
    [localPorId],
  );

  const u = carga.fase === 'ok' ? carga.dados.unidade : null;

  const alvoMov: AlvoMovimentacao | null = u
    ? {
        natureza: 'serializado',
        unidadeId: u.id,
        descricao: u.descricao,
        statusAtual: u.status,
        localAtualId: u.localId,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <LiveRegion mensagem={anuncio} />

      <nav aria-label="Trilha de navegação" className="text-xs text-app-fg-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/estoque" className="text-gov-azul hover:underline">
              Estoque
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>Patrimônio</li>
        </ol>
      </nav>

      {carga.fase === 'carregando' ? (
        <SkeletonGrupo rotulo="Carregando item de patrimônio">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-app-border-subtle" />
            ))}
          </div>
        </SkeletonGrupo>
      ) : carga.fase === 'nao-encontrado' ? (
        <div className="space-y-4 rounded-gov-card border border-app-border-subtle bg-app-surface p-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-app-surface-2 text-app-fg-subtle"
          >
            <PackageOpen className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-app-fg">Item não encontrado</h1>
            <p className="mx-auto mt-1 max-w-md text-sm text-app-fg-muted">
              A etiqueta aponta para um item que não existe mais no inventário ou o
              identificador é inválido. Confira a etiqueta ou volte ao Estoque para localizar
              o equipamento.
            </p>
          </div>
          <Link
            href="/estoque"
            className="inline-flex items-center gap-2 rounded bg-gov-azul px-4 py-2 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            <Package className="h-4 w-4" aria-hidden="true" />
            Ir para o Estoque
          </Link>
        </div>
      ) : carga.fase === 'erro' ? (
        <div className="space-y-3">
          <Alerta tipo="erro" titulo="Erro ao carregar">
            {carga.mensagem}
          </Alerta>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={recarregar}
              className="rounded border border-app-border-input bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              Tentar novamente
            </button>
            <Link
              href="/estoque"
              className="rounded border border-gov-azul bg-app-surface px-3 py-1.5 text-sm font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              Abrir no Estoque
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {feedback ? (
            <Alerta tipo="sucesso" titulo="Tudo certo">
              {feedback}
            </Alerta>
          ) : null}

          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border-subtle pb-3">
            <div className="min-w-0">
              <p className="text-2xs uppercase tracking-wider text-app-fg-subtle">
                Item de patrimônio
              </p>
              <h1 className="text-xl font-semibold text-app-fg">{carga.dados.unidade.descricao}</h1>
              {[carga.dados.unidade.marca, carga.dados.unidade.modelo].filter(Boolean).length > 0 ? (
                <p className="mt-0.5 text-sm text-app-fg-muted">
                  {[carga.dados.unidade.marca, carga.dados.unidade.modelo]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BadgeStatus status={carga.dados.unidade.status} />
              <BadgeEstado estado={carga.dados.unidade.estado} />
            </div>
          </header>

          {/* Acoes: leitura para todos; movimentar so para admin. */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/estoque"
              className="inline-flex items-center gap-1.5 rounded border border-gov-azul bg-app-surface px-3 py-1.5 text-sm font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              <Package className="h-4 w-4" aria-hidden="true" />
              Abrir no Estoque
            </Link>
            {podeGerenciar ? (
              <button
                type="button"
                onClick={() => setMovAberto(true)}
                className="inline-flex items-center gap-1.5 rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
              >
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                Movimentar
              </button>
            ) : null}
          </div>

          <section aria-labelledby="sec-dados">
            <h2 id="sec-dados" className="sr-only">
              Dados do item
            </h2>
            <ListaDetalhe>
              <CampoDetalhe rotulo="Situação">
                <BadgeStatus status={carga.dados.unidade.status} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Estado físico">
                <BadgeEstado estado={carga.dados.unidade.estado} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Local" largo>
                <Valor texto={nomeLocal(carga.dados.unidade.localId)} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Patrimônio PAT.DAEE">
                <Valor texto={carga.dados.unidade.patDaee} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Código SP Águas">
                <Valor texto={carga.dados.unidade.codigoSpaguas} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Código material">
                <Valor texto={carga.dados.unidade.codigo} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Número de série / IMEI">
                <Valor texto={carga.dados.unidade.numeroSerie} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Marca">
                <Valor texto={carga.dados.unidade.marca} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Modelo">
                <Valor texto={carga.dados.unidade.modelo} />
              </CampoDetalhe>
              <CampoDetalhe rotulo="Data de aquisição">
                {formatarData(carga.dados.unidade.dataAquisicao)}
              </CampoDetalhe>
              <CampoDetalhe rotulo="Cadastrado em">
                {formatarDataHora(carga.dados.unidade.criadoEm)}
              </CampoDetalhe>
              {carga.dados.unidade.observacao ? (
                <CampoDetalhe rotulo="Observação" largo>
                  <Valor texto={carga.dados.unidade.observacao} />
                </CampoDetalhe>
              ) : null}
            </ListaDetalhe>
          </section>

          <section aria-labelledby="sec-trilha" className="space-y-2">
            <h2 id="sec-trilha" className="text-sm font-semibold text-app-fg">
              Trilha de movimentação
            </h2>
            <TrilhaMovimentacoes movimentacoes={carga.dados.historico} nomeLocal={nomeLocal} />
          </section>
        </div>
      )}

      {/* Dialog de movimentacao (admin). Refetch apos concluir. */}
      <MovimentacaoDialog
        aberto={movAberto && alvoMov !== null}
        alvo={alvoMov}
        locais={locais}
        aoFechar={() => setMovAberto(false)}
        aoConcluir={(msg) => {
          setMovAberto(false);
          setFeedback(msg);
          setAnuncio(msg);
          recarregar();
        }}
      />
    </div>
  );
}
