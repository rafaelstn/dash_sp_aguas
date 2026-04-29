'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { FichaVisita } from '@/domain/ficha-visita';
import type {
  CampoFicha,
  SchemaFicha,
} from '@/domain/fichas/schemas';

export interface FormularioFichaProps {
  prefixo: string;
  schema: SchemaFicha;
  /** Quando passado, o form opera em modo edição (PATCH). */
  fichaExistente?: FichaVisita;
}

/**
 * Formulário dinâmico que renderiza os campos a partir do `SchemaFicha`.
 * Usa `<input>` HTML nativo (texto/numero/checkbox), `<select>` e `<textarea>`.
 * Submit dispara fetch contra a API REST, depois redireciona pra detalhe da
 * ficha (criação) ou pro histórico do posto (edição).
 *
 * Não tenta validar tipos no client — confia no Zod do server. Erros vêm
 * formatados na resposta 422.
 */
export function FormularioFicha({
  prefixo,
  schema,
  fichaExistente,
}: FormularioFichaProps) {
  const router = useRouter();
  const editando = Boolean(fichaExistente);

  // Metadata comum (data, hora, técnico, observações).
  const [dataVisita, setDataVisita] = useState(
    formatarDataInput(fichaExistente?.dataVisita) ?? hojeIso(),
  );
  const [horaInicio, setHoraInicio] = useState(
    fichaExistente?.horaInicio?.slice(0, 5) ?? '',
  );
  const [horaFim, setHoraFim] = useState(
    fichaExistente?.horaFim?.slice(0, 5) ?? '',
  );
  const [tecnicoNome, setTecnicoNome] = useState(
    fichaExistente?.tecnicoNome ?? '',
  );
  const [observacoes, setObservacoes] = useState(
    fichaExistente?.observacoes ?? '',
  );
  const [latitude, setLatitude] = useState(
    fichaExistente?.latitudeCapturada !== null &&
      fichaExistente?.latitudeCapturada !== undefined
      ? String(fichaExistente.latitudeCapturada)
      : '',
  );
  const [longitude, setLongitude] = useState(
    fichaExistente?.longitudeCapturada !== null &&
      fichaExistente?.longitudeCapturada !== undefined
      ? String(fichaExistente.longitudeCapturada)
      : '',
  );

  // Payload `dados` específico do tipo. Inicializa do existente ou vazio.
  const [dados, setDados] = useState<Record<string, unknown>>(
    fichaExistente?.dados ?? {},
  );

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros422, setErros422] = useState<string[]>([]);

  function atualizarCampo(chave: string, valor: unknown) {
    setDados((prev) => ({ ...prev, [chave]: valor }));
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setErros422([]);
    setEnviando(true);

    const corpo = {
      codTipoDocumento: schema.codigo,
      dataVisita,
      horaInicio: horaInicio || null,
      horaFim: horaFim || null,
      tecnicoNome: tecnicoNome.trim(),
      latitudeCapturada: latitude ? Number(latitude) : null,
      longitudeCapturada: longitude ? Number(longitude) : null,
      observacoes: observacoes.trim() || null,
      dados,
    };

    try {
      const url = editando
        ? `/api/fichas/${fichaExistente!.id}`
        : `/api/postos/${encodeURIComponent(prefixo)}/fichas`;
      const resp = await fetch(url, {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
      });

      if (resp.status === 422) {
        const body = await resp.json();
        setErros422(body.motivos ?? [body.erro ?? 'Dados inválidos.']);
        setEnviando(false);
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setErro(body.erro ?? `Falha ${resp.status} ao enviar ficha.`);
        setEnviando(false);
        return;
      }

      if (editando) {
        router.push(`/postos/${encodeURIComponent(prefixo)}`);
      } else {
        const body = await resp.json();
        const novoId = body.ficha?.id;
        router.push(
          novoId
            ? `/postos/${encodeURIComponent(prefixo)}/fichas/${novoId}`
            : `/postos/${encodeURIComponent(prefixo)}`,
        );
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro de rede.');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={submeter} className="space-y-5">
      {(erro || erros422.length > 0) && (
        <div
          role="alert"
          className="rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
        >
          {erro && <p className="font-semibold">{erro}</p>}
          {erros422.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {erros422.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-app-fg sm:col-span-2">
          Identificação
        </legend>

        <Label texto="Data da visita" obrigatorio>
          <input
            type="date"
            required
            value={dataVisita}
            onChange={(e) => setDataVisita(e.currentTarget.value)}
            className={cls()}
          />
        </Label>
        <Label texto="Técnico responsável" obrigatorio>
          <input
            type="text"
            required
            value={tecnicoNome}
            onChange={(e) => setTecnicoNome(e.currentTarget.value)}
            placeholder="Nome completo"
            className={cls()}
          />
        </Label>
        <Label texto="Hora de início">
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.currentTarget.value)}
            className={cls()}
          />
        </Label>
        <Label texto="Hora de término">
          <input
            type="time"
            value={horaFim}
            onChange={(e) => setHoraFim(e.currentTarget.value)}
            className={cls()}
          />
        </Label>
        <Label texto="Latitude capturada (GPS)">
          <input
            type="number"
            step="any"
            value={latitude}
            onChange={(e) => setLatitude(e.currentTarget.value)}
            placeholder="-23.5..."
            className={cls()}
          />
        </Label>
        <Label texto="Longitude capturada (GPS)">
          <input
            type="number"
            step="any"
            value={longitude}
            onChange={(e) => setLongitude(e.currentTarget.value)}
            placeholder="-46.6..."
            className={cls()}
          />
        </Label>
      </fieldset>

      {schema.secoes.map((secao) => (
        <fieldset key={secao.titulo} className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold text-app-fg sm:col-span-2">
            {secao.titulo}
          </legend>
          {secao.campos.map((campo) => (
            <CampoDinamico
              key={campo.chave}
              campo={campo}
              valor={dados[campo.chave]}
              onChange={(v) => atualizarCampo(campo.chave, v)}
            />
          ))}
        </fieldset>
      ))}

      <fieldset className="block">
        <legend className="mb-1 text-sm font-semibold text-app-fg">
          Observações gerais
        </legend>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.currentTarget.value)}
          rows={6}
          placeholder="Ex.: condições do tempo, dificuldades, sugestões para próxima visita…"
          className={`${cls()} resize-y min-h-[8rem]`}
        />
      </fieldset>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded bg-gov-azul px-4 py-2 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul disabled:opacity-60"
        >
          {enviando
            ? 'Enviando…'
            : editando
              ? 'Salvar alterações'
              : 'Enviar ficha'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-gov-muted hover:text-gov-texto underline-offset-4 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Componentes auxiliares
// ─────────────────────────────────────────────────────────────────────────

function Label({
  texto,
  obrigatorio,
  ajuda,
  children,
}: {
  texto: string;
  obrigatorio?: boolean;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-app-fg">
        {texto}
        {obrigatorio && (
          <span className="ml-0.5 text-gov-perigo" aria-label="obrigatório">
            *
          </span>
        )}
      </span>
      {children}
      {ajuda && <span className="text-xs text-app-fg-muted">{ajuda}</span>}
    </label>
  );
}

function CampoDinamico({
  campo,
  valor,
  onChange,
}: {
  campo: CampoFicha;
  valor: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (campo.tipo) {
    case 'texto':
      return (
        <Label texto={campo.rotulo} obrigatorio={campo.obrigatorio} ajuda={campo.ajuda}>
          <input
            type="text"
            value={typeof valor === 'string' ? valor : ''}
            onChange={(e) => onChange(e.currentTarget.value || null)}
            className={cls()}
          />
        </Label>
      );
    case 'textarea':
      return (
        <Label texto={campo.rotulo} obrigatorio={campo.obrigatorio} ajuda={campo.ajuda}>
          <textarea
            rows={5}
            value={typeof valor === 'string' ? valor : ''}
            onChange={(e) => onChange(e.currentTarget.value || null)}
            className={`${cls()} resize-y min-h-[7rem]`}
          />
        </Label>
      );
    case 'numero':
      return (
        <Label texto={campo.rotulo} obrigatorio={campo.obrigatorio} ajuda={campo.ajuda}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              min={campo.min}
              max={campo.max}
              value={typeof valor === 'number' ? valor : ''}
              onChange={(e) => {
                const v = e.currentTarget.value;
                onChange(v === '' ? null : Number(v));
              }}
              className={cls()}
            />
            {campo.unidade && (
              <span className="text-xs text-app-fg-muted">{campo.unidade}</span>
            )}
          </div>
        </Label>
      );
    case 'select':
      return (
        <Label texto={campo.rotulo} obrigatorio={campo.obrigatorio} ajuda={campo.ajuda}>
          <select
            value={typeof valor === 'string' ? valor : ''}
            onChange={(e) =>
              onChange(e.currentTarget.value === '' ? null : e.currentTarget.value)
            }
            className={cls()}
          >
            <option value="">— selecionar —</option>
            {campo.opcoes?.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </Label>
      );
    case 'checkbox':
      return (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(valor)}
            onChange={(e) => onChange(e.currentTarget.checked)}
            className="h-4 w-4 accent-gov-azul"
          />
          <span>{campo.rotulo}</span>
        </label>
      );
  }
}

function cls() {
  return 'w-full rounded border border-gov-borda bg-white px-3 py-2 text-sm text-gov-texto focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-gov-azul';
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatarDataInput(d: Date | undefined): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
