'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AnaRevisaoEstacao, StatusRevisao } from '@/domain/ana-revisao';

interface Props {
  estacao: AnaRevisaoEstacao;
}

interface FormState {
  codigoAdicional: string;
  nome: string;
  latitude: string;
  longitude: string;
  municipioNome: string;
  rioNome: string;
  subbaciaNome: string;
  pluviometroFim: string;
  escalaFim: string;
  descargaLiquidaFim: string;
  qualidadeFim: string;
  telemetriaFim: string;
  sedimentosFim: string;
  justificativa: string;
}

function stateInicial(e: AnaRevisaoEstacao): FormState {
  const c = (e.correcoes ?? {}) as Record<string, unknown>;
  const get = (campo: keyof FormState, fallback: string | null): string => {
    const sug = c[`${campo}_sugerido`] ?? c[campo];
    if (sug !== undefined && sug !== null) return String(sug);
    return fallback ?? '';
  };
  return {
    codigoAdicional: get('codigoAdicional', e.codigoAdicional),
    nome: get('nome', e.nome),
    latitude: get('latitude', e.latitude !== null ? String(e.latitude) : null),
    longitude: get('longitude', e.longitude !== null ? String(e.longitude) : null),
    municipioNome: get('municipioNome', e.municipioNome),
    rioNome: get('rioNome', e.rioNome),
    subbaciaNome: get('subbaciaNome', e.subbaciaNome),
    pluviometroFim: get('pluviometroFim', e.pluviometroFim),
    escalaFim: get('escalaFim', e.escalaFim),
    descargaLiquidaFim: get('descargaLiquidaFim', e.descargaLiquidaFim),
    qualidadeFim: get('qualidadeFim', e.qualidadeFim),
    telemetriaFim: get('telemetriaFim', e.telemetriaFim),
    sedimentosFim: get('sedimentosFim', e.sedimentosFim),
    justificativa: e.justificativa ?? '',
  };
}

function diff(estado: FormState, original: AnaRevisaoEstacao): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pares: Array<[keyof FormState, string | null]> = [
    ['codigoAdicional', original.codigoAdicional],
    ['nome', original.nome],
    ['latitude', original.latitude !== null ? String(original.latitude) : null],
    ['longitude', original.longitude !== null ? String(original.longitude) : null],
    ['municipioNome', original.municipioNome],
    ['rioNome', original.rioNome],
    ['subbaciaNome', original.subbaciaNome],
    ['pluviometroFim', original.pluviometroFim],
    ['escalaFim', original.escalaFim],
    ['descargaLiquidaFim', original.descargaLiquidaFim],
    ['qualidadeFim', original.qualidadeFim],
    ['telemetriaFim', original.telemetriaFim],
    ['sedimentosFim', original.sedimentosFim],
  ];
  for (const [campo, valOriginal] of pares) {
    const novo = estado[campo].trim();
    const orig = valOriginal ?? '';
    if (novo !== orig) {
      out[campo] = novo === '' ? null : novo;
    }
  }
  return out;
}

export function FormularioCorrecao({ estacao }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => stateInicial(estacao));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function atualiza<K extends keyof FormState>(campo: K, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function submeter(novoStatus: StatusRevisao) {
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      const correcoes = diff(form, estacao);
      const resp = await fetch(
        `/api/inventario-ana/${encodeURIComponent(estacao.codigoAna)}/revisar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            correcoes,
            justificativa: form.justificativa.trim() || null,
            novoStatus,
          }),
        },
      );
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as {
          erro?: string;
          mensagem?: string;
        };
        throw new Error(body.mensagem ?? body.erro ?? `HTTP ${resp.status}`);
      }
      setSucesso(`Status atualizado: ${novoStatus}.`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar revisão.');
    } finally {
      setEnviando(false);
    }
  }

  function aceitarSugestaoMunicipio() {
    if (!estacao.municipioSugeridoNome) return;
    atualiza('municipioNome', estacao.municipioSugeridoNome);
  }

  return (
    <div className="space-y-4">
      {erro ? (
        <div role="alert" className="rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo">
          {erro}
        </div>
      ) : null}
      {sucesso ? (
        <div role="status" className="rounded border-l-4 border-green-600 bg-green-50 p-3 text-sm text-green-900">
          {sucesso}
        </div>
      ) : null}

      <fieldset disabled={enviando} className="grid gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-app-fg">Identificação</legend>
        <Campo label="Código adicional" valor={form.codigoAdicional} onChange={(v) => atualiza('codigoAdicional', v)} sugestao={(estacao.correcoes as Record<string, unknown>)['codigo_adicional_sugerido'] as string | undefined} />
        <Campo label="Nome" valor={form.nome} onChange={(v) => atualiza('nome', v)} />
        <Campo label="Latitude" valor={form.latitude} onChange={(v) => atualiza('latitude', v)} inputMode="decimal" />
        <Campo label="Longitude" valor={form.longitude} onChange={(v) => atualiza('longitude', v)} inputMode="decimal" />
      </fieldset>

      <fieldset disabled={enviando} className="grid gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-app-fg">Localização</legend>
        <div className="sm:col-span-2 flex items-end gap-2">
          <div className="flex-1">
            <Campo label="Município (declarado)" valor={form.municipioNome} onChange={(v) => atualiza('municipioNome', v)} />
          </div>
          {estacao.municipioSugeridoNome && estacao.municipioSugeridoNome !== estacao.municipioNome ? (
            <button
              type="button"
              onClick={aceitarSugestaoMunicipio}
              className="mb-0.5 rounded bg-gov-azul px-2 py-1.5 text-xs font-medium text-white hover:bg-gov-azul-escuro"
              title={`Substituir por ${estacao.municipioSugeridoNome}`}
            >
              Aceitar sugestão: {estacao.municipioSugeridoNome}
            </button>
          ) : null}
        </div>
        <Campo label="Rio" valor={form.rioNome} onChange={(v) => atualiza('rioNome', v)} />
        <Campo label="Sub-bacia" valor={form.subbaciaNome} onChange={(v) => atualiza('subbaciaNome', v)} />
      </fieldset>

      <fieldset disabled={enviando} className="grid gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold text-app-fg">Datas de fim de operação</legend>
        <Campo label="Pluviômetro" type="date" valor={form.pluviometroFim} onChange={(v) => atualiza('pluviometroFim', v)} sugestao={(estacao.correcoes as Record<string, unknown>)['pluviometro_fim_sugerido'] as string | undefined} />
        <Campo label="Escala" type="date" valor={form.escalaFim} onChange={(v) => atualiza('escalaFim', v)} />
        <Campo label="Descarga líquida" type="date" valor={form.descargaLiquidaFim} onChange={(v) => atualiza('descargaLiquidaFim', v)} />
        <Campo label="Telemetria" type="date" valor={form.telemetriaFim} onChange={(v) => atualiza('telemetriaFim', v)} />
        <Campo label="Qualidade da água" type="date" valor={form.qualidadeFim} onChange={(v) => atualiza('qualidadeFim', v)} />
        <Campo label="Sedimentos" type="date" valor={form.sedimentosFim} onChange={(v) => atualiza('sedimentosFim', v)} />
      </fieldset>

      <fieldset disabled={enviando} className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
        <legend className="px-1 text-sm font-semibold text-app-fg">Justificativa</legend>
        <textarea
          value={form.justificativa}
          onChange={(e) => atualiza('justificativa', e.target.value)}
          rows={3}
          maxLength={4000}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm"
          placeholder="Use quando preferir MANTER o valor original com explicação (ex.: coordenada deslocada no banco da ANA, mas estação está no município/rio corretos)."
        />
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => submeter('revisada')}
          disabled={enviando}
          className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
        >
          Salvar e marcar como revisada
        </button>
        <button
          type="button"
          onClick={() => submeter('em_revisao')}
          disabled={enviando}
          className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60"
        >
          Salvar sem fechar
        </button>
        <button
          type="button"
          onClick={() => submeter('descartada')}
          disabled={enviando}
          className="rounded bg-gov-perigo px-3 py-1.5 text-sm font-medium text-white hover:bg-red-900 disabled:opacity-60"
        >
          Descartar (não é da rede SP)
        </button>
      </div>
    </div>
  );
}

function Campo({
  label,
  valor,
  onChange,
  type = 'text',
  inputMode,
  sugestao,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
  sugestao?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-app-fg-muted">{label}</span>
      <input
        type={type}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
      />
      {sugestao && sugestao !== valor ? (
        <button
          type="button"
          onClick={() => onChange(sugestao)}
          className="mt-1 text-2xs text-gov-azul hover:underline"
        >
          Sugestão: <span className="mono">{sugestao}</span> (clicar para aplicar)
        </button>
      ) : null}
    </label>
  );
}
