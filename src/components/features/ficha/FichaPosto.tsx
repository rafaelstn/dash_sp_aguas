import {
  Fingerprint,
  Power,
  PowerOff,
  HelpCircle,
  Radio,
  RadioTower,
  type LucideIcon,
} from 'lucide-react';
import type { Posto } from '@/domain/posto';
import { formatarValor } from '@/lib/format';

interface Linha {
  rotulo: string;
  valor: unknown;
}

interface Secao {
  titulo: string;
  linhas: Linha[];
}

function montarSecoes(p: Posto): Secao[] {
  return [
    {
      titulo: 'Identificação',
      linhas: [
        { rotulo: 'Prefixo', valor: p.prefixo },
        { rotulo: 'Prefixo ANA', valor: p.prefixoAna },
        { rotulo: 'Nome da estação', valor: p.nomeEstacao },
        { rotulo: 'Tipo de posto', valor: p.tipoPosto },
        { rotulo: 'Rede', valor: p.rede },
        { rotulo: 'Proprietário', valor: p.proprietario },
        { rotulo: 'Mantenedor', valor: p.mantenedor },
      ],
    },
    {
      titulo: 'Localização',
      linhas: [
        { rotulo: 'Município', valor: p.municipio },
        { rotulo: 'Município (alternativo)', valor: p.municipioAlt },
        { rotulo: 'Latitude', valor: p.latitude },
        { rotulo: 'Longitude', valor: p.longitude },
        { rotulo: 'Altimetria (m)', valor: p.altimetria },
      ],
    },
    {
      titulo: 'Bacia e UGRHI',
      linhas: [
        { rotulo: 'Bacia hidrográfica', valor: p.baciaHidrografica },
        { rotulo: 'CoBacia', valor: p.cobacia },
        { rotulo: 'UGRHI', valor: p.ugrhiNome },
        { rotulo: 'Número UGRHI', valor: p.ugrhiNumero },
        { rotulo: 'Sub-UGRHI', valor: p.subUgrhiNome },
        { rotulo: 'Número sub-UGRHI', valor: p.subUgrhiNumero },
        { rotulo: 'Aquífero', valor: p.aquifero },
        { rotulo: 'Área (km²)', valor: p.areaKm2 },
      ],
    },
    {
      titulo: 'Operação',
      linhas: [
        { rotulo: 'Início de operação', valor: p.operacaoInicioAno },
        { rotulo: 'Fim de operação', valor: p.operacaoFimAno },
        { rotulo: 'Status PCD', valor: p.statusPcd },
        { rotulo: 'Última transmissão', valor: p.ultimaTransmissao },
        { rotulo: 'Tempo de transmissão', valor: p.tempoTransmissao },
      ],
    },
    {
      titulo: 'Equipamentos e medições',
      linhas: [
        { rotulo: 'Convencional', valor: p.convencional },
        { rotulo: 'Logger', valor: p.loggerEqp },
        { rotulo: 'Telemétrico', valor: p.telemetrico },
        { rotulo: 'Nível', valor: p.nivel },
        { rotulo: 'Vazão', valor: p.vazao },
        { rotulo: 'BTL', valor: p.btl },
        { rotulo: 'Companhia ambiental', valor: p.ciaAmbiental },
      ],
    },
    {
      titulo: 'Fichas associadas',
      linhas: [
        { rotulo: 'Ficha de inspeção', valor: p.fichaInspecao },
        { rotulo: 'Última data FI', valor: p.ultimaDataFi },
        { rotulo: 'Ficha descritiva', valor: p.fichaDescritiva },
        { rotulo: 'Última atualização FD', valor: p.ultimaAtualizacaoFd },
      ],
    },
    {
      titulo: 'Observações',
      linhas: [{ rotulo: 'Observações', valor: p.observacoes }],
    },
  ];
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .toLowerCase();
}

type Tom = 'sucesso' | 'perigo' | 'neutro' | 'info';

interface DadoStat {
  rotulo: string;
  valor: string;
  contexto?: string;
  icone: LucideIcon;
  tom: Tom;
}

const TONS: Record<Tom, { borda: string; icone: string; fundo: string }> = {
  sucesso: {
    borda: 'border-l-gov-sucesso',
    icone: 'text-gov-sucesso',
    fundo: 'bg-emerald-50',
  },
  perigo: {
    borda: 'border-l-gov-perigo',
    icone: 'text-gov-perigo',
    fundo: 'bg-red-50',
  },
  info: {
    borda: 'border-l-gov-azul',
    icone: 'text-gov-azul',
    fundo: 'bg-gov-azul-claro',
  },
  neutro: {
    borda: 'border-l-app-border',
    icone: 'text-app-fg-muted',
    fundo: 'bg-app-surface-2',
  },
};

/**
 * Deriva o status operacional do posto a partir do ano de fim de operação.
 * Sentinela `0` ou ausente = indeterminado (mesma convenção do painel).
 */
function statusOperacional(p: Posto): DadoStat {
  const fim = p.operacaoFimAno;
  if (fim === null || fim === undefined || fim === 0) {
    if (p.operacaoInicioAno && p.operacaoInicioAno > 0) {
      return {
        rotulo: 'Status operacional',
        valor: 'Em operação',
        contexto:
          p.operacaoInicioAno > 0 ? `desde ${p.operacaoInicioAno}` : undefined,
        icone: Power,
        tom: 'sucesso',
      };
    }
    return {
      rotulo: 'Status operacional',
      valor: 'Sem informação',
      contexto: 'ano de operação não registrado',
      icone: HelpCircle,
      tom: 'neutro',
    };
  }
  return {
    rotulo: 'Status operacional',
    valor: 'Desativado',
    contexto: `encerrado em ${fim}`,
    icone: PowerOff,
    tom: 'perigo',
  };
}

/**
 * Deriva o status de telemetria. Considera "ativa" quando o campo
 * `telemetrico` indica presença (valores como "sim", "S", "1", "telemétrico").
 */
function statusTelemetria(p: Posto): DadoStat {
  const bruto = (p.telemetrico ?? '').toString().trim().toLowerCase();
  const ativa =
    bruto.length > 0 &&
    !['nao', 'não', 'n', '0', '-', 'false'].includes(bruto);
  if (ativa) {
    return {
      rotulo: 'Telemetria',
      valor: 'Ativa',
      contexto: p.ultimaTransmissao
        ? `última transmissão ${p.ultimaTransmissao}`
        : undefined,
      icone: RadioTower,
      tom: 'info',
    };
  }
  return {
    rotulo: 'Telemetria',
    valor: 'Sem telemetria',
    contexto: 'medição convencional',
    icone: Radio,
    tom: 'neutro',
  };
}

function montarStats(p: Posto): DadoStat[] {
  return [
    {
      rotulo: 'Prefixo',
      valor: p.prefixo,
      contexto: p.tipoPosto ? `tipo ${p.tipoPosto}` : undefined,
      icone: Fingerprint,
      tom: 'info',
    },
    statusOperacional(p),
    statusTelemetria(p),
  ];
}

function CartaoStat({ dado }: { dado: DadoStat }) {
  const t = TONS[dado.tom];
  const Icone = dado.icone;
  return (
    <div
      className={`flex items-start gap-3 rounded-gov-card border border-app-border-subtle border-l-4 ${t.borda} bg-app-surface p-3`}
    >
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${t.fundo}`}
        aria-hidden="true"
      >
        <Icone className={`h-5 w-5 ${t.icone}`} strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="text-2xs font-medium uppercase tracking-wide text-app-fg-muted">
          {dado.rotulo}
        </p>
        <p className="mono truncate text-base font-semibold text-app-fg">
          {dado.valor}
        </p>
        {dado.contexto ? (
          <p className="truncate text-2xs text-app-fg-muted">{dado.contexto}</p>
        ) : null}
      </div>
    </div>
  );
}

export function FichaPosto({ posto }: { posto: Posto }) {
  const secoes = montarSecoes(posto);
  const stats = montarStats(posto);
  return (
    <article className="space-y-6">
      {/* Destaque dos campos-chave antes da tabela densa. */}
      <section aria-label="Indicadores principais do posto">
        <h2 className="sr-only">Indicadores principais do posto</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((dado) => (
            <CartaoStat key={dado.rotulo} dado={dado} />
          ))}
        </div>
      </section>

      {secoes.map((secao) => {
        const id = `sec-${slug(secao.titulo)}`;
        return (
          <section key={secao.titulo} aria-labelledby={id}>
            <h2
              id={id}
              className="mb-3 border-b border-app-border-subtle pb-1 text-lg font-semibold text-app-fg"
            >
              {secao.titulo}
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
              {secao.linhas.map((linha) => (
                <div key={linha.rotulo} className="flex flex-col">
                  <dt className="text-sm text-app-fg-muted">{linha.rotulo}</dt>
                  <dd className="text-app-fg">{formatarValor(linha.valor)}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </article>
  );
}
