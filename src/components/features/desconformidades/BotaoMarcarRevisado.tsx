'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { LiveRegion } from '@/components/a11y/LiveRegion';
import type { CategoriaDesconformidade } from '@/domain/desconformidade';

export interface BotaoMarcarRevisadoProps {
  tipoEntidade: 'posto' | 'arquivo';
  idEntidade: string;
  categoria: CategoriaDesconformidade;
  statusInicial: 'pendente' | 'revisado';
}

/**
 * Botão client-side que invoca POST /api/desconformidades/revisoes.
 * Faz optimistic update e dispara revalidação da rota ao completar.
 * Comunica o resultado via LiveRegion para leitor de tela.
 */
export function BotaoMarcarRevisado({
  tipoEntidade,
  idEntidade,
  categoria,
  statusInicial,
}: BotaoMarcarRevisadoProps) {
  const router = useRouter();
  const [status, setStatus] = useState(statusInicial);
  const [anuncio, setAnuncio] = useState('');
  const [pending, startTransition] = useTransition();

  async function enviar() {
    const statusAntes = status;
    setStatus('revisado');
    setAnuncio('Registro marcado como revisado.');
    try {
      const resp = await fetch('/api/desconformidades/revisoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoEntidade,
          idEntidade,
          categoria,
        }),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      startTransition(() => router.refresh());
    } catch {
      setStatus(statusAntes);
      setAnuncio('Falha ao registrar revisão. Tente novamente em instantes.');
    }
  }

  if (status === 'revisado') {
    return (
      <>
        <span
          className="inline-flex items-center gap-2 text-sm text-gov-sucesso font-medium"
          role="status"
        >
          <span aria-hidden="true">✓</span>
          <span>Revisado</span>
        </span>
        <LiveRegion mensagem={anuncio} />
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        variante="secundario"
        onClick={enviar}
        disabled={pending}
        aria-describedby={`entidade-${idEntidade.replace(/[^a-z0-9]/gi, '-')}`}
      >
        {pending ? 'Registrando...' : 'Marcar como revisado'}
      </Button>
      <LiveRegion mensagem={anuncio} />
    </>
  );
}
