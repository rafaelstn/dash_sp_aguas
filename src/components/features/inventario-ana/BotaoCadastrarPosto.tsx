'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AnaRevisaoEstacao } from '@/domain/ana-revisao';

interface Props {
  estacao: AnaRevisaoEstacao;
}

/**
 * Botão "Cadastrar como posto novo" para estações ANA sem match em postos.
 *
 * Cria posto novo em `postos` (origem='ana_promocao_manual') usando os
 * dados que a ANA mandou como base inicial. Depois Marcio refina via
 * /postos/[prefixo]/editar.
 */
export function BotaoCadastrarPosto({ estacao }: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const prefixoSugerido = estacao.codigoAdicional || `ANA-${estacao.codigoAna}`;

  async function cadastrar() {
    setEnviando(true);
    setErro(null);
    try {
      const corpo = {
        prefixo: prefixoSugerido,
        prefixoAna: estacao.codigoAna,
        nomeEstacao: estacao.nome,
        latitude: estacao.latitude,
        longitude: estacao.longitude,
        altimetria: estacao.altitude,
        municipio: estacao.municipioNome,
        baciaHidrografica: estacao.baciaNome,
        subUgrhiNome: estacao.subbaciaNome,
        tipoPosto: estacao.estacaoTipo,
        operacaoInicioAno:
          estacao.escalaInicio
            ? new Date(estacao.escalaInicio).getFullYear()
            : null,
        anaEscalaInicio: estacao.escalaInicio,
        anaEscalaFim: estacao.escalaFim,
        anaDescargaLiquidaInicio: estacao.descargaLiquidaInicio,
        anaDescargaLiquidaFim: estacao.descargaLiquidaFim,
        anaSedimentosInicio: estacao.sedimentosInicio,
        anaSedimentosFim: estacao.sedimentosFim,
        anaQualidadeInicio: estacao.qualidadeInicio,
        anaQualidadeFim: estacao.qualidadeFim,
        anaPluviometroInicio: estacao.pluviometroInicio,
        anaPluviometroFim: estacao.pluviometroFim,
        anaTelemetriaInicio: estacao.telemetriaInicio,
        anaTelemetriaFim: estacao.telemetriaFim,
        origem: 'ana_promocao_manual',
      };
      const resp = await fetch('/api/postos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(corpo),
      });
      if (!resp.ok) {
        const b = (await resp.json().catch(() => ({}))) as {
          erro?: string;
          mensagem?: string;
        };
        throw new Error(b.mensagem ?? b.erro ?? `HTTP ${resp.status}`);
      }
      // Também marca estação ANA como revisada
      await fetch(
        `/api/inventario-ana/${encodeURIComponent(estacao.codigoAna)}/revisar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            novoStatus: 'promovida_a_posto',
            observacao: `Posto criado com prefixo ${prefixoSugerido} via decisão manual.`,
          }),
        },
      );
      // Redireciona para a tela de edição do posto recém criado
      router.push(`/postos/${encodeURIComponent(prefixoSugerido)}/editar`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao cadastrar posto.');
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2">
      {erro ? (
        <div role="alert" className="rounded border-l-4 border-gov-perigo bg-red-50 p-2 text-sm text-gov-perigo">
          {erro}
        </div>
      ) : null}

      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Cadastrar como posto novo
        </button>
      ) : (
        <div className="rounded border border-gov-azul bg-blue-50 p-3 text-sm">
          <p className="text-app-fg">
            Vou criar um posto novo em <code className="mono">postos</code> com:
          </p>
          <ul className="mt-2 ml-4 list-disc text-xs text-app-fg">
            <li>
              Prefixo: <span className="mono">{prefixoSugerido}</span>
            </li>
            <li>Código ANA: <span className="mono">{estacao.codigoAna}</span></li>
            <li>Nome: {estacao.nome ?? 'sem nome'}</li>
            <li>Município: {estacao.municipioNome ?? 'sem município'}</li>
            <li>Coords: {estacao.latitude}, {estacao.longitude}</li>
            <li>Origem: ana_promocao_manual</li>
          </ul>
          <p className="mt-2 text-2xs text-app-fg-muted">
            Após criar, você é redirecionado para refinar os dados em
            <code className="mono"> /postos/{prefixoSugerido}/editar</code>.
            Esta estação ANA será marcada como <strong>promovida_a_posto</strong>.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
              className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={cadastrar}
              disabled={enviando}
              className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60"
            >
              {enviando ? 'Criando…' : 'Confirmar criação'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
