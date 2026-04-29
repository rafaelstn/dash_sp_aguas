import { MapPin, ExternalLink } from 'lucide-react';

export interface MapaPostoProps {
  latitude: number | null;
  longitude: number | null;
  nomeEstacao: string | null;
  prefixo: string;
  /** Nível de zoom (1=mundo, 20=rua) — default 15 (bairro). */
  zoom?: number;
}

/**
 * Mapa Google Maps via iframe embed. Sem API key — o endpoint `/maps?output=embed`
 * é público, read-only, sem limite de uso declarado.
 *
 * Se não há coordenadas, renderiza placeholder com call-to-action.
 */
export function MapaPosto({
  latitude,
  longitude,
  nomeEstacao,
  prefixo,
  zoom = 14,
}: MapaPostoProps) {
  if (latitude == null || longitude == null) {
    return (
      <div
        role="note"
        className="flex h-64 flex-col items-center justify-center gap-2 rounded-gov-card border border-dashed border-app-border bg-app-surface-2 text-center"
      >
        <MapPin className="h-8 w-8 text-app-fg-subtle" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-app-fg">
            Coordenadas não cadastradas
          </p>
          <p className="text-xs text-app-fg-muted">
            Este posto não tem latitude/longitude no cadastro oficial.
          </p>
        </div>
      </div>
    );
  }

  const titulo = nomeEstacao
    ? `Posto ${prefixo} — ${nomeEstacao}`
    : `Posto ${prefixo}`;

  // Embed sem API key — Google Maps público, aceita lat,lng + zoom.
  const srcEmbed = `https://maps.google.com/maps?q=${latitude},${longitude}&z=${zoom}&hl=pt-BR&output=embed`;

  // Deep link para abrir no Google Maps nativo (web ou app mobile).
  const linkExterno = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  return (
    <div className="overflow-hidden rounded-gov-card border border-app-border-subtle bg-app-surface">
      <div className="flex items-center justify-between gap-2 border-b border-app-border-subtle px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-app-fg-muted">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="mono tabular">
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </span>
        </div>
        <a
          href={linkExterno}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          aria-label="Abrir no Google Maps"
        >
          Abrir no Maps
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
      <iframe
        src={srcEmbed}
        title={`Mapa do posto ${prefixo}`}
        aria-label={`Localização do ${titulo}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-64 w-full border-0"
      />
    </div>
  );
}
