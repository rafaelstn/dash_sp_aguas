'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Posto } from '@/domain/posto';
import { ROTULOS_CAMPO_POSTO, type CampoPostoComRotulo } from '@/lib/rotulos-posto';

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
  proprietario: string;
  tipoPosto: string;
  areaKm2: string;
  mantenedor: string;
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
    proprietario: p.proprietario ?? '',
    tipoPosto: p.tipoPosto ?? '',
    areaKm2: p.areaKm2 !== null ? String(p.areaKm2) : '',
    mantenedor: p.mantenedor ?? '',
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
        <Campo campo="nomeEstacao" form={form} set={set} />
        <Campo campo="prefixoAna" form={form} set={set} />
        <Campo campo="mantenedor" form={form} set={set} />
        <Campo campo="tipoPosto" form={form} set={set} />
        <Campo campo="proprietario" form={form} set={set} />
        <Campo campo="aquifero" form={form} set={set} />
      </Secao>

      <Secao titulo="Localização">
        <Campo campo="latitude" form={form} set={set} inputMode="decimal" />
        <Campo campo="longitude" form={form} set={set} inputMode="decimal" />
        <Campo campo="altimetria" form={form} set={set} inputMode="decimal" />
        <Campo campo="municipio" form={form} set={set} />
        <Campo campo="municipioAlt" form={form} set={set} />
        <Campo campo="baciaHidrografica" form={form} set={set} />
        <Campo campo="ugrhiNome" form={form} set={set} />
        <Campo campo="ugrhiNumero" form={form} set={set} />
        <Campo campo="subUgrhiNome" form={form} set={set} />
        <Campo campo="areaKm2" form={form} set={set} inputMode="decimal" />
      </Secao>

      {/*
        "Rede" e "Batalhão (BTL)" saíram daqui, e "Observações livres" saiu
        inteira logo abaixo: as três colunas não existem no cadastro do órgão.
        Campo de escrita órfão é pior que campo de leitura órfão, porque o
        formulário confirmava "Salvo. 1 campo(s) atualizado(s)." para um dado
        que não tem onde ficar. Em cadastro público, mensagem de sucesso sobre
        gravação que não acontece é o defeito mais caro da tela.
      */}
      <Secao titulo="Operação">
        <Campo campo="operacaoInicioAno" form={form} set={set} inputMode="numeric" />
        <Campo campo="operacaoFimAno" form={form} set={set} inputMode="numeric" />
      </Secao>

      <Secao titulo="Datas de medição ANA (Meta I.6)">
        <Campo campo="anaEscalaInicio" form={form} set={set} type="date" />
        <Campo campo="anaEscalaFim" form={form} set={set} type="date" />
        <Campo campo="anaDescargaLiquidaInicio" form={form} set={set} type="date" />
        <Campo campo="anaDescargaLiquidaFim" form={form} set={set} type="date" />
        <Campo campo="anaSedimentosInicio" form={form} set={set} type="date" />
        <Campo campo="anaSedimentosFim" form={form} set={set} type="date" />
        <Campo campo="anaQualidadeInicio" form={form} set={set} type="date" />
        <Campo campo="anaQualidadeFim" form={form} set={set} type="date" />
        <Campo campo="anaPluviometroInicio" form={form} set={set} type="date" />
        <Campo campo="anaPluviometroFim" form={form} set={set} type="date" />
        <Campo campo="anaTelemetriaInicio" form={form} set={set} type="date" />
        <Campo campo="anaTelemetriaFim" form={form} set={set} type="date" />
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

/**
 * Um campo do cadastro, identificado pela CHAVE e não pelo rótulo.
 *
 * Antes de 23/09/2026 cada chamada repetia o texto do rótulo (`label="Nome da
 * estação"`) além da chave, e o mesmo texto estava escrito de novo no histórico
 * de alterações. Duas listas à mão divergem, e a que ninguém abre é a que
 * envelhece calada: o histórico chegou a imprimir `nomeEstacao` cru em tela de
 * governo (achado 2 do QA da tela Postos).
 *
 * Agora a chave aparece uma vez por linha e dela saem as três coisas: o rótulo
 * (de `ROTULOS_CAMPO_POSTO`, a mesma fonte que o histórico lê), o valor exibido
 * e o destino da escrita. O tipo `keyof FormState & CampoPostoComRotulo` faz o
 * `tsc` recusar campo do formulário que não tenha rótulo cadastrado.
 */
function Campo({
  campo,
  form,
  set,
  type = 'text',
  inputMode,
}: {
  campo: keyof FormState & CampoPostoComRotulo;
  form: FormState;
  set: (k: keyof FormState, v: string) => void;
  type?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
}) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-app-fg-muted">
        {ROTULOS_CAMPO_POSTO[campo]}
      </span>
      <input
        type={type}
        value={form[campo]}
        onChange={(e) => set(campo, e.target.value)}
        inputMode={inputMode}
        className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
      />
    </label>
  );
}
