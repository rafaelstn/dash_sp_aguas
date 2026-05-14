'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Posto } from '@/domain/posto';

interface Props {
  posto: Posto;
}

interface FormState {
  nomeEstacao: string;
  prefixoAna: string;
  latitude: string;
  longitude: string;
  altimetria: string;
  municipio: string;
  municipioAlt: string;
  baciaHidrografica: string;
  ugrhiNome: string;
  ugrhiNumero: string;
  subUgrhiNome: string;
  rede: string;
  proprietario: string;
  tipoPosto: string;
  areaKm2: string;
  btl: string;
  mantenedor: string;
  observacoes: string;
  aquifero: string;
  operacaoInicioAno: string;
  operacaoFimAno: string;
  anaEscalaInicio: string;
  anaEscalaFim: string;
  anaDescargaLiquidaInicio: string;
  anaDescargaLiquidaFim: string;
  anaSedimentosInicio: string;
  anaSedimentosFim: string;
  anaQualidadeInicio: string;
  anaQualidadeFim: string;
  anaPluviometroInicio: string;
  anaPluviometroFim: string;
  anaTelemetriaInicio: string;
  anaTelemetriaFim: string;
}

function paraForm(p: Posto): FormState {
  return {
    nomeEstacao: p.nomeEstacao ?? '',
    prefixoAna: p.prefixoAna ?? '',
    latitude: p.latitude !== null ? String(p.latitude) : '',
    longitude: p.longitude !== null ? String(p.longitude) : '',
    altimetria: p.altimetria !== null ? String(p.altimetria) : '',
    municipio: p.municipio ?? '',
    municipioAlt: p.municipioAlt ?? '',
    baciaHidrografica: p.baciaHidrografica ?? '',
    ugrhiNome: p.ugrhiNome ?? '',
    ugrhiNumero: p.ugrhiNumero ?? '',
    subUgrhiNome: p.subUgrhiNome ?? '',
    rede: p.rede ?? '',
    proprietario: p.proprietario ?? '',
    tipoPosto: p.tipoPosto ?? '',
    areaKm2: p.areaKm2 !== null ? String(p.areaKm2) : '',
    btl: p.btl ?? '',
    mantenedor: p.mantenedor ?? '',
    observacoes: p.observacoes ?? '',
    aquifero: p.aquifero ?? '',
    operacaoInicioAno: p.operacaoInicioAno !== null ? String(p.operacaoInicioAno) : '',
    operacaoFimAno: p.operacaoFimAno !== null ? String(p.operacaoFimAno) : '',
    anaEscalaInicio: p.anaEscalaInicio ?? '',
    anaEscalaFim: p.anaEscalaFim ?? '',
    anaDescargaLiquidaInicio: p.anaDescargaLiquidaInicio ?? '',
    anaDescargaLiquidaFim: p.anaDescargaLiquidaFim ?? '',
    anaSedimentosInicio: p.anaSedimentosInicio ?? '',
    anaSedimentosFim: p.anaSedimentosFim ?? '',
    anaQualidadeInicio: p.anaQualidadeInicio ?? '',
    anaQualidadeFim: p.anaQualidadeFim ?? '',
    anaPluviometroInicio: p.anaPluviometroInicio ?? '',
    anaPluviometroFim: p.anaPluviometroFim ?? '',
    anaTelemetriaInicio: p.anaTelemetriaInicio ?? '',
    anaTelemetriaFim: p.anaTelemetriaFim ?? '',
  };
}

function diff(form: FormState, original: Posto): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const orig = paraForm(original) as unknown as Record<string, string>;
  for (const [k, v] of Object.entries(form as unknown as Record<string, string>)) {
    const vNovo = v.trim();
    const vOrig = orig[k] ?? '';
    if (vNovo === vOrig) continue;
    // Tipagem por campo
    if (vNovo === '') {
      out[k] = null;
      continue;
    }
    if (
      [
        'latitude',
        'longitude',
        'altimetria',
        'areaKm2',
      ].includes(k)
    ) {
      const n = Number(vNovo);
      if (!Number.isFinite(n)) continue;
      out[k] = n;
    } else if (['operacaoInicioAno', 'operacaoFimAno'].includes(k)) {
      const n = parseInt(vNovo, 10);
      if (!Number.isFinite(n)) continue;
      out[k] = n;
    } else {
      out[k] = vNovo;
    }
  }
  return out;
}

export function FormularioEditarPosto({ posto }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => paraForm(posto));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function salvar() {
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      const corpo = diff(form, posto);
      if (Object.keys(corpo).length === 0) {
        setErro('Nenhum campo alterado.');
        setEnviando(false);
        return;
      }
      const resp = await fetch(
        `/api/postos/${encodeURIComponent(posto.prefixo)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(corpo),
        },
      );
      if (!resp.ok) {
        const b = (await resp.json().catch(() => ({}))) as {
          erro?: string;
          mensagem?: string;
          motivos?: string[];
        };
        throw new Error(
          b.mensagem ?? b.motivos?.join('; ') ?? b.erro ?? `HTTP ${resp.status}`,
        );
      }
      setSucesso(`Salvo. ${Object.keys(corpo).length} campo(s) atualizado(s).`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setEnviando(false);
    }
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

      <Secao titulo="Identificação">
        <Campo label="Nome da estação" valor={form.nomeEstacao} onChange={(v) => set('nomeEstacao', v)} />
        <Campo label="Código ANA (prefixo_ana)" valor={form.prefixoAna} onChange={(v) => set('prefixoAna', v)} />
        <Campo label="Mantenedor" valor={form.mantenedor} onChange={(v) => set('mantenedor', v)} />
        <Campo label="Tipo de posto" valor={form.tipoPosto} onChange={(v) => set('tipoPosto', v)} />
        <Campo label="Proprietário" valor={form.proprietario} onChange={(v) => set('proprietario', v)} />
        <Campo label="Aquífero" valor={form.aquifero} onChange={(v) => set('aquifero', v)} />
      </Secao>

      <Secao titulo="Localização">
        <Campo label="Latitude" valor={form.latitude} onChange={(v) => set('latitude', v)} inputMode="decimal" />
        <Campo label="Longitude" valor={form.longitude} onChange={(v) => set('longitude', v)} inputMode="decimal" />
        <Campo label="Altimetria (m)" valor={form.altimetria} onChange={(v) => set('altimetria', v)} inputMode="decimal" />
        <Campo label="Município" valor={form.municipio} onChange={(v) => set('municipio', v)} />
        <Campo label="Município (alternativo)" valor={form.municipioAlt} onChange={(v) => set('municipioAlt', v)} />
        <Campo label="Bacia hidrográfica" valor={form.baciaHidrografica} onChange={(v) => set('baciaHidrografica', v)} />
        <Campo label="UGRHI nome" valor={form.ugrhiNome} onChange={(v) => set('ugrhiNome', v)} />
        <Campo label="UGRHI número" valor={form.ugrhiNumero} onChange={(v) => set('ugrhiNumero', v)} />
        <Campo label="Sub-UGRHI nome" valor={form.subUgrhiNome} onChange={(v) => set('subUgrhiNome', v)} />
        <Campo label="Área de drenagem (km²)" valor={form.areaKm2} onChange={(v) => set('areaKm2', v)} inputMode="decimal" />
      </Secao>

      <Secao titulo="Operação">
        <Campo label="Ano início de operação" valor={form.operacaoInicioAno} onChange={(v) => set('operacaoInicioAno', v)} inputMode="numeric" />
        <Campo label="Ano fim de operação" valor={form.operacaoFimAno} onChange={(v) => set('operacaoFimAno', v)} inputMode="numeric" />
        <Campo label="Rede" valor={form.rede} onChange={(v) => set('rede', v)} />
        <Campo label="Batalhão (BTL)" valor={form.btl} onChange={(v) => set('btl', v)} />
      </Secao>

      <Secao titulo="Datas de medição ANA (Meta I.6)">
        <Campo label="Escala — início" valor={form.anaEscalaInicio} onChange={(v) => set('anaEscalaInicio', v)} type="date" />
        <Campo label="Escala — fim" valor={form.anaEscalaFim} onChange={(v) => set('anaEscalaFim', v)} type="date" />
        <Campo label="Descarga líquida — início" valor={form.anaDescargaLiquidaInicio} onChange={(v) => set('anaDescargaLiquidaInicio', v)} type="date" />
        <Campo label="Descarga líquida — fim" valor={form.anaDescargaLiquidaFim} onChange={(v) => set('anaDescargaLiquidaFim', v)} type="date" />
        <Campo label="Sedimentos — início" valor={form.anaSedimentosInicio} onChange={(v) => set('anaSedimentosInicio', v)} type="date" />
        <Campo label="Sedimentos — fim" valor={form.anaSedimentosFim} onChange={(v) => set('anaSedimentosFim', v)} type="date" />
        <Campo label="Qualidade da água — início" valor={form.anaQualidadeInicio} onChange={(v) => set('anaQualidadeInicio', v)} type="date" />
        <Campo label="Qualidade da água — fim" valor={form.anaQualidadeFim} onChange={(v) => set('anaQualidadeFim', v)} type="date" />
        <Campo label="Pluviômetro — início" valor={form.anaPluviometroInicio} onChange={(v) => set('anaPluviometroInicio', v)} type="date" />
        <Campo label="Pluviômetro — fim" valor={form.anaPluviometroFim} onChange={(v) => set('anaPluviometroFim', v)} type="date" />
        <Campo label="Telemetria — início" valor={form.anaTelemetriaInicio} onChange={(v) => set('anaTelemetriaInicio', v)} type="date" />
        <Campo label="Telemetria — fim" valor={form.anaTelemetriaFim} onChange={(v) => set('anaTelemetriaFim', v)} type="date" />
      </Secao>

      <Secao titulo="Observações">
        <div className="sm:col-span-2">
          <label className="block text-xs">
            <span className="mb-0.5 block font-medium text-app-fg-muted">Observações livres</span>
            <textarea
              value={form.observacoes}
              onChange={(e) => set('observacoes', e.target.value)}
              rows={4}
              maxLength={2000}
              className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </Secao>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={enviando}
          className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60"
        >
          {enviando ? 'Salvando…' : 'Salvar alterações'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={enviando}
          className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
      <legend className="px-1 text-sm font-semibold text-app-fg">{titulo}</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Campo({
  label,
  valor,
  onChange,
  type = 'text',
  inputMode,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
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
    </label>
  );
}
