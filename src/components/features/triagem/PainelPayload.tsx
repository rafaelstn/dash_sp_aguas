import {
  type CampoFicha,
  type SchemaFicha,
  obterSchema,
} from '@/domain/fichas/schemas';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

interface ChavesAnexo {
  url: string;
  nome?: string;
}

export interface PainelPayloadProps {
  codTipoDocumento: CodigoTipoDocumento;
  dados: Record<string, unknown>;
  observacoes: string | null;
}

/**
 * Renderiza o payload `dados` da ficha de forma legível, em vez de JSON
 * cru. Usa `SCHEMAS_FICHA[codigo]` para mapear chaves a labels e tipos.
 *
 * Para chaves do payload que não estão no schema (campos extra que
 * passaram pelo `.passthrough()`), exibe-as ao final em uma seção
 * "Campos adicionais" — o aprovador precisa enxergar tudo o que o
 * técnico enviou, sem perder nada por divergência de schema.
 */
export function PainelPayload({
  codTipoDocumento,
  dados,
  observacoes,
}: PainelPayloadProps) {
  const schema: SchemaFicha = obterSchema(codTipoDocumento);

  const chavesNoSchema = new Set<string>();
  for (const secao of schema.secoes) {
    for (const c of secao.campos) chavesNoSchema.add(c.chave);
  }
  const extras = Object.keys(dados).filter((k) => !chavesNoSchema.has(k));

  return (
    <div className="space-y-5">
      {schema.secoes.map((secao) => (
        <fieldset
          key={secao.titulo}
          className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
        >
          <legend className="px-1 text-sm font-semibold text-app-fg">
            {secao.titulo}
          </legend>
          <dl className="mt-2 grid gap-3 sm:grid-cols-2">
            {secao.campos.map((campo) => (
              <ItemValor
                key={campo.chave}
                campo={campo}
                valor={dados[campo.chave]}
              />
            ))}
          </dl>
        </fieldset>
      ))}

      {observacoes && observacoes.trim().length > 0 ? (
        <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
          <legend className="px-1 text-sm font-semibold text-app-fg">
            Observações registradas pelo técnico
          </legend>
          <p className="mt-2 whitespace-pre-wrap text-sm text-app-fg">
            {observacoes}
          </p>
        </fieldset>
      ) : null}

      {extras.length > 0 ? (
        <fieldset className="rounded-gov-card border border-amber-300 bg-amber-50 p-4">
          <legend className="px-1 text-sm font-semibold text-amber-900">
            Campos adicionais não previstos para este tipo de ficha
          </legend>
          <p className="mt-1 text-xs text-amber-900">
            Os campos a seguir foram submetidos pelo aplicativo, porém não
            fazem parte da estrutura prevista para este tipo de ficha.
            Recomenda-se confirmar a procedência das informações com o
            técnico responsável antes de aprovar.
          </p>
          <dl className="mt-2 grid gap-3 sm:grid-cols-2">
            {extras.map((chave) => (
              <ItemValorBruto key={chave} chave={chave} valor={dados[chave]} />
            ))}
          </dl>
        </fieldset>
      ) : null}
    </div>
  );
}

function ItemValor({ campo, valor }: { campo: CampoFicha; valor: unknown }) {
  const renderizado = renderizarValor(campo, valor);
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wider text-app-fg-subtle">
        {campo.rotulo}
        {campo.unidade ? (
          <span className="ml-1 normal-case tracking-normal text-app-fg-muted">
            ({campo.unidade})
          </span>
        ) : null}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-app-fg">
        {renderizado}
      </dd>
    </div>
  );
}

function ItemValorBruto({ chave, valor }: { chave: string; valor: unknown }) {
  return (
    <div>
      <dt className="mono text-2xs text-amber-900">{chave}</dt>
      <dd className="mt-0.5 text-sm font-medium text-amber-900 break-words">
        {formatarBruto(valor)}
      </dd>
    </div>
  );
}

function renderizarValor(campo: CampoFicha, valor: unknown): React.ReactNode {
  if (valor === null || valor === undefined || valor === '') {
    return <span className="text-app-fg-subtle">Não informado</span>;
  }
  switch (campo.tipo) {
    case 'checkbox':
      return valor ? (
        <span className="inline-flex items-center gap-1 text-green-800">
          <Check /> Sim
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-red-800">
          <Cross /> Não
        </span>
      );
    case 'select': {
      const opcao = campo.opcoes?.find((o) => o.valor === valor);
      return opcao ? opcao.rotulo : String(valor);
    }
    case 'numero': {
      const num = typeof valor === 'number' ? valor : Number(valor);
      const formatado = Number.isFinite(num)
        ? num.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
        : String(valor);
      return campo.unidade ? `${formatado} ${campo.unidade}` : formatado;
    }
    case 'textarea':
      return (
        <span className="whitespace-pre-wrap break-words">{String(valor)}</span>
      );
    default: {
      const texto = String(valor);
      const url = detectarURL(texto);
      if (url) {
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gov-azul hover:underline"
          >
            {texto}
          </a>
        );
      }
      return texto;
    }
  }
}

function formatarBruto(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function detectarURL(texto: string): string | null {
  if (!texto.startsWith('http://') && !texto.startsWith('https://')) {
    return null;
  }
  try {
    const u = new URL(texto);
    return u.toString();
  } catch {
    return null;
  }
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Cross() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export interface BlocoAnexosProps {
  anexos: ReadonlyArray<ChavesAnexo>;
}

/**
 * Componente reutilizável para listar arquivos anexos a uma ficha.
 * Pelo schema atual nenhum tipo de ficha tem campo de anexo, mas a
 * tabela `fichas_triagem.dados` aceita JSON livre — se o app começar a
 * enviar arquivos, basta renderizar este bloco extra.
 */
export function BlocoAnexos({ anexos }: BlocoAnexosProps) {
  if (anexos.length === 0) return null;
  return (
    <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
      <legend className="px-1 text-sm font-semibold text-app-fg">
        Arquivos anexados
      </legend>
      <ul className="mt-2 space-y-1 text-sm">
        {anexos.map((a) => (
          <li key={a.url}>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gov-azul hover:underline"
            >
              {a.nome ?? 'Ver arquivo'}
            </a>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
