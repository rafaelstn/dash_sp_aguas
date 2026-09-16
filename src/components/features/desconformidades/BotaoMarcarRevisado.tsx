'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CategoriaDesconformidade } from '@/domain/desconformidade';
import { enviarRevisaoPorFetch, registrarRevisao } from './revisao-envio';
import { ID_NOTA_REVISAO_INDISPONIVEL, useRevisaoDisponivel } from './RevisaoDisponibilidade';

export interface BotaoMarcarRevisadoProps {
  tipoEntidade: 'posto' | 'arquivo';
  idEntidade: string;
  categoria: CategoriaDesconformidade;
  statusInicial: 'pendente' | 'revisado';
}

type Aviso = { tipo: 'sucesso' | 'falha' | 'indisponivel'; mensagem: string } | null;

/**
 * Invoca POST /api/desconformidades/revisoes e só mostra "Revisado" depois da
 * confirmação do servidor. A região de status fica montada o tempo todo (troca
 * de botão para selo não derruba o anúncio). Sem identidade o botão fica
 * aria-disabled, apontando para a frase do layout; se o servidor recusar com
 * 403 `identificacao_obrigatoria`, fica igual e a mensagem não convida a repetir.
 */
export function BotaoMarcarRevisado({
  tipoEntidade,
  idEntidade,
  categoria,
  statusInicial,
}: BotaoMarcarRevisadoProps) {
  const router = useRouter();
  const disponivelNaSessao = useRevisaoDisponivel();
  const [status, setStatus] = useState(statusInicial);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [enviando, setEnviando] = useState(false);
  const [recusadoPeloServidor, setRecusadoPeloServidor] = useState(false);
  const [atualizando, startTransition] = useTransition();
  const travaRef = useRef(false);

  const indisponivel = !disponivelNaSessao || recusadoPeloServidor;
  const ocupado = enviando || atualizando;

  async function enviar() {
    if (indisponivel || travaRef.current) return;
    travaRef.current = true;
    setEnviando(true);
    setAviso(null);
    const r = await registrarRevisao(
      { tipoEntidade, idEntidade, categoria },
      disponivelNaSessao,
      enviarRevisaoPorFetch,
    );
    setEnviando(false);
    travaRef.current = false;
    if (r.tipo === 'registrada') {
      setStatus('revisado');
      setAviso({ tipo: 'sucesso', mensagem: 'Registro marcado como revisado.' });
      startTransition(() => router.refresh());
    } else if (r.tipo === 'indisponivel') {
      setRecusadoPeloServidor(true);
      setAviso({ tipo: 'indisponivel', mensagem: r.mensagem });
    } else {
      setAviso({ tipo: 'falha', mensagem: r.mensagem });
    }
  }

  const classeAviso =
    aviso?.tipo === 'falha'
      ? 'text-xs font-medium text-gov-perigo'
      : aviso?.tipo === 'indisponivel'
        ? 'text-xs text-app-fg-muted'
        : 'sr-only';

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {status === 'revisado' ? (
        <span className="inline-flex items-center gap-2 text-sm font-medium text-gov-sucesso">
          <Check className="h-4 w-4" aria-hidden="true" />
          <span>Revisado</span>
        </span>
      ) : (
        <Button
          type="button"
          variante="secundario"
          onClick={enviar}
          aria-disabled={indisponivel || ocupado || undefined}
          aria-describedby={!disponivelNaSessao ? ID_NOTA_REVISAO_INDISPONIVEL : undefined}
          className={indisponivel ? 'cursor-not-allowed opacity-50' : ''}
        >
          {ocupado ? 'Registrando...' : 'Marcar como revisado'}
        </Button>
      )}
      <span role="status" aria-atomic="true" className={classeAviso}>
        {aviso?.mensagem ?? ''}
      </span>
    </span>
  );
}
