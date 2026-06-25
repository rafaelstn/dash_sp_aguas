'use client';

import { useCallback, useState } from 'react';

interface ParametrosGpsFicha {
  /** Se o técnico já consentiu antes (pula o diálogo de permissão). */
  jaConsentiu: boolean;
  /** Registra o consentimento (persistido no rascunho pelo chamador). */
  aoConsentir: () => void;
  /** Recebe as coordenadas capturadas para o chamador persistir. */
  aoCapturar: (latitude: number, longitude: number, precisaoM: number) => void;
  /** Limpa as coordenadas capturadas no chamador. */
  aoLimpar: () => void;
}

const MENSAGENS_ERRO_GPS: Record<number, string> = {
  1: 'Permissão de localização negada pelo dispositivo.',
  2: 'Localização indisponível no momento.',
  3: 'Tempo de espera esgotado ao obter localização.',
};

/**
 * Encapsula a captura de GPS da ficha mobile: estados de UI (diálogo de
 * consentimento, "capturando", erro) e a chamada à Geolocation API. As
 * coordenadas e o consentimento são persistidos pelo chamador via callbacks
 * (o rascunho continua sendo a fonte da verdade). Extraído de
 * `FormularioFichaMobile` (ARCH-6).
 */
export function useGpsFicha({
  jaConsentiu,
  aoConsentir,
  aoCapturar,
  aoLimpar,
}: ParametrosGpsFicha) {
  const [mostrarConsentimento, setMostrarConsentimento] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const capturar = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErro('Captura de localização indisponível neste dispositivo.');
      return;
    }
    setCapturando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCapturando(false);
        aoCapturar(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        setCapturando(false);
        setErro(MENSAGENS_ERRO_GPS[err.code] ?? 'Falha ao capturar localização.');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [aoCapturar]);

  const pedirConsentimento = useCallback(() => {
    setErro(null);
    if (jaConsentiu) {
      capturar();
      return;
    }
    setMostrarConsentimento(true);
  }, [jaConsentiu, capturar]);

  const negarConsentimento = useCallback(() => setMostrarConsentimento(false), []);

  const aceitarConsentimento = useCallback(() => {
    aoConsentir();
    setMostrarConsentimento(false);
    capturar();
  }, [aoConsentir, capturar]);

  const limpar = useCallback(() => {
    aoLimpar();
    setErro(null);
  }, [aoLimpar]);

  return {
    mostrarConsentimento,
    capturando,
    erro,
    pedirConsentimento,
    negarConsentimento,
    aceitarConsentimento,
    limpar,
  };
}
