'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  construirSchemaZodEstrito,
  type CampoFicha,
  type SchemaFicha,
} from '@/domain/fichas/schemas';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';
import {
  mensagemZodPtBR,
  normalizarDadosFicha,
  validarCabecalhoFicha,
  type ErrosCampos,
} from '@/domain/fichas/validacao-ficha';
import {
  ErroTriagemAPI,
  mensagemErroTriagem,
  submeterFichaApp,
  type CorpoSubmissaoApp,
} from '@/lib/triagem-api';
import {
  descartarRascunho,
  salvarRascunho,
  type RascunhoFicha,
} from '@/lib/rascunho-ficha';
import { enfileirarEnvio } from '@/lib/fila-envios';

export type EstadoSubmissao =
  | { kind: 'idle' }
  | { kind: 'enviando' }
  | { kind: 'sucesso'; id: string }
  | { kind: 'enfileirada' }
  | { kind: 'erro'; mensagem: string };

interface ParametrosSubmissao {
  schema: SchemaFicha;
  prefixo: string;
  usuarioId: string;
  fichaOrigemId?: string | null;
  rascunho: RascunhoFicha;
  camposVisiveis: CampoFicha[];
  /** Define os erros de campo no formulário (do componente). */
  setErros: (erros: ErrosCampos) => void;
  /** Foca/rola até o primeiro campo com erro (refs do componente). */
  focarPrimeiroErro: (erros: ErrosCampos) => void;
}

/**
 * Encapsula o envio da ficha mobile: validação (cabeçalho + Zod), montagem do
 * payload, POST com idempotência, fallback offline (enfileira para o sync) e
 * mapeamento de erros do backend em erros por campo. Mantém o estado de
 * submissão. Extraído de `FormularioFichaMobile` (ARCH-6).
 */
export function useSubmissaoFicha({
  schema,
  prefixo,
  usuarioId,
  fichaOrigemId,
  rascunho,
  camposVisiveis,
  setErros,
  focarPrimeiroErro,
}: ParametrosSubmissao) {
  const router = useRouter();
  const [submissao, setSubmissao] = useState<EstadoSubmissao>({ kind: 'idle' });

  async function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submissao.kind === 'enviando') return;

    const errosCabecalho = validarCabecalhoFicha(rascunho.cabecalho);

    const zod = construirSchemaZodEstrito(schema.codigo as CodigoTipoDocumento);
    const candidato = normalizarDadosFicha(camposVisiveis, rascunho.dados);
    const parseado = zod.safeParse(candidato);

    const errosCampos: ErrosCampos = {};
    if (!parseado.success) {
      for (const issue of parseado.error.issues) {
        const chave = String(issue.path[0] ?? '');
        if (!chave) continue;
        if (!errosCampos[chave]) {
          errosCampos[chave] = mensagemZodPtBR(issue.code, issue.message);
        }
      }
    }

    const todos = { ...errosCabecalho, ...errosCampos };
    if (Object.keys(todos).length > 0) {
      setErros(todos);
      focarPrimeiroErro(todos);
      return;
    }

    setErros({});
    setSubmissao({ kind: 'enviando' });

    const corpo: CorpoSubmissaoApp = {
      prefixo,
      codTipoDocumento: schema.codigo,
      dataVisita: rascunho.cabecalho.dataVisita,
      horaInicio: rascunho.cabecalho.horaInicio || null,
      horaFim: rascunho.cabecalho.horaFim || null,
      tecnicoNome: rascunho.cabecalho.tecnicoNome.trim(),
      latitudeCapturada: rascunho.cabecalho.latitudeCapturada,
      longitudeCapturada: rascunho.cabecalho.longitudeCapturada,
      precisaoGpsM: rascunho.cabecalho.precisaoGpsM,
      observacoes: rascunho.cabecalho.observacoes,
      dados: parseado.success
        ? (parseado.data as Record<string, unknown>)
        : candidato,
      fichaOrigemId: rascunho.fichaOrigemId,
    };

    try {
      const resp = await submeterFichaApp(corpo, rascunho.idempotencyKey);
      // Sucesso: descarta rascunho local e redireciona.
      descartarRascunho({
        usuarioId,
        prefixo,
        codigo: schema.codigo,
        fichaOrigemId: fichaOrigemId ?? null,
      });
      setSubmissao({ kind: 'sucesso', id: resp.id });
      // Pequeno delay pra usuário ver feedback de sucesso.
      setTimeout(() => {
        router.push('/app/minhas-fichas');
        router.refresh();
      }, 800);
    } catch (err) {
      if (err instanceof ErroTriagemAPI) {
        // Se backend devolveu validação detalhada, mapeia em campos.
        if (err.slug === 'body_invalido' || err.slug === 'dados_invalidos') {
          const motivos = (err.extra as { motivos?: string[] })?.motivos ?? [];
          const novos: ErrosCampos = {};
          for (const m of motivos) {
            // formato esperado: "campo.chave: mensagem" (Lucas usa `path.join`).
            const [path, ...resto] = m.split(':');
            if (!path) continue;
            const chave = path.includes('.') ? path.split('.').pop()! : path.trim();
            const mensagem = resto.join(':').trim() || 'Valor inválido.';
            novos[chave] = mensagem;
          }
          if (Object.keys(novos).length > 0) {
            setErros(novos);
            focarPrimeiroErro(novos);
            setSubmissao({
              kind: 'erro',
              mensagem: 'Corrija os campos destacados e envie novamente.',
            });
            return;
          }
        }
        setSubmissao({ kind: 'erro', mensagem: mensagemErroTriagem(err) });
      } else {
        const offline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (offline) {
          try {
            // Enfileira para envio automático quando a conexão voltar
            // (drenado por `SyncFichasPendentes`). O `id` = idempotencyKey
            // evita item duplicado se a ficha for reenfileirada.
            await enfileirarEnvio({
              id: rascunho.idempotencyKey,
              corpo,
              idempotencyKey: rascunho.idempotencyKey,
              chaveRascunho: {
                usuarioId,
                prefixo,
                codigo: schema.codigo,
                fichaOrigemId: fichaOrigemId ?? null,
              },
              criadoEm: new Date().toISOString(),
              tentativas: 0,
              ultimoErro: null,
            });
            // Mantém o rascunho como backup até o sync confirmar o envio.
            salvarRascunho(rascunho);
            setSubmissao({ kind: 'enfileirada' });
            setTimeout(() => {
              router.push('/app/minhas-fichas');
              router.refresh();
            }, 1200);
            return;
          } catch {
            // IndexedDB indisponível: cai no fluxo antigo (rascunho salvo).
          }
        }
        setSubmissao({
          kind: 'erro',
          mensagem: offline
            ? 'Sem conexão. O rascunho foi salvo. Tente enviar novamente quando estiver online.'
            : 'Falha ao enviar. Tente novamente em instantes.',
        });
      }
    }
  }

  return { submissao, setSubmissao, submeter };
}
