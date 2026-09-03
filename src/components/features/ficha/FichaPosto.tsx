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

/**
 * Ano de operação usa `0` como sentinela de "não registrado" no cadastro do
 * órgão (mesma convenção de `statusOperacional` e do painel). Sem esta
 * conversão a ficha exibiria literalmente "0" como ano.
 */
function anoOperacao(valor: number | null | undefined): number | null {
  return valor === null || valor === undefined || valor === 0 ? null : valor;
}

/**
 * Quatro seções, na ordem em que o operador procura: quem é o posto, onde
 * fica, a que bacia pertence e o que ele mede.
 *
 * A disposição anterior tinha sete seções e vinha da planilha que originou a
 * tabela, não do cadastro do órgão. "Status PCD", "Última transmissão",
 * "Tempo de transmissão", "BTL", "Companhia ambiental", "Rede", "CoBacia",
 * as quatro linhas de "Fichas associadas" e "Observações" não existem no
 * banco oficial e ficariam permanentemente em "Não informado". Sem elas,
 * "Operação" sobraria com dois campos e as duas últimas seções ficariam sem
 * nenhum. Anos de operação e equipamentos respondem à mesma pergunta ("o que
 * este posto mede, e desde quando"), então foram fundidos em vez de virar uma
 * seção de duas linhas.
 *
 * `telemetrico` FICOU, e a distinção custou uma remoção indevida: ele não é
 * coluna do `Dbfch`, é derivado de `AparelhoPostos` x `Aparelhos`, então
 * varredura por `sys.columns` não o enxerga e amostra pequena não o encontra
 * (preenche 149 postos, 2,6% da base). O valor é a designação do aparelho
 * ATIVO, algo como "PLUVIOMETRO TELEMETRICO".
 */
function montarSecoes(p: Posto): Secao[] {
  return [
    {
      titulo: 'Identificação',
      linhas: [
        { rotulo: 'Prefixo', valor: p.prefixo },
        { rotulo: 'Prefixo ANA', valor: p.prefixoAna },
        { rotulo: 'Nome da estação', valor: p.nomeEstacao },
        { rotulo: 'Tipo de posto', valor: p.tipoPosto },
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
        { rotulo: 'UGRHI', valor: p.ugrhiNome },
        { rotulo: 'Número UGRHI', valor: p.ugrhiNumero },
        { rotulo: 'Sub-UGRHI', valor: p.subUgrhiNome },
        { rotulo: 'Número sub-UGRHI', valor: p.subUgrhiNumero },
        { rotulo: 'Aquífero', valor: p.aquifero },
        { rotulo: 'Área (km²)', valor: p.areaKm2 },
      ],
    },
    {
      titulo: 'Operação e equipamentos',
      linhas: [
        { rotulo: 'Início de operação', valor: anoOperacao(p.operacaoInicioAno) },
        // Ausência de ano de fim não é dado faltando: é o posto continuar
        // operando, e o cartão de status no topo já diz isso com todas as
        // letras. Escrever "Fim de operação — Não informado" num posto ativo
        // sugere lacuna de cadastro onde não há nenhuma. A linha só aparece
        // quando existe um ano de encerramento de verdade.
        ...(anoOperacao(p.operacaoFimAno) !== null
          ? [{ rotulo: 'Fim de operação', valor: anoOperacao(p.operacaoFimAno) }]
          : []),
        { rotulo: 'Convencional', valor: p.convencional },
        { rotulo: 'Logger', valor: p.loggerEqp },
        { rotulo: 'Telemétrico', valor: p.telemetrico },
        { rotulo: 'Nível', valor: p.nivel },
        { rotulo: 'Vazão', valor: p.vazao },
      ],
    },
  ];
}

/**
 * Espelha a decisão de `formatarValor`: o que ele exibiria como
 * "Não informado" conta como campo sem valor. Serve pra decidir se a seção
 * inteira está vazia e trocar sete linhas de "Não informado" por uma frase.
 */
function temValor(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'string') return valor.trim().length > 0;
  if (typeof valor === 'number') return Number.isFinite(valor);
  return true;
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
 * Deriva o status de telemetria pela PRESENÇA de aparelho telemétrico ativo.
 *
 * O que o cartão pode afirmar mudou junto com a origem do dado. Na planilha
 * ele misturava duas perguntas: se o posto tem equipamento (`telemetrico`) e
 * desde quando ele transmite (`ultimaTransmissao`). A segunda não existe no
 * cadastro do órgão e não volta; a primeira existe e vale para 149 postos.
 * Então o cartão responde só a primeira, e responde inteira: o adaptador já
 * conta apenas aparelho com `DataDesativacao IS NULL`, e é por isso que o
 * contexto diz "ativo", que é a única palavra aqui que a linha de valor não
 * repete.
 *
 * A checagem é de PRESENÇA, e não de vocabulário. A lista de negativas que
 * existia aqui ("nao", "n", "0", "false") era da planilha, onde o campo
 * guardava "sim"/"S"/"1". Hoje o valor é a designação do aparelho, então
 * qualquer texto significa que ele existe, e ausência é `null`.
 *
 * O cartão NÃO ecoa a designação: ela aparece crua, como o órgão a escreve,
 * na linha "Telemétrico" da seção de equipamentos, ao lado das irmãs. Repetir
 * o mesmo valor em dois lugares com formatação diferente na mesma página é
 * pior que escolher um lugar para cada trabalho: aqui o fato, lá o registro.
 */
function statusTelemetria(p: Posto): DadoStat {
  const temAparelho = (p.telemetrico ?? '').trim().length > 0;
  // O contexto é curto de propósito: `CartaoStat` trunca, e com três cartões
  // ao lado da coluna do mapa cada um fica estreito. "nenhum aparelho
  // telemétrico ativo" saía cortado em "nenhum aparelho telemét…". A palavra
  // "telemétrico" já está no rótulo do cartão, então o que o contexto precisa
  // acrescentar é só "ativo", que é a regra de contagem do adaptador.
  return temAparelho
    ? {
        rotulo: 'Telemetria',
        valor: 'Com telemetria',
        contexto: 'aparelho ativo',
        icone: RadioTower,
        tom: 'info',
      }
    : {
        rotulo: 'Telemetria',
        valor: 'Sem telemetria',
        contexto: 'nenhum aparelho ativo',
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
      {/*
        Destaque dos campos-chave antes da tabela densa.

        Três colunas só a partir de `xl`, e não de `lg`. Medido em 1024px, que
        é onde `lg` começa: os cartões caem para 155px, porque nesta faixa a
        coluna do mapa já existe e divide a largura com eles, e as linhas de
        valor truncam ("Em operação" e "Com telemetria" viravam reticências).
        Entre 1024 e 1279 os três ficam em duas colunas, com o terceiro
        embaixo e todos legíveis.
      */}
      <section aria-label="Indicadores principais do posto">
        <h2 className="sr-only">Indicadores principais do posto</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((dado) => (
            <CartaoStat key={dado.rotulo} dado={dado} />
          ))}
        </div>
      </section>

      {secoes.map((secao) => {
        const id = `sec-${slug(secao.titulo)}`;
        const preenchida = secao.linhas.some((l) => temValor(l.valor));
        return (
          <section key={secao.titulo} aria-labelledby={id}>
            <h2
              id={id}
              className="mb-3 border-b border-app-border-subtle pb-1 text-lg font-semibold text-app-fg"
            >
              {secao.titulo}
            </h2>
            {/* Seção sem nenhum campo preenchido some do grid e vira uma linha.
                O título fica: em cadastro público, ausência de dado é
                informação, e esconder a seção faria parecer que o sistema não
                tem o campo. Posto antigo (ex.: desativado nos anos 1960) cai
                aqui com frequência. */}
            {preenchida ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
                {secao.linhas.map((linha) => (
                  <div key={linha.rotulo} className="flex flex-col">
                    <dt className="text-sm text-app-fg-muted">{linha.rotulo}</dt>
                    <dd className="text-app-fg">{formatarValor(linha.valor)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-app-fg-muted">
                Sem informação registrada no cadastro.
              </p>
            )}
          </section>
        );
      })}
    </article>
  );
}
