import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Database,
  FileCheck,
  FileWarning,
  FolderX,
  HelpCircle,
  MapPinOff,
  Power,
  PowerOff,
} from 'lucide-react';
import {
  anaRevisaoRepository,
  papeisRepository,
  painelRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { logger } from '@/infrastructure/logging/logger';
import { formatarPercentual } from '@/lib/format';
import {
  apuracaoDeConformidade,
  apuracaoDePostosSemArquivo,
  naoApurado,
} from '@/lib/painel-apuracao';
import { CardKPI } from '@/components/features/painel/CardKPI';
import {
  BlocoNaoApurado,
  BlocoSemOcorrencia,
} from '@/components/features/painel/BlocoNaoApurado';
import { BarraProgresso } from '@/components/features/painel/BarraProgresso';
import { Alerta } from '@/components/ui/Alerta';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Painel — SP Águas - DMO',
};

function formatarDataHora(d: Date | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

function rotuloClasse(classe: string): string {
  const mapa: Record<string, string> = {
    conforme_pluviometria: 'Conforme pluviometria',
    conforme_fluviometria: 'Conforme fluviometria',
    suspeita_troca_letra_digito: 'Suspeita troca letra/dígito',
    placeholder_interrogacao: 'Placeholder "?"',
    outlier_prefixo: 'Prefixo outlier',
    faltando_zero_esquerda: 'Faltando zero à esquerda',
    vazio: 'Vazio',
    outlier_ana: 'ANA outlier',
  };
  return mapa[classe] ?? classe;
}

/**
 * Cor da barra por tipo de posto.
 *
 * As duas origens do painel escrevem o MESMO tipo com vocabulários
 * diferentes: o nosso PostgreSQL guarda a sigla (`PLU`, `FLU`) e o cadastro do
 * órgão devolve o nome por extenso e acentuado (`PLUVIOMÉTRICO`). A comparação
 * por igualdade contra `'PLU'` continuava compilando e mandava TODOS os tipos
 * para a cor de exceção — quatro barras da mesma cor, sem nada quebrar.
 *
 * A regra olha o início do nome, sem acento e em maiúscula, para valer nas
 * duas origens e em qualquer terceira.
 */
function corDoTipoDePosto(tipo: string): string {
  // Faixa dos sinais diacríticos combinantes, escrita por escape: caractere
  // invisível colado no fonte é o tipo de coisa que some numa edição futura.
  const chave = tipo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (chave.startsWith('PLU')) return 'bg-gov-azul';
  if (chave.startsWith('FLU')) return 'bg-gov-sucesso';
  if (chave.startsWith('MET')) return 'bg-gov-alerta';
  return 'bg-app-border-strong';
}

interface ProximaAcao {
  tipo: 'ana';
  rotulo: string;
  href: string;
}

type LinhaMantenedor = Awaited<
  ReturnType<typeof painelRepository.rankingMantenedores>
>[number];
type LinhaUgrhi = Awaited<
  ReturnType<typeof painelRepository.rankingUGRHI>
>[number];

const colunasMantenedores: readonly ColunaTabela<LinhaMantenedor>[] = [
  {
    chave: 'nome',
    cabecalho: 'Mantenedor / batalhão',
    interativa: true,
    render: (m) => (
      <Link
        href={`/?mantenedor=${encodeURIComponent(m.nome)}`}
        className="inline-flex items-center gap-2 rounded-sm text-app-fg hover:text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        aria-label={`Filtrar postos do mantenedor ${m.nome}`}
      >
        <Building2
          className="h-3.5 w-3.5 shrink-0 text-app-fg-muted"
          aria-hidden="true"
        />
        <span className="text-sm">{m.nome}</span>
      </Link>
    ),
  },
  {
    chave: 'total',
    cabecalho: 'Total',
    alinhar: 'right',
    classeCelula: 'tabular mono text-app-fg',
    render: (m) => m.total.toLocaleString('pt-BR'),
  },
  {
    chave: 'ativos',
    cabecalho: 'Ativos',
    alinhar: 'right',
    classeCelula: 'tabular mono text-gov-sucesso',
    render: (m) => m.ativos.toLocaleString('pt-BR'),
  },
  {
    chave: 'cobertura',
    cabecalho: 'Cobertura ativa',
    largura: '11rem',
    render: (m) => (
      <div className="flex items-center gap-2">
        <BarraProgresso
          valor={m.ativos}
          total={m.total}
          cor="bg-gov-sucesso"
          tamanho="sm"
        />
        <span className="w-12 text-right mono text-2xs tabular text-app-fg-muted">
          {m.total === 0 ? '—' : `${((m.ativos / m.total) * 100).toFixed(0)}%`}
        </span>
      </div>
    ),
  },
];

const colunasUgrhi: readonly ColunaTabela<LinhaUgrhi>[] = [
  {
    chave: 'ugrhi',
    cabecalho: 'UGRHI',
    interativa: true,
    render: (u) => (
      <Link
        href={`/?ugrhi=${encodeURIComponent(u.numero)}`}
        className="block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        aria-label={`Filtrar postos da UGRHI ${u.numero} ${u.nome}`}
      >
        <span className="mono text-2xs text-app-fg-subtle">#{u.numero}</span>{' '}
        <span className="text-sm text-app-fg">{u.nome}</span>
        <span className="ml-2 text-2xs text-app-fg-muted tabular">
          ({u.total} postos)
        </span>
      </Link>
    ),
  },
  {
    chave: 'desconformes',
    cabecalho: 'Desconformes',
    alinhar: 'right',
    classeCelula: 'tabular mono text-app-fg',
    render: (u) => u.desconformes,
  },
  {
    chave: 'taxa',
    cabecalho: 'Taxa',
    largura: '11rem',
    render: (u) => {
      // Severidade da taxa de desconformidade. NÃO depender só da cor da barra
      // (WCAG 1.4.1): a classificação entra no rótulo acessível e o percentual
      // visível ao lado é o indicador não-cor da magnitude.
      const severidade =
        u.taxa >= 0.3
          ? { cor: 'bg-gov-perigo', texto: 'alta' }
          : u.taxa >= 0.2
            ? { cor: 'bg-gov-alerta', texto: 'em atenção' }
            : { cor: 'bg-gov-azul', texto: 'normal' };
      const pct = formatarPercentual(u.taxa * 100);
      return (
        <div className="flex items-center gap-2">
          <BarraProgresso
            valor={u.desconformes}
            total={u.total}
            cor={severidade.cor}
            tamanho="sm"
            rotulo={`Taxa de desconformidade ${severidade.texto}: ${pct}`}
          />
          <span className="w-12 text-right mono text-2xs tabular text-app-fg-muted">
            {pct}
          </span>
        </div>
      );
    },
  },
];

export default async function PaginaPainel() {
  let resumo: Awaited<ReturnType<typeof painelRepository.resumoPendencias>> | null = null;
  let tipos: Awaited<ReturnType<typeof painelRepository.distribuicaoPorTipo>> = [];
  let ugrhis: Awaited<ReturnType<typeof painelRepository.rankingUGRHI>> = [];
  let classes: Awaited<ReturnType<typeof painelRepository.classesDesconformidade>> = [];
  let statusOp: Awaited<ReturnType<typeof painelRepository.statusOperacional>> | null = null;
  let mantenedores: Awaited<ReturnType<typeof painelRepository.rankingMantenedores>> = [];
  // Tolerante a falha DE PROPÓSITO (ver o `.catch` abaixo): esta consulta é a
  // única do painel que só serve para decidir se um indicador foi apurado.
  let atividade:
    | Awaited<ReturnType<typeof painelRepository.atividadeRecente>>
    | null = null;
  let falha = false;
  let proxima: ProximaAcao | null = null;

  try {
    [resumo, tipos, ugrhis, classes, statusOp, mantenedores, atividade] =
      await Promise.all([
        painelRepository.resumoPendencias(),
        painelRepository.distribuicaoPorTipo(),
        painelRepository.rankingUGRHI(),
        painelRepository.classesDesconformidade(),
        painelRepository.statusOperacional(),
        painelRepository.rankingMantenedores(15),
        /*
         * A atividade recente entrou no painel para responder UMA pergunta: a
         * indexação de arquivos já rodou nesta base? Sem ela, "postos sem
         * arquivo" não distingue rede não indexada de indexador que nunca
         * executou.
         *
         * Ela cai dentro do `Promise.all` para não custar uma ida a mais em
         * série, e traz o próprio `catch` para não derrubar o painel inteiro:
         * antes desta consulta a tela sobrevivia sem ela, e continuar
         * sobrevivendo é requisito. Falhar aqui vira "não apurado" com motivo
         * próprio, e nunca silêncio — o log é o que separa isso de um caminho
         * que não faz nada sem dizer.
         */
        painelRepository.atividadeRecente().catch((e: unknown) => {
          logger.warn(
            'painel.atividadeRecente.falha',
            { motivo: e instanceof Error ? e.message : String(e) },
            'Atividade recente indisponível; indicadores de indexação ficam não apurados',
          );
          return null;
        }),
      ]);
  } catch (e) {
    logger.error(
      'painel.agregacoes.falha',
      { motivo: e instanceof Error ? e.message : String(e) },
      'Falha ao carregar agregações',
    );
    falha = true;
  }

  // CTA "Proxima acao" para aprovadores: surge quando ha estacao ANA aberta
  try {
    const usuario = await obterUsuarioAtual();
    if (usuario) {
      const eh = await papeisRepository.ehAprovador(usuario.id);
      if (eh) {
        const lote = await anaRevisaoRepository.loteAtual();
        if (lote) {
          const fila = await anaRevisaoRepository.listar(lote.id, {
            operando: 'sim',
            status: 'pendente',
            porPagina: 1,
          });
          if (fila.itens[0]) {
            proxima = {
              tipo: 'ana',
              rotulo: `estação ANA ${fila.itens[0].codigoAna} pendente`,
              href: `/inventario-ana/${encodeURIComponent(fila.itens[0].codigoAna)}`,
            };
          }
        }
      }
    }
  } catch {
    /* tolera, painel continua */
  }

  if (falha || !resumo || !statusOp) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-app-fg">Painel de operação</h1>
        <Alerta tipo="erro" titulo="Falha ao carregar painel">
          Não foi possível conectar ao banco. Tente novamente em instantes.
        </Alerta>
      </div>
    );
  }

  const pctCobertura =
    resumo.totalPostos === 0
      ? 0
      : (resumo.postosComArquivos / resumo.totalPostos) * 100;

  /*
   * OS DOIS VEREDITOS DE APURAÇÃO.
   *
   * Antes deles, dois indicadores chegavam à tela como zero vermelho e nenhum
   * gestor conseguia resolver: "postos sem arquivo" repetia o total da rede
   * porque o indexador nunca rodou, e "cadastro irregular" saía zerado porque
   * a régua de desconformidade não descreve o vocabulário do `Dbfch`. A regra
   * e o porquê de cada um estão em `@/lib/painel-apuracao`.
   */
  const semArquivo = apuracaoDePostosSemArquivo(
    atividade,
    resumo.postosSemArquivos,
  );
  const conformidade = apuracaoDeConformidade(
    resumo.desconformidadesPostos,
    classes,
  );

  const classesPrefixo = classes
    .filter((c) => c.tipo === 'prefixo')
    .sort((a, b) => b.total - a.total);
  const classesPrefixoAna = classes
    .filter((c) => c.tipo === 'prefixo_ana')
    .sort((a, b) => b.total - a.total);
  const totalDesconfPrefixo = classesPrefixo.reduce((a, c) => a + c.total, 0);
  const totalDesconfPrefixoAna = classesPrefixoAna.reduce((a, c) => a + c.total, 0);

  const ugrhiPiores = ugrhis
    .filter((u) => u.total > 0)
    .sort((a, b) => b.taxa - a.taxa)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-app-fg">Painel de operação</h1>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            Visão consolidada da rede hidrológica · pendências, cobertura e atividade
          </p>
        </div>
        <p className="text-2xs text-app-fg-subtle tabular">
          Dados atualizados em {formatarDataHora(new Date())}
        </p>
      </header>

      {/* CTA compacto: 1 linha apenas, link discreto */}
      {proxima ? (
        <div className="flex flex-wrap items-center gap-3 rounded border-l-4 border-gov-perigo bg-red-50 px-3 py-2 text-sm">
          <span className="font-medium text-gov-perigo">Próxima ação:</span>
          <span className="flex-1 text-app-fg">{proxima.rotulo}</span>
          <Link
            href={proxima.href}
            className="inline-flex items-center gap-1 rounded bg-gov-perigo px-2 py-1 text-2xs font-medium text-white hover:bg-red-900"
          >
            Resolver
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      {/* AÇÕES NECESSÁRIAS */}
      <section aria-labelledby="sec-acoes" className="space-y-3">
        <h2
          id="sec-acoes"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          Ações necessárias
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/*
            O rótulo "Rodar worker" saiu daqui, e ele nunca chegou a aparecer
            na tela: o `CardKPI` só desenha a linha de ação quando existe
            `href`, e este cartão não tinha nenhum. Ou seja, era promessa
            escrita no código esperando alguém ligar um destino — e o destino
            não existe, porque a imagem do órgão não tem o indexador (runbook
            §9.3). Sai o texto, e uma guarda passa a reprovar rótulo de ação
            sem destino em qualquer cartão do sistema.
          */}
          <CardKPI
            titulo="Postos sem arquivo"
            valor={
              semArquivo.apurado
                ? semArquivo.valor
                : naoApurado(semArquivo.motivo)
            }
            contexto={`${formatarPercentual(100 - pctCobertura)} da rede não indexada`}
            severidade="critica"
            icone={FolderX}
            valorAnterior={resumo.tendencias.postosSemArquivos?.valorAnterior}
            serie={resumo.tendencias.postosSemArquivos?.serie}
            sentidoPositivo="menor"
            rotuloPeriodo="vs. mês anterior"
          />
          <CardKPI
            titulo="Cadastro irregular"
            valor={
              conformidade.apurado
                ? conformidade.valor
                : naoApurado(conformidade.motivo)
            }
            contexto="prefixo ou código ANA inconsistente"
            severidade="alta"
            icone={AlertTriangle}
            href={conformidade.apurado ? '/desconformidades' : undefined}
            rotuloAcao="Revisar lista"
          />
          {/*
            Zero MEDIDO é boa notícia, e tem de parecer boa notícia: em âmbar,
            ao lado de dois cartões não apurados, o painel inteiro virava campo
            de alarme. É a regra que "Sem coordenadas" e o inventário ANA já
            seguem, e ela é o outro lado da distinção que esta entrega faz:
            "não apurado" fica neutro, "medimos e deu zero" fica verde.
          */}
          <CardKPI
            titulo="Arquivos órfãos"
            valor={resumo.arquivosOrfaos}
            contexto="não associados a posto"
            severidade={resumo.arquivosOrfaos > 0 ? 'alta' : 'sucesso'}
            icone={FileWarning}
            href="/desconformidades/arquivos-malformados"
            rotuloAcao="Classificar"
            valorAnterior={resumo.tendencias.arquivosOrfaos?.valorAnterior}
            serie={resumo.tendencias.arquivosOrfaos?.serie}
            sentidoPositivo="menor"
            rotuloPeriodo="vs. mês anterior"
          />
          <CardKPI
            titulo="Sem coordenadas"
            valor={resumo.postosSemCoordenadas}
            contexto={`de ${resumo.totalPostos.toLocaleString('pt-BR')} postos`}
            severidade={resumo.postosSemCoordenadas > 0 ? 'critica' : 'sucesso'}
            icone={MapPinOff}
          />
        </div>
      </section>

      {/* PANORAMA */}
      <section aria-labelledby="sec-panorama" className="space-y-3">
        <h2
          id="sec-panorama"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          Panorama da rede
        </h2>
        {/*
          Dois indicadores, então a grade para em 2 colunas: com
          `lg:grid-cols-3` sobraria um terço vazio na linha.

          O terceiro era "Telemetria ativa", e ele foi retirado quando o painel
          lia só o PostgreSQL, que ficou com zero linhas em `postos` depois que
          o cadastro migrou para o SQL Server do órgão.

          ESSA RAZÃO CAIU EM 03/09/2026: o painel passou a compor as duas
          origens e o cadastro volta a responder (5.790 postos, 99,9% com
          coordenada). `resumoCadastro()` já traz `postosComTelemetria` do
          `Dbfch`, então o dado está aqui — falta MEDIR quanto ele vale nesta
          base antes de publicar o cartão, porque o número é desconhecido e um
          "0,0% transmitindo" errado é o mesmo alarme falso de sempre. Enquanto
          isso não for medido, o cartão fica fora, e este comentário é a dívida
          declarada, não uma justificativa que envelheceu.
        */}
        <div className="grid gap-3 sm:grid-cols-2">
          <CardKPI
            titulo="Total de postos"
            valor={resumo.totalPostos}
            contexto="cadastrados no sistema"
            severidade="info"
            icone={Database}
            valorAnterior={resumo.tendencias.totalPostos?.valorAnterior}
            serie={resumo.tendencias.totalPostos?.serie}
            sentidoPositivo="maior"
            rotuloPeriodo="vs. mês anterior"
          />
          <CardKPI
            titulo="Cobertura geográfica"
            valor={formatarPercentual(
              resumo.totalPostos === 0
                ? 0
                : (resumo.postosComCoordenadas / resumo.totalPostos) * 100,
            )}
            contexto={`${resumo.postosComCoordenadas.toLocaleString('pt-BR')} com coordenadas`}
            severidade="sucesso"
            icone={FileCheck}
            formatarValor={false}
          />
        </div>

        <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-app-fg">
              Distribuição por tipo de posto
            </h3>
            <span className="text-2xs text-app-fg-subtle tabular">
              {tipos.length} categorias
            </span>
          </div>
          {/*
            Rótulo em cima, barra embaixo. A versão anterior punha o rótulo
            numa coluna de 3,5rem ao lado da barra, o que só funcionava
            enquanto a origem devolvia a sigla de três letras: com o cadastro
            do órgão o valor virou "PLUVIOMÉTRICO" e o texto passava POR CIMA
            da barra. Esta forma não depende do comprimento do rótulo, e é a
            mesma do quadro de tipos de inconsistência mais abaixo.
          */}
          {tipos.length === 0 ? (
            <p className="text-xs text-app-fg-muted">
              Nenhum posto classificado por tipo nesta base.
            </p>
          ) : (
          <ul className="space-y-3">
            {tipos.map((t) => {
              const totalTipo = tipos.reduce((a, x) => a + x.total, 0);
              return (
                <li key={t.tipo} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-app-fg">
                      {t.tipo}
                    </span>
                    <span className="mono shrink-0 text-2xs tabular text-app-fg-muted">
                      {t.total.toLocaleString('pt-BR')} de{' '}
                      {totalTipo.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <BarraProgresso
                    valor={t.total}
                    total={totalTipo}
                    cor={corDoTipoDePosto(t.tipo)}
                    tamanho="sm"
                  />
                </li>
              );
            })}
          </ul>
          )}
        </div>
      </section>

      {/* STATUS OPERACIONAL */}
      <section aria-labelledby="sec-status" className="space-y-3">
        <h2
          id="sec-status"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          Status operacional
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <CardKPI
            titulo="Postos ativos"
            valor={statusOp.ativos}
            contexto={`${formatarPercentual(statusOp.total === 0 ? 0 : (statusOp.ativos / statusOp.total) * 100)} da rede`}
            severidade="sucesso"
            icone={Power}
            href="/?status=ativo"
            rotuloAcao="Ver lista"
          />
          <CardKPI
            titulo="Postos desativados"
            valor={statusOp.desativados}
            contexto={`${formatarPercentual(statusOp.total === 0 ? 0 : (statusOp.desativados / statusOp.total) * 100)} da rede`}
            severidade="info"
            icone={PowerOff}
            href="/?status=desativado"
            rotuloAcao="Ver lista"
          />
          <CardKPI
            titulo="Sem informação"
            valor={statusOp.indeterminados}
            contexto="ano de fim com sentinela 0"
            severidade={statusOp.indeterminados > 0 ? 'media' : 'sucesso'}
            icone={HelpCircle}
          />
        </div>
      </section>

      {/* MANTENEDORES */}
      <section aria-labelledby="sec-mantenedores" className="space-y-3">
        <h2
          id="sec-mantenedores"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          Mantenedores e batalhões
        </h2>
        <Tabela
          legenda="Top mantenedores e batalhões por número de postos sob gestão, com total, ativos e cobertura ativa."
          colunas={colunasMantenedores}
          itens={mantenedores}
          densidade="compact"
          chaveItem={(m) => m.nome}
          vazio={
            <BlocoSemOcorrencia texto="Nenhum mantenedor com posto sob gestão nesta base." />
          }
        />
      </section>

      {/*
        CONFORMIDADE DO CADASTRO — as duas seções abaixo (ranking de UGRHI e
        tipos de inconsistência) saem da MESMA régua do cartão "Cadastro
        irregular", então elas aparecem e somem juntas. Mostrar uma tabela de
        UGRHI ordenada por uma taxa que não foi apurada seria um ranking sem
        critério de ordenação, com cara de ranking.

        Quando não há apuração, as duas viram UMA seção com o motivo: sumir sem
        explicar faz o painel parecer que nunca teve a funcionalidade.
      */}
      {conformidade.apurado ? (
        <>
          {/* UGRHIs */}
          <section aria-labelledby="sec-ugrhi" className="space-y-3">
            <h2
              id="sec-ugrhi"
              className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
            >
              UGRHIs com maior % de cadastro irregular
            </h2>
            <Tabela
              legenda="Top 10 UGRHIs com maior taxa de postos desconformes, com contagem de desconformes e taxa percentual."
              colunas={colunasUgrhi}
              itens={ugrhiPiores}
              densidade="compact"
              chaveItem={(u) => String(u.numero)}
              vazio={
                <BlocoSemOcorrencia texto="Nenhuma UGRHI com posto de cadastro irregular." />
              }
            />
          </section>

          {/* CLASSES DE INCONSISTÊNCIA */}
          <section aria-labelledby="sec-classes" className="space-y-3">
            <h2
              id="sec-classes"
              className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
            >
              Tipos de inconsistência detectados
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
                <h3 className="mb-2 text-sm font-semibold text-app-fg">
                  Prefixo ({totalDesconfPrefixo})
                </h3>
                {classesPrefixo.length === 0 ? (
                  <p className="text-xs text-app-fg-muted">
                    Nenhuma inconsistência de prefixo detectada.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {classesPrefixo.map((c) => (
                      <li key={c.classe} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs text-app-fg-muted">{rotuloClasse(c.classe)}</span>
                          <span className="mono tabular text-2xs text-app-fg">{c.total}</span>
                        </div>
                        <BarraProgresso valor={c.total} total={totalDesconfPrefixo} cor="bg-gov-azul" tamanho="sm" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
                <h3 className="mb-2 text-sm font-semibold text-app-fg">
                  Código ANA ({totalDesconfPrefixoAna})
                </h3>
                {classesPrefixoAna.length === 0 ? (
                  <p className="text-xs text-app-fg-muted">
                    Nenhuma inconsistência de código ANA detectada.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {classesPrefixoAna.map((c) => (
                      <li key={c.classe} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs text-app-fg-muted">{rotuloClasse(c.classe)}</span>
                          <span className="mono tabular text-2xs text-app-fg">{c.total}</span>
                        </div>
                        <BarraProgresso valor={c.total} total={totalDesconfPrefixoAna} cor="bg-gov-alerta" tamanho="sm" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section aria-labelledby="sec-conformidade" className="space-y-3">
          <h2
            id="sec-conformidade"
            className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
          >
            Conformidade do cadastro
          </h2>
          <BlocoNaoApurado motivo={conformidade.motivo} />
        </section>
      )}
    </div>
  );
}
