'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function CampoBusca() {
  const router = useRouter();
  const params = useSearchParams();
  const [termo, setTermo] = useState(params.get('q') ?? '');

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
          placeholder="Ex.: 1D-008 ou Guaratinguetá"
          value={termo}
          onChange={(e) => setTermo(e.currentTarget.value)}
          autoComplete="off"
          inputMode="search"
        />
      </div>
      <Button type="submit">Buscar</Button>
    </form>
  );
}
