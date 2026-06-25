'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  secaoVisivel,
  type CampoFicha,
  type SchemaFicha,
} from '@/domain/fichas/schemas';
import type { ErrosCampos } from '@/domain/fichas/validacao-ficha';
import { CampoFichaMobile } from './CampoFichaMobile';
import { useGpsFicha } from './hooks/useGpsFicha';
import { useSubmissaoFicha } from './hooks/useSubmissaoFicha';
import {
  carregarRascunho,
  descartarRascunho,
  montarRascunhoInicial,
  salvarRascunho,
  type CabecalhoRascunho,
  type RascunhoFicha,
} from '@/lib/rascunho-ficha';
import { gerarUuidV4 } from '@/lib/uuid-cliente';
import { arquivoParaDataUrl, comprimirImagemParaDataUrl } from '@/lib/imagem';

const TAMANHO_MAX_FOTO_BYTES = 5 * 1024 * 1024;
const ALVO_COMPRESSAO_BYTES = 2 * 1024 * 1024;

interface FormularioFichaMobileProps {
  schema: SchemaFicha;
  prefixo: string;
  /** Identifica o técnico (usado na chave de rascunho + idempotência). */
  usuarioId: string;
  /** Sugestão pra preencher tecnicoNome — vem do nome ou email do usuário. */
  tecnicoNomeSugerido: string;
  /** Quando re-envio, ID da ficha original devolvida. */
  fichaOrigemId?: string | null;
  /** Quando re-envio, motivo registrado pelo aprovador. */
  motivoDevolucao?: string | null;
  /** Pré-preenchimento de dados (re-envio). */
  dadosIniciais?: Record<string, unknown>;
  /** Pré-preenchimento de cabeçalho (re-envio). */
  cabecalhoInicial?: Partial<CabecalhoRascunho>;
}

/**
 * Renderer dinâmico do formulário de ficha (US-MOB-004).
 *
 * Lê `schema.secoes[].campos[]` e produz o formulário inteiro. Faz
 * auto-save em localStorage a cada mudança, valida client-side com
 * `construirSchemaZodEstrito` no submit, e envia via `POST /api/app/fichas`
 * carregando `Idempotency-Key` (UUID v4 persistido no rascunho).
 *
 * Estados cobertos:
 *  - idle (inicial ou rascunho restaurado)
 *  - enviando (loading + bloqueia submit)
 *  - sucesso (toast + redirect /app/minhas-fichas)
 *  - erro (inline por campo + toast)
 *  - rascunho restaurado (banner com opção descartar)
 *  - foto: prévia, trocar, remover
 *  - GPS: consentimento explícito, captura, falha
 */
export function FormularioFichaMobile({
  schema,
  prefixo,
  usuarioId,
  tecnicoNomeSugerido,
  fichaOrigemId,
  motivoDevolucao,
  dadosIniciais,
  cabecalhoInicial,
}: FormularioFichaMobileProps) {
  const formId = useId();

  const [rascunho, setRascunho] = useState<RascunhoFicha>(() =>
    montarRascunhoInicial({
      usuarioId,
      prefixo,
      codigo: schema.codigo,
      fichaOrigemId,
      tecnicoNomeSugerido,
      idempotencyKey: gerarUuidV4(),
      dados: dadosIniciais,
      cabecalho: cabecalhoInicial,
    }),
  );
  const [restaurouRascunho, setRestaurouRascunho] = useState(false);
  const [erros, setErros] = useState<ErrosCampos>({});
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  // Restaura rascunho salvo (se houver) na primeira montagem cliente.
  // O initial state já criou um novo rascunho — só substituímos se
  // existir um persistido com mesma chave.
  useEffect(() => {
    const existente = carregarRascunho({
      usuarioId,
      prefixo,
      codigo: schema.codigo,
      fichaOrigemId: fichaOrigemId ?? null,
    });
    if (existente) {
      setRascunho(existente);
      setRestaurouRascunho(true);
    }
    // Apenas na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save sempre que rascunho mudar.
  useEffect(() => {
    salvarRascunho(rascunho);
  }, [rascunho]);

  // Seções visíveis dado o estado atual (variantes condicionais, ex.: tipo
  // de inspeção). Só os campos visíveis entram na validação e no payload.
  const secoesVisiveis = useMemo(
    () => schema.secoes.filter((s) => secaoVisivel(s, rascunho.dados)),
    [schema, rascunho.dados],
  );
  const camposVisiveis: CampoFicha[] = useMemo(
    () => secoesVisiveis.flatMap((s) => s.campos),
    [secoesVisiveis],
  );

  const setDado = useCallback(
    (chave: string, valor: unknown) => {
      setRascunho((r) => ({
        ...r,
        dados: { ...r.dados, [chave]: valor },
      }));
      // Limpa erro do campo ao tocar.
      setErros((prev) => {
        if (!prev[chave]) return prev;
        const novo = { ...prev };
        delete novo[chave];
        return novo;
      });
    },
    [],
  );

  const setCabecalho = useCallback(
    <K extends keyof CabecalhoRascunho>(chave: K, valor: CabecalhoRascunho[K]) => {
      setRascunho((r) => ({
        ...r,
        cabecalho: { ...r.cabecalho, [chave]: valor },
      }));
    },
    [],
  );

  function descartarERecomecar() {
    descartarRascunho({
      usuarioId,
      prefixo,
      codigo: schema.codigo,
      fichaOrigemId: fichaOrigemId ?? null,
    });
    setRascunho(
      montarRascunhoInicial({
        usuarioId,
        prefixo,
        codigo: schema.codigo,
        fichaOrigemId,
        tecnicoNomeSugerido,
        idempotencyKey: gerarUuidV4(),
        dados: dadosIniciais,
        cabecalho: cabecalhoInicial,
      }),
    );
    setRestaurouRascunho(false);
    setErros({});
  }

  // ─── GPS (hook useGpsFicha) ───────────────────────────────────────────
  const gps = useGpsFicha({
    jaConsentiu: rascunho.cabecalho.consentiuGps,
    aoConsentir: () =>
      setRascunho((r) => ({
        ...r,
        cabecalho: { ...r.cabecalho, consentiuGps: true },
      })),
    aoCapturar: (latitude, longitude, precisaoM) =>
      setRascunho((r) => ({
        ...r,
        cabecalho: {
          ...r.cabecalho,
          latitudeCapturada: latitude,
          longitudeCapturada: longitude,
          precisaoGpsM: precisaoM,
        },
      })),
    aoLimpar: () =>
      setRascunho((r) => ({
        ...r,
        cabecalho: {
          ...r.cabecalho,
          latitudeCapturada: null,
          longitudeCapturada: null,
          precisaoGpsM: null,
        },
      })),
  });

  // ─── Foto ────────────────────────────────────────────────────────────

  async function aoSelecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    setErroFoto(null);
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (arquivo.size > TAMANHO_MAX_FOTO_BYTES) {
      setErroFoto('Foto excede 5 MB. Selecione uma imagem menor.');
      return;
    }
    try {
      const dataUrl =
        arquivo.size > ALVO_COMPRESSAO_BYTES
          ? await comprimirImagemParaDataUrl(arquivo, {
              maxDimensao: 1600,
              alvoBytes: ALVO_COMPRESSAO_BYTES,
            })
          : await arquivoParaDataUrl(arquivo);
      setCabecalho('fotoDataUrl', dataUrl);
    } catch (err) {
      setErroFoto(
        err instanceof Error
          ? `Falha ao processar imagem: ${err.message}`
          : 'Falha ao processar imagem.',
      );
    } finally {
      // Reseta o input pra permitir selecionar mesmo arquivo depois.
      if (inputFotoRef.current) inputFotoRef.current.value = '';
    }
  }

  function removerFoto() {
    setCabecalho('fotoDataUrl', null);
    setErroFoto(null);
  }

  // ─── Submit ──────────────────────────────────────────────────────────

  function focarPrimeiroErro(novosErros: ErrosCampos) {
    const primeira = Object.keys(novosErros)[0];
    if (!primeira) return;
    const node = refs.current[primeira];
    if (node && typeof node.focus === 'function') {
      node.focus();
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  const { submissao, setSubmissao, submeter } = useSubmissaoFicha({
    schema,
    prefixo,
    usuarioId,
    fichaOrigemId,
    rascunho,
    camposVisiveis,
    setErros,
    focarPrimeiroErro,
  });

  function salvarRascunhoManual() {
    salvarRascunho(rascunho);
    // Usa um aria-live region implícito via toast bem simples.
    setSubmissao({ kind: 'idle' });
    // Pequena confirmação visual sem bloqueio.
    setMensagemRascunhoSalvo('Rascunho salvo neste dispositivo.');
    setTimeout(() => setMensagemRascunhoSalvo(null), 2500);
  }

  const [mensagemRascunhoSalvo, setMensagemRascunhoSalvo] = useState<string | null>(null);

  // ─── Render ──────────────────────────────────────────────────────────

  const ehReenvio = Boolean(fichaOrigemId);

  return (
    <form onSubmit={submeter} noValidate aria-labelledby={`${formId}-titulo`} className="space-y-5">
      <h2 id={`${formId}-titulo`} className="sr-only">
        Formulário {schema.rotulo}
      </h2>

      {ehReenvio && motivoDevolucao ? (
        <div
          role="alert"
          className="rounded-gov-card border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-semibold">Ficha devolvida para correção</p>
          <p className="mt-1 text-xs leading-snug">
            Motivo do aprovador: {motivoDevolucao}
          </p>
        </div>
      ) : null}

      {restaurouRascunho ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start justify-between gap-3 rounded-gov-card border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Rascunho restaurado</p>
            <p className="mt-0.5 text-xs">
              Continuamos de onde parou. Atualizado em{' '}
              {new Date(rascunho.atualizadoEm).toLocaleString('pt-BR')}.
            </p>
          </div>
          <button
            type="button"
            onClick={descartarERecomecar}
            className="min-h-[36px] rounded border border-blue-400 px-2 text-xs font-medium text-blue-900 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Descartar
          </button>
        </div>
      ) : null}

      {/* ───── Cabeçalho da visita ───── */}
      <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Identificação da visita
        </legend>

        <div className="space-y-3">
          <div>
            <label htmlFor={`${formId}-tecnicoNome`} className="block text-xs font-medium text-app-fg">
              Nome do técnico <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <input
              id={`${formId}-tecnicoNome`}
              ref={(el) => {
                refs.current['__tecnicoNome'] = el;
              }}
              type="text"
              autoComplete="name"
              required
              aria-required="true"
              value={rascunho.cabecalho.tecnicoNome}
              onChange={(e) => setCabecalho('tecnicoNome', e.target.value)}
              aria-invalid={erros['__tecnicoNome'] ? true : undefined}
              aria-describedby={erros['__tecnicoNome'] ? `${formId}-tecnicoNome-erro` : undefined}
              className={`mt-1 block w-full min-h-[44px] rounded border bg-app-surface px-3 text-md text-app-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul ${
                erros['__tecnicoNome'] ? 'border-red-500' : 'border-app-border focus:border-gov-azul'
              }`}
            />
            {erros['__tecnicoNome'] ? (
              <p id={`${formId}-tecnicoNome-erro`} role="alert" className="mt-1 text-xs font-medium text-red-700">
                {erros['__tecnicoNome']}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={`${formId}-dataVisita`} className="block text-xs font-medium text-app-fg">
              Data da visita <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <input
              id={`${formId}-dataVisita`}
              ref={(el) => {
                refs.current['__dataVisita'] = el;
              }}
              type="date"
              required
              aria-required="true"
              value={rascunho.cabecalho.dataVisita}
              onChange={(e) => setCabecalho('dataVisita', e.target.value)}
              aria-invalid={erros['__dataVisita'] ? true : undefined}
              aria-describedby={
                erros['__dataVisita'] ? `${formId}-dataVisita-erro` : undefined
              }
              className={`mt-1 block w-full min-h-[44px] rounded border bg-app-surface px-3 text-md text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul ${
                erros['__dataVisita'] ? 'border-red-500' : 'border-app-border focus:border-gov-azul'
              }`}
            />
            {erros['__dataVisita'] ? (
              <p
                id={`${formId}-dataVisita-erro`}
                role="alert"
                className="mt-1 text-xs font-medium text-red-700"
              >
                {erros['__dataVisita']}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${formId}-horaInicio`} className="block text-xs font-medium text-app-fg">
                Hora de início
              </label>
              <input
                id={`${formId}-horaInicio`}
                type="time"
                value={rascunho.cabecalho.horaInicio ?? ''}
                onChange={(e) => setCabecalho('horaInicio', e.target.value || null)}
                className="mt-1 block w-full min-h-[44px] rounded border border-app-border bg-app-surface px-3 text-md text-app-fg focus:border-gov-azul focus:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
              />
            </div>
            <div>
              <label htmlFor={`${formId}-horaFim`} className="block text-xs font-medium text-app-fg">
                Hora de término
              </label>
              <input
                id={`${formId}-horaFim`}
                type="time"
                value={rascunho.cabecalho.horaFim ?? ''}
                onChange={(e) => setCabecalho('horaFim', e.target.value || null)}
                className="mt-1 block w-full min-h-[44px] rounded border border-app-border bg-app-surface px-3 text-md text-app-fg focus:border-gov-azul focus:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
              />
            </div>
          </div>
        </div>
      </fieldset>

      {/* ───── GPS ───── */}
      <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Localização
        </legend>

        {rascunho.cabecalho.latitudeCapturada !== null &&
        rascunho.cabecalho.longitudeCapturada !== null ? (
          <div className="space-y-2">
            <p className="text-sm text-app-fg">
              <span className="font-semibold">Capturada:</span>{' '}
              {rascunho.cabecalho.latitudeCapturada.toFixed(6)},{' '}
              {rascunho.cabecalho.longitudeCapturada.toFixed(6)}
            </p>
            {rascunho.cabecalho.precisaoGpsM !== null ? (
              <p className="text-xs text-app-fg-muted">
                Precisão estimada: ±{rascunho.cabecalho.precisaoGpsM.toFixed(0)} m
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={gps.pedirConsentimento}
                className="min-h-[44px] rounded border border-app-border px-3 text-sm font-medium text-app-fg transition-colors hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul active:bg-app-surface-3"
                disabled={gps.capturando}
              >
                {gps.capturando ? 'Capturando…' : 'Atualizar'}
              </button>
              <button
                type="button"
                onClick={gps.limpar}
                className="min-h-[44px] rounded border border-app-border px-3 text-sm font-medium text-app-fg transition-colors hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul active:bg-app-surface-3"
              >
                Remover
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-app-fg-muted">
              Capturar a localização permite verificar a visita ao posto. Opcional.
            </p>
            <button
              type="button"
              onClick={gps.pedirConsentimento}
              disabled={gps.capturando}
              className="mt-2 min-h-[44px] rounded bg-gov-azul px-4 text-sm font-semibold text-white hover:bg-gov-azul-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {gps.capturando ? 'Capturando…' : 'Capturar localização'}
            </button>
          </div>
        )}

        {gps.erro ? (
          <p role="alert" className="mt-2 text-xs font-medium text-red-700">
            {gps.erro}
          </p>
        ) : null}

        {gps.mostrarConsentimento ? (
          <div
            role="dialog"
            aria-labelledby={`${formId}-gps-titulo`}
            aria-describedby={`${formId}-gps-descricao`}
            className="mt-3 rounded border border-gov-azul bg-blue-50 p-3"
          >
            <p id={`${formId}-gps-titulo`} className="text-sm font-semibold text-app-fg">
              Permissão de localização
            </p>
            <p id={`${formId}-gps-descricao`} className="mt-1 text-xs text-app-fg-muted">
              Permitir captura de localização para verificação da visita técnica? A
              coordenada será enviada apenas com esta ficha. Pode ser removida antes
              do envio.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={gps.aceitarConsentimento}
                className="min-h-[44px] flex-1 rounded bg-gov-azul px-3 text-sm font-semibold text-white hover:bg-gov-azul-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
              >
                Permitir
              </button>
              <button
                type="button"
                onClick={gps.negarConsentimento}
                className="min-h-[44px] rounded border border-app-border px-3 text-sm font-medium text-app-fg transition-colors hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul active:bg-app-surface-3"
              >
                Agora não
              </button>
            </div>
          </div>
        ) : null}
      </fieldset>

      {/* ───── Foto da ficha física ───── */}
      <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Foto da ficha física (opcional)
        </legend>

        {rascunho.cabecalho.fotoDataUrl ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={rascunho.cabecalho.fotoDataUrl}
              alt="Pré-visualização da foto da ficha"
              className="max-h-48 w-full rounded border border-app-border object-contain"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputFotoRef.current?.click()}
                className="min-h-[44px] rounded border border-app-border px-3 text-sm font-medium text-app-fg transition-colors hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul active:bg-app-surface-3"
              >
                Trocar
              </button>
              <button
                type="button"
                onClick={removerFoto}
                className="min-h-[44px] rounded border border-app-border px-3 text-sm font-medium text-app-fg transition-colors hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul active:bg-app-surface-3"
              >
                Remover
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputFotoRef.current?.click()}
            className="min-h-[44px] rounded border border-app-border px-3 text-sm font-medium text-app-fg transition-colors hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul active:bg-app-surface-3"
          >
            Adicionar foto da ficha
          </button>
        )}

        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={aoSelecionarFoto}
          className="sr-only"
          aria-label="Selecionar foto da ficha física"
        />
        {erroFoto ? (
          <p role="alert" className="mt-2 text-xs font-medium text-red-700">
            {erroFoto}
          </p>
        ) : null}
        <p className="mt-2 text-2xs text-app-fg-muted">
          A foto fica neste dispositivo até o envio. Limite de 5 MB; arquivos
          maiores são reduzidos automaticamente.
        </p>
      </fieldset>

      {/* ───── Seções dinâmicas (filtra variantes ocultas) ───── */}
      {secoesVisiveis.map((secao) => (
        <fieldset
          key={secao.titulo}
          className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
        >
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-app-fg-muted">
            {secao.titulo}
          </legend>
          <div className="space-y-3">
            {secao.campos.map((campo) => (
              <div
                key={campo.chave}
                ref={(el) => {
                  refs.current[campo.chave] = el;
                }}
              >
                <CampoFichaMobile
                  campo={campo}
                  valor={rascunho.dados[campo.chave]}
                  onChange={setDado}
                  erro={erros[campo.chave] ?? null}
                  prefixoId={formId}
                  obrigatorio={Boolean(campo.obrigatorio)}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      {/* ───── Observações livres ───── */}
      <fieldset className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Observações
        </legend>
        <label htmlFor={`${formId}-obs`} className="sr-only">
          Observações livres
        </label>
        <textarea
          id={`${formId}-obs`}
          rows={4}
          value={rascunho.cabecalho.observacoes ?? ''}
          maxLength={2000}
          onChange={(e) =>
            setCabecalho('observacoes', e.target.value ? e.target.value : null)
          }
          placeholder="Anotações livres sobre a visita."
          className="block w-full rounded border border-app-border bg-app-surface px-3 py-2 text-md text-app-fg placeholder:text-app-fg-muted focus:border-gov-azul focus:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
        />
        <p className="mt-1 text-2xs text-app-fg-muted">
          {rascunho.cabecalho.observacoes?.length ?? 0} / 2000 caracteres
        </p>
      </fieldset>

      {/* ───── Mensagens de status ───── */}
      <div aria-live="polite" className="space-y-2">
        {mensagemRascunhoSalvo ? (
          <p className="rounded border border-green-400 bg-green-50 p-2 text-xs text-green-900">
            {mensagemRascunhoSalvo}
          </p>
        ) : null}
        {submissao.kind === 'sucesso' ? (
          <p className="rounded border border-green-400 bg-green-50 p-2 text-sm text-green-900">
            Ficha enviada. Redirecionando para Minhas fichas…
          </p>
        ) : null}
        {submissao.kind === 'enfileirada' ? (
          <p className="rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
            Sem conexão. A ficha foi salva no aparelho e será enviada
            automaticamente assim que houver internet.
          </p>
        ) : null}
        {submissao.kind === 'erro' ? (
          <p
            role="alert"
            className="rounded border border-red-400 bg-red-50 p-2 text-sm text-red-900"
          >
            {submissao.mensagem}
          </p>
        ) : null}
      </div>

      {/* ───── Bottom action bar ─────
          Ancora logo acima do bottom nav (altura 56px) somando a barra de
          gestos do dispositivo (safe-area-inset-bottom). `-mx-4` sangra a
          barra até as bordas do container de conteúdo (px-safe = max(1rem,
          inset)); em telas sem notch isso equivale a px-4. */}
      <div
        className="sticky z-10 -mx-4 mt-4 flex gap-2 border-t border-app-border-subtle bg-app-surface p-3 shadow-gov-sticky"
        style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
        role="group"
        aria-label="Ações do formulário"
      >
        <button
          type="button"
          onClick={salvarRascunhoManual}
          className="min-h-[44px] flex-1 rounded border border-app-border bg-app-surface px-3 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
        >
          Salvar rascunho
        </button>
        <button
          type="submit"
          disabled={submissao.kind === 'enviando'}
          className="min-h-[44px] flex-1 rounded bg-gov-azul px-3 text-sm font-semibold text-white shadow-gov-card transition-[background-color,transform] duration-150 hover:bg-gov-azul-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          {submissao.kind === 'enviando' ? (
            <span className="inline-flex items-center justify-center gap-2">
              <SpinnerInline />
              Submetendo…
            </span>
          ) : ehReenvio ? (
            'Reenviar ficha'
          ) : (
            'Submeter ficha'
          )}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────

function SpinnerInline() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
    </svg>
  );
}

