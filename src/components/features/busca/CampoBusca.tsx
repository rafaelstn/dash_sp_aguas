'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function CampoBusca() {
  const router = useRouter();
  const params = useSearchParams();
  const [termo, setTermo] = useState((params.get('q') ?? '').toUpperCase());

  function submeter(e: FormEvent) {
    e.preventDefault();
    const aparado = termo.trim();
    if (aparado.length === 0) {
      router.push('/');
      return;
    }
    const sp = new URLSearchParams();
    sp.set('q', aparado);
    router.push(`/?${sp.toString()}`);
  }

  return (
    <form onSubmit={submeter} role="search" aria-label="Busca de postos hidrológicos" className="flex gap-3 items-end">
      <div className="flex-1">
        <Input
          rotulo="Buscar posto"
          descricao="Informe o prefixo (ex.: 1D-008) ou texto livre (município, bacia, UGRHI)."
          placeholder="Ex.: 1D-008 OU GUARATINGUETÁ"
          value={termo}
          // Todos os prefixos oficiais dos postos são maiúsculos; a busca
          // textual (FTS) é case-insensitive no backend, então subir tudo
          // pra maiúscula não muda resultado — só garante prefixo certo e
          // consistência visual. `textTransform: uppercase` no CSS cobre
          // o frame entre keystroke e re-render.
          onChange={(e) => setTermo(e.currentTarget.value.toUpperCase())}
          autoComplete="off"
          inputMode="search"
          style={{ textTransform: 'uppercase' }}
        />
      </div>
      <Button type="submit">Buscar</Button>
    </form>
  );
}
