'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export interface ChipsFiltrosAtivosProps {
  /** Usuário autenticado? — só mostra "Apenas favoritos" quando sim. */
  mostrarFavoritos?: boolean;
}

interface ChipSpec {
  chave: string;
  rotulo: string;
  valor: string;
}

const RÓTULOS: Record<string, string> = {
  ugrhi: 'UGRHI',
  municipio: 'Município',
  bacia: 'Bacia',
  tipo: 'Tipo',
  tem_fd: 'Com Ficha Descritiva',
  tem_fi: 'Com Ficha de Inspeção',
  tem_telem: 'Com telemetria',
  favoritos: 'Apenas favoritos',
};

function extrair(params: URLSearchParams, mostrarFavoritos: boolean): ChipSpec[] {
  const chips: ChipSpec[] = [];
  for (const [chave, rotulo] of Object.entries(RÓTULOS)) {
    if (chave === 'favoritos' && !mostrarFavoritos) continue;
    const valor = params.get(chave);
    if (!valor) continue;
    // Checkbox (valor "1") vira só o rótulo; demais mostram o valor.
    const isBoolean = ['tem_fd', 'tem_fi', 'tem_telem', 'favoritos'].includes(chave);
    chips.push({
      chave,
      rotulo,
      valor: isBoolean ? '' : valor,
    });
  }
  return chips;
}

export function ChipsFiltrosAtivos({ mostrarFavoritos = false }: ChipsFiltrosAtivosProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const chips = extrair(params, mostrarFavoritos);

  if (chips.length === 0) return null;

  function remover(chave: string) {
    const novo = new URLSearchParams(searchParams.toString());
    novo.delete(chave);
    novo.delete('pagina'); // reseta paginação ao mudar filtro
    const qs = novo.toString();
    router.push(qs ? `/?${qs}` : '/');
  }

  function limparTudo() {
    const novo = new URLSearchParams();
    const q = searchParams.get('q');
    if (q) novo.set('q', q);
    const qs = novo.toString();
    router.push(qs ? `/?${qs}` : '/');
  }

  return (
    <div
      role="region"
      aria-label="Filtros aplicados"
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((c) => (
        <button
          key={c.chave}
          type="button"
          onClick={() => remover(c.chave)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gov-azul bg-gov-azul-claro text-gov-azul text-xs font-medium hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          aria-label={`Remover filtro ${c.rotulo}`}
        >
          <span>
            {c.rotulo}
            {c.valor ? `: ${c.valor}` : ''}
          </span>
          <span aria-hidden="true" className="text-sm leading-none">×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={limparTudo}
        className="text-xs text-gov-muted hover:text-gov-texto underline-offset-4 hover:underline"
      >
        Limpar todos
      </button>
    </div>
  );
}
