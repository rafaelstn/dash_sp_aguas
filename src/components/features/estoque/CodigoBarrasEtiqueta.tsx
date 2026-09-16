import { codificarCode39 } from '@/lib/codigo-barras/code39';

/** Altura das barras, em módulos (da ordem de 15% do comprimento do símbolo). */
const ALTURA_MODULOS = 40;
/** Teto de escala na tela: um módulo nunca passa de 2 px de largura. */
const ESCALA_MAXIMA_PX = 2;

interface Props {
  /** Código da unidade, como está no cadastro. Null quando o item não tem. */
  codigo: string | null;
}

/**
 * Código de barras da etiqueta de patrimônio, em SVG inline (sem rede, sem
 * dependência, nítido na impressão). A simbologia vem de `@/lib/codigo-barras`;
 * este componente só desenha a geometria em módulos inteiros com
 * `crispEdges`. Sem código, ou com código fora do conjunto da simbologia, não
 * desenha barras e não inventa código: mostra o aviso no mesmo espaço, para a
 * grade de etiquetas não mudar de altura.
 */
export function CodigoBarrasEtiqueta({ codigo }: Props) {
  const texto = codigo?.trim() ?? '';
  const resultado = texto ? codificarCode39(texto) : null;

  if (!resultado || !resultado.ok) {
    return (
      <div className="flex h-[4.5rem] flex-col items-center justify-center rounded border border-dashed border-neutral-400 px-2 text-center">
        <p className="text-xs font-medium text-neutral-700">
          {resultado ? 'Código sem barras' : 'Sem código'}
        </p>
        {resultado ? (
          <p className="tabular break-all text-2xs text-neutral-700">{texto}</p>
        ) : null}
      </div>
    );
  }

  // O texto legível é o que as barras codificam (maiúsculas), igual ao que o leitor devolve.
  const { barras, larguraModulos, texto: codificado } = resultado;

  return (
    <div className="flex h-[4.5rem] flex-col items-center">
      <svg
        role="img"
        aria-label={`Código de barras ${codificado}`}
        viewBox={`0 0 ${larguraModulos} ${ALTURA_MODULOS}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="block h-14 w-full"
        style={{ maxWidth: larguraModulos * ESCALA_MAXIMA_PX }}
      >
        <rect x={0} y={0} width={larguraModulos} height={ALTURA_MODULOS} fill="#ffffff" />
        {barras.map((b) => (
          <rect key={b.x} x={b.x} y={0} width={b.largura} height={ALTURA_MODULOS} fill="#000000" />
        ))}
      </svg>
      <p aria-hidden="true" className="tabular mt-0.5 text-xs leading-none tracking-wider text-black">
        {codificado}
      </p>
    </div>
  );
}
