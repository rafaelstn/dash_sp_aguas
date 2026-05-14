import Link from 'next/link';
import {
  AlertTriangle,
  FileWarning,
  FolderX,
  MapPinOff,
  FileCheck,
  Database,
  Radio,
  Power,
  PowerOff,
  HelpCircle,
  Building2,
  Search,
  ClipboardCheck,
} from 'lucide-react';
import { painelRepository } from '@/infrastructure/db/painel-repository.pg';
import {
  anaRevisaoRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { CardKPI } from '@/components/features/painel/CardKPI';
import { BarraProgresso } from '@/components/features/painel/BarraProgresso';
import { Alerta } from '@/components/ui/Alerta';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Painel — Ficha Técnica SPÁguas',
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

export default async function PaginaPainel() {
  let resumo: Awaited<ReturnType<typeof painelRepository.resumoPendencias>> | null = null;
  let tipos: Awaited<ReturnType<typeof painelRepository.distribuicaoPorTipo>> = [];
  let ugrhis: Awaited<ReturnType<typeof painelRepository.rankingUGRHI>> = [];
  let classes: Awaited<ReturnType<typeof painelRepository.classesDesconformidade>> = [];
  let statusOp: Awaited<ReturnType<typeof painelRepository.statusOperacional>> | null = null;
  let mantenedores: Awaited<ReturnType<typeof painelRepository.rankingMantenedores>> = [];
  let falha = false;
  let resumoAna: Awaited<ReturnType<typeof anaRevisaoRepository.resumoPainel>> | null = null;
  let prazoAna: Date | null = null;

  try {
    [resumo, tipos, ugrhis, classes, statusOp, mantenedores] =
      await Promise.all([
        painelRepository.resumoPendencias(),
        painelRepository.distribuicaoPorTipo(),
        painelRepository.rankingUGRHI(),
        painelRepository.classesDesconformidade(),
        painelRepository.statusOperacional(),
        painelRepository.rankingMantenedores(15),
      ]);
  } catch (e) {
    console.error('[painel] Falha ao carregar agregações', e);
    falha = true;
  }

  // Auditoria ANA: visível apenas para aprovadores
  let proximaEstacao: { codigoAna: string; nome: string | null; municipio: string | null } | null = null;
  try {
    const usuario = await obterUsuarioAtual();
    if (usuario) {
      const eh = await papeisRepository.ehAprovador(usuario.id);
      if (eh) {
        const lote = await anaRevisaoRepository.loteAtual();
        if (lote) {
          resumoAna = await anaRevisaoRepository.resumoPainel(lote.id);
          prazoAna = lote.prazoResposta;

          // F6 Fernanda: card "Próxima estação a corrigir".
          // Prioriza: operando=sim AND divergente AND pendente.
          const fila = await anaRevisaoRepository.listar(lote.id, {
            operando: 'sim',
            divergenciaMunicipio: 'divergente',
            status: 'pendente',
            porPagina: 1,
          });
          const escolha =
            fila.itens[0] ??
            (await anaRevisaoRepository.listar(lote.id, {
              divergenciaMunicipio: 'divergente',
              status: 'pendente',
              porPagina: 1,
            })).itens[0];
          if (escolha) {
            proximaEstacao = {
              codigoAna: escolha.codigoAna,
              nome: escolha.nome,
              municipio: escolha.municipioNome,
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
  const taxaTelem =
    resumo.totalPostos === 0
      ? 0
      : (resumo.postosComTelemetria / resumo.totalPostos) * 100;

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

      {resumoAna && proximaEstacao ? (
        <section
          aria-labelledby="sec-prox"
          className="rounded-gov-card border-l-4 border-gov-azul bg-blue-50 p-4"
        >
          <h2 id="sec-prox" className="text-sm font-semibold text-app-fg">
            Próxima estação a revisar
          </h2>
          <p className="mt-1 text-sm text-app-fg">
            <strong className="mono">{proximaEstacao.codigoAna}</strong>{' '}
            — {proximaEstacao.nome ?? 'Sem nome'}
            {proximaEstacao.municipio ? (
              <>
                {' '}
                <span className="text-app-fg-muted">
                  ({proximaEstacao.municipio})
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-2 text-2xs text-app-fg-muted">
            {resumoAna.totalPendencias.toLocaleString('pt-BR')} estações restantes ·{' '}
            {resumoAna.statusRevisada.toLocaleString('pt-BR')} já revisadas ·
            progresso da Meta I.6:{' '}
            <strong className="tabular">
              {resumoAna.totalPendencias > 0
                ? (
                    (resumoAna.statusRevisada /
                      (resumoAna.totalPendencias + resumoAna.statusRevisada)) *
                    100
                  ).toFixed(0)
                : 100}
              %
            </strong>
          </p>
          <Link
            href={`/inventario-ana/${encodeURIComponent(proximaEstacao.codigoAna)}`}
            className="mt-3 inline-block rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Abrir e corrigir
          </Link>
        </section>
      ) : null}

      {resumoAna ? (
        <section aria-labelledby="sec-ana" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="sec-ana"
              className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
            >
              Auditoria ANA · Meta I.6 PROGESTÃO
            </h2>
            {prazoAna ? (
              <p className="text-2xs text-app-fg-subtle">
                Prazo:{' '}
                <span className="font-semibold text-gov-perigo tabular">
                  {new Intl.DateTimeFormat('pt-BR').format(new Date(prazoAna))}
                </span>
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CardKPI
              titulo="Pendências ANA"
              valor={resumoAna.totalPendencias}
              contexto={`de ${resumoAna.totalEstacoes.toLocaleString('pt-BR')} estações no inventário`}
              severidade="alta"
              icone={FileWarning}
              href="/inventario-ana"
              rotuloAcao="Abrir fila"
            />
            <CardKPI
              titulo="Operando (prioridade)"
              valor={resumoAna.operando}
              contexto="estações ativas com observação"
              severidade={resumoAna.operando > 0 ? 'critica' : 'sucesso'}
              icone={AlertTriangle}
              href="/inventario-ana?operando=sim"
              rotuloAcao="Filtrar"
            />
            <CardKPI
              titulo="Divergência geo (≥10km)"
              valor={resumoAna.divergenciaDivergente}
              contexto={`+ ${resumoAna.divergenciaMargem.toLocaleString('pt-BR')} em margem aceitável`}
              severidade={resumoAna.divergenciaDivergente > 0 ? 'alta' : 'sucesso'}
              icone={AlertTriangle}
              href="/inventario-ana?divergencia=divergente"
              rotuloAcao="Corrigir"
            />
            <CardKPI
              titulo="Sem match no banco"
              valor={resumoAna.semMatch}
              contexto="ANA aponta estação que não está em postos"
              severidade={resumoAna.semMatch > 0 ? 'media' : 'sucesso'}
              icone={Search}
              href="/inventario-ana?semMatch=true"
              rotuloAcao="Investigar"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CardKPI
              titulo="Já revisadas"
              valor={resumoAna.statusRevisada}
              contexto="aceitas, corrigidas ou descartadas"
              severidade="sucesso"
              icone={ClipboardCheck}
              href="/inventario-ana?status=revisada"
              rotuloAcao="Conferir"
            />
            <CardKPI
              titulo="Em revisão"
              valor={resumoAna.statusEmRevisao}
              contexto="rascunhos salvos sem fechar"
              severidade="info"
              icone={ClipboardCheck}
            />
            <CardKPI
              titulo="Pendente"
              valor={resumoAna.statusPendente}
              contexto="ainda não tocadas"
              severidade={resumoAna.statusPendente > 0 ? 'alta' : 'sucesso'}
              icone={FileWarning}
            />
            <CardKPI
              titulo="Descartadas"
              valor={resumoAna.statusDescartada}
              contexto="fora do escopo SPÁguas"
              severidade="info"
              icone={ClipboardCheck}
            />
          </div>
        </section>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          AÇÕES NECESSÁRIAS
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-acoes" className="space-y-3">
        <h2
          id="sec-acoes"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          Ações necessárias
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CardKPI
            titulo="Postos sem arquivo"
            valor={resumo.postosSemArquivos}
            contexto={`${(100 - pctCobertura).toFixed(1)}% da rede não indexada`}
            severidade="critica"
            icone={FolderX}
            rotuloAcao="Rodar worker"
          />
          <CardKPI
            titulo="Cadastro irregular"
            valor={resumo.desconformidadesPostos}
            contexto="prefixo ou código ANA inconsistente"
            severidade="alta"
            icone={AlertTriangle}
            href="/desconformidades"
            rotuloAcao="Revisar lista"
          />
          <CardKPI
            titulo="Arquivos órfãos"
            valor={resumo.arquivosOrfaos}
            contexto="não associados a posto"
            severidade="alta"
            icone={FileWarning}
            href="/desconformidades/arquivos-malformados"
            rotuloAcao="Classificar"
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

      {/* ═══════════════════════════════════════════════════
          PANORAMA DA REDE
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-panorama" className="space-y-3">
        <h2
          id="sec-panorama"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          Panorama da rede
        </h2>
        <div className="grid gap-3 lg:grid-cols-3">
          <CardKPI
            titulo="Total de postos"
            valor={resumo.totalPostos}
            contexto="cadastrados no sistema"
            severidade="info"
            icone={Database}
          />
          <CardKPI
            titulo="Cobertura geográfica"
            valor={`${(resumo.totalPostos === 0 ? 0 : (resumo.postosComCoordenadas / resumo.totalPostos) * 100).toFixed(1)}%`}
            contexto={`${resumo.postosComCoordenadas.toLocaleString('pt-BR')} com coordenadas`}
            severidade="sucesso"
            icone={FileCheck}
            formatarValor={false}
          />
          <CardKPI
            titulo="Telemetria ativa"
            valor={`${taxaTelem.toFixed(1)}%`}
            contexto={`${resumo.postosComTelemetria.toLocaleString('pt-BR')} postos transmitindo`}
            severidade={taxaTelem >= 20 ? 'sucesso' : 'media'}
            icone={Radio}
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
          <ul className="space-y-2.5">
            {tipos.map((t) => {
              const totalTipo = tipos.reduce((a, x) => a + x.total, 0);
              return (
                <li key={t.tipo} className="flex items-center gap-3">
                  <span className="w-14 text-sm font-medium text-app-fg mono">
                    {t.tipo}
                  </span>
                  <div className="flex-1">
                    <BarraProgresso
                      valor={t.total}
                      total={totalTipo}
                      cor={
                        t.tipo === 'PLU'
                          ? 'bg-gov-azul'
                          : t.tipo === 'FLU'
                            ? 'bg-gov-sucesso'
                            : 'bg-gov-alerta'
                      }
                      mostrarValor
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          STATUS OPERACIONAL — Ativos / Desativados
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-status" className="space-y-3">
        <h2
          id="sec-status"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          Status operacional
        </h2>
        <p className="text-2xs text-app-fg-subtle">
          Heurística de recência sobre <code className="mono">operacao_fim_ano</code>
          : ativo = ano corrente ou anterior · desativado = parou há mais de 1 ano
          · indeterminado = sem dado registrado.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <CardKPI
            titulo="Postos ativos"
            valor={statusOp.ativos}
            contexto={`${(statusOp.total === 0 ? 0 : (statusOp.ativos / statusOp.total) * 100).toFixed(1)}% da rede`}
            severidade="sucesso"
            icone={Power}
            href="/?status=ativo"
            rotuloAcao="Ver lista"
          />
          <CardKPI
            titulo="Postos desativados"
            valor={statusOp.desativados}
            contexto={`${(statusOp.total === 0 ? 0 : (statusOp.desativados / statusOp.total) * 100).toFixed(1)}% da rede`}
            severidade="info"
            icone={PowerOff}
            href="/?status=desativado"
            rotuloAcao="Ver lista"
          />
          <CardKPI
            titulo="Sem informação"
            valor={statusOp.indeterminados}
            contexto="ano de fim com sentinela 0 — revisar planilha-fonte"
            severidade={statusOp.indeterminados > 0 ? 'media' : 'sucesso'}
            icone={HelpCircle}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          MANTENEDORES — quem opera quantos postos
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-mantenedores" className="space-y-3">
        <h2
          id="sec-mantenedores"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          Mantenedores e batalhões
        </h2>
        <p className="text-2xs text-app-fg-subtle">
          Combinação dos campos <code className="mono">mantenedor</code> +{' '}
          <code className="mono">btl</code> — top {mantenedores.length} por
          número de postos. Coluna “ativos” usa a mesma heurística do status
          operacional.
        </p>
        <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Top mantenedores e batalhões por número de postos sob gestão
            </caption>
            <thead>
              <tr className="bg-app-surface-2">
                <th
                  scope="col"
                  className="border-b border-app-border-subtle px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
                >
                  Mantenedor / batalhão
                </th>
                <th
                  scope="col"
                  className="border-b border-app-border-subtle px-3 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
                >
                  Total
                </th>
                <th
                  scope="col"
                  className="border-b border-app-border-subtle px-3 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
                >
                  Ativos
                </th>
                <th
                  scope="col"
                  className="border-b border-app-border-subtle px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
                >
                  Cobertura ativa
                </th>
              </tr>
            </thead>
            <tbody>
              {mantenedores.map((m) => (
                <tr
                  key={m.nome}
                  className="border-b border-app-border-subtle last:border-0 hover:bg-app-surface-2"
                >
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/?mantenedor=${encodeURIComponent(m.nome)}`}
                      aria-label={`Filtrar postos do mantenedor ${m.nome} (${m.total.toLocaleString('pt-BR')} postos, ${m.ativos.toLocaleString('pt-BR')} ativos)`}
                      className="inline-flex items-center gap-2 text-app-fg hover:text-gov-azul hover:underline"
                    >
                      <Building2
                        className="h-3.5 w-3.5 shrink-0 text-app-fg-muted"
                        aria-hidden="true"
                      />
                      <span className="text-sm">{m.nome}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular mono text-sm text-app-fg">
                    {m.total.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular mono text-sm text-gov-sucesso">
                    {m.ativos.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <BarraProgresso
                        valor={m.ativos}
                        total={m.total}
                        cor="bg-gov-sucesso"
                        tamanho="sm"
                      />
                      <span className="w-12 text-right mono text-2xs tabular text-app-fg-muted">
                        {m.total === 0
                          ? '—'
                          : `${((m.ativos / m.total) * 100).toFixed(0)}%`}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          COBERTURA POR UGRHI
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-ugrhi" className="space-y-3">
        <h2
          id="sec-ugrhi"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
        >
          UGRHIs com maior % de cadastro irregular
        </h2>
        <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Top 10 UGRHIs com maior taxa de postos desconformes
            </caption>
            <thead>
              <tr className="bg-app-surface-2">
                <th
                  scope="col"
                  className="border-b border-app-border-subtle px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
                >
                  UGRHI
                </th>
                <th
                  scope="col"
                  className="border-b border-app-border-subtle px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
                >
                  Desconformes
                </th>
                <th
                  scope="col"
                  className="border-b border-app-border-subtle px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
                >
                  Taxa
                </th>
              </tr>
            </thead>
            <tbody>
              {ugrhiPiores.map((u) => (
                <tr
                  key={u.numero}
                  className="border-b border-app-border-subtle last:border-0 hover:bg-app-surface-2"
                >
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/?ugrhi=${encodeURIComponent(u.numero)}`}
                      aria-label={`Filtrar postos da UGRHI ${u.numero} ${u.nome} (${u.desconformes} desconformes de ${u.total})`}
                      className="block"
                    >
                      <span className="mono text-2xs text-app-fg-subtle">
                        #{u.numero}
                      </span>{' '}
                      <span className="text-sm text-app-fg">{u.nome}</span>
                      <span className="ml-2 text-2xs text-app-fg-muted tabular">
                        ({u.total} postos)
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 tabular mono text-sm text-app-fg">
                    {u.desconformes}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <BarraProgresso
                        valor={u.desconformes}
                        total={u.total}
                        cor={
                          u.taxa >= 0.3
                            ? 'bg-gov-perigo'
                            : u.taxa >= 0.2
                              ? 'bg-gov-alerta'
                              : 'bg-gov-azul'
                        }
                        tamanho="sm"
                      />
                      <span className="w-12 text-right mono text-2xs tabular text-app-fg-muted">
                        {(u.taxa * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          TIPOS DE INCONSISTÊNCIA
          ═══════════════════════════════════════════════════ */}
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
            <ul className="space-y-2">
              {classesPrefixo.map((c) => (
                <li key={c.classe} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-app-fg-muted">
                      {rotuloClasse(c.classe)}
                    </span>
                    <span className="mono tabular text-2xs text-app-fg">
                      {c.total}
                    </span>
                  </div>
                  <BarraProgresso
                    valor={c.total}
                    total={totalDesconfPrefixo}
                    cor="bg-gov-azul"
                    tamanho="sm"
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
            <h3 className="mb-2 text-sm font-semibold text-app-fg">
              Código ANA ({totalDesconfPrefixoAna})
            </h3>
            <ul className="space-y-2">
              {classesPrefixoAna.map((c) => (
                <li key={c.classe} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-app-fg-muted">
                      {rotuloClasse(c.classe)}
                    </span>
                    <span className="mono tabular text-2xs text-app-fg">
                      {c.total}
                    </span>
                  </div>
                  <BarraProgresso
                    valor={c.total}
                    total={totalDesconfPrefixoAna}
                    cor="bg-gov-alerta"
                    tamanho="sm"
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

    </div>
  );
}
