import { UF_DO_ESTADO, type PontoMapaPosto } from '@/domain/mapa-postos';
import { rotuloUgrhi } from './ugrhis';

/**
 * Onde o posto fica, em texto, para a lista, a dica do mapa e o detalhe.
 *
 * O município sai como o cadastro grava (caixa alta, sem acento), do mesmo
 * jeito que o nome do posto: acentuar à mão erraria nome próprio. A UF só
 * aparece quando não é SP, que é a rede da tela; sem município, a UF sozinha
 * ainda diz de onde o posto é.
 */
export function municipioComUf(ponto: Pick<PontoMapaPosto, 'municipio' | 'uf'>): string | null {
  const ufVisivel = ponto.uf && ponto.uf !== UF_DO_ESTADO ? ponto.uf : null;
  if (ponto.municipio) return ufVisivel ? `${ponto.municipio}, ${ufVisivel}` : ponto.municipio;
  return ufVisivel;
}

/**
 * Linhas de localização. "Sem UGRHI" só aparece para posto de SP: fora do
 * estado a ausência de UGRHI é o esperado, e escrever isso em cada posto do PR
 * seria ruído.
 */
export function linhasDeLocal(ponto: Pick<PontoMapaPosto, 'municipio' | 'uf' | 'ugrhi'>): string[] {
  const linhas: string[] = [];
  const municipio = municipioComUf(ponto);
  if (municipio) linhas.push(municipio);
  if (ponto.ugrhi !== null || ponto.uf === UF_DO_ESTADO) linhas.push(rotuloUgrhi(ponto.ugrhi));
  return linhas;
}

export const AVISO_COORDENADA_SUSPEITA = 'Coordenada possivelmente imprecisa no cadastro';
