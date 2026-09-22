#!/usr/bin/env node
/**
 * Gera a geometria estática do mapa da tela Postos:
 *
 *   public/geo/ugrhis-sp.json  22 UGRHIs (GeoServer do SIBH, DAEE)
 *   public/geo/limite-sp.json  limite do Estado de São Paulo (malhas do IBGE)
 *
 * A tela NUNCA consulta WFS ao vivo: o servidor do órgão pode não ter saída
 * para a internet, e o GeoServer corta a resposta em tamanho variável (medido
 * em 17/09/2026, curl exit 56). Por isso a geometria é baixada aqui, feição a
 * feição e com nova tentativa, simplificada e versionada no repositório.
 *
 * Uso, na raiz do projeto:
 *   node scripts/geo/gerar-geometria-postos.mjs
 *
 * Sem dependência: só `fetch` do Node 18 ou mais novo.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const WFS =
  'https://geodados.daee.sp.gov.br/geoserver/ows?service=WFS&version=1.0.0' +
  '&request=GetFeature&srsName=EPSG:4326&outputFormat=application/json';
const IBGE_SP =
  'https://servicodados.ibge.gov.br/api/v3/malhas/estados/35' +
  '?formato=application/vnd.geo%2Bjson&qualidade=minima';

/** Tolerância do Douglas-Peucker em graus (cerca de 400 m), e casas decimais. */
const TOLERANCIA = 0.004;
const CASAS = 4;
const TENTATIVAS = 40;

/**
 * Nomes oficiais por código. O GeoServer devolve nome com codificação quebrada
 * e dois nomes errados ("Mantiqueira", "Jundaí"); a tela mostra o nome daqui, e
 * o script avisa quando o do servidor diverge, para ninguém corrigir à mão no JSON.
 */
const NOMES_OFICIAIS = {
  1: 'Serra da Mantiqueira',
  2: 'Paraíba do Sul',
  3: 'Litoral Norte',
  4: 'Pardo',
  5: 'Piracicaba/Capivari/Jundiaí',
  6: 'Alto Tietê',
  7: 'Baixada Santista',
  8: 'Sapucaí/Grande',
  9: 'Mogi-Guaçu',
  10: 'Tietê/Sorocaba',
  11: 'Ribeira de Iguape e Litoral Sul',
  12: 'Baixo Pardo/Grande',
  13: 'Tietê/Jacaré',
  14: 'Alto Paranapanema',
  15: 'Turvo/Grande',
  16: 'Tietê/Batalha',
  17: 'Médio Paranapanema',
  18: 'São José dos Dourados',
  19: 'Baixo Tietê',
  20: 'Aguapeí',
  21: 'Peixe',
  22: 'Pontal do Paranapanema',
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixarJson(url) {
  let ultimoErro = null;
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const texto = await resposta.text();
      return { dados: JSON.parse(texto), tentativas: t };
    } catch (erro) {
      ultimoErro = erro;
      await esperar(Math.min(250 * t, 3000));
    }
  }
  throw new Error(`Falhou após ${TENTATIVAS} tentativas: ${url} (${ultimoErro?.message})`);
}

function distanciaAoSegmento([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function douglasPeucker(pontos, tolerancia) {
  if (pontos.length < 3) return pontos;
  const manter = new Array(pontos.length).fill(false);
  manter[0] = true;
  manter[pontos.length - 1] = true;
  const pilha = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [i, j] = pilha.pop();
    let maior = 0;
    let indice = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distanciaAoSegmento(pontos[k], pontos[i], pontos[j]);
      if (d > maior) {
        maior = d;
        indice = k;
      }
    }
    if (maior > tolerancia && indice > 0) {
      manter[indice] = true;
      pilha.push([i, indice], [indice, j]);
    }
  }
  return pontos.filter((_, k) => manter[k]);
}

function simplificar(geometria, tolerancia = TOLERANCIA) {
  const poligonos =
    geometria.type === 'MultiPolygon' ? geometria.coordinates : [geometria.coordinates];
  const fator = 10 ** CASAS;
  const saida = [];
  for (const poligono of poligonos) {
    const aneis = [];
    for (const anel of poligono) {
      const simples = tolerancia > 0 ? douglasPeucker(anel, tolerancia) : anel;
      if (simples.length >= 4) {
        aneis.push(simples.map(([x, y]) => [Math.round(x * fator) / fator, Math.round(y * fator) / fator]));
      }
    }
    if (aneis.length) saida.push(aneis);
  }
  return { type: 'MultiPolygon', coordinates: saida };
}

/** "Alto TietÃª" (UTF-8 lido como Latin-1) volta a "Alto Tietê". */
function consertarCodificacao(texto) {
  if (typeof texto !== 'string' || !/[ÃÂ]/.test(texto)) return texto;
  const conserto = Buffer.from(texto, 'latin1').toString('utf8');
  return conserto.includes(String.fromCharCode(0xfffd)) ? texto : conserto;
}

async function gerarUgrhis() {
  const { dados: lista } = await baixarJson(`${WFS}&typeName=sibh:ugrhis_sp&propertyName=codigo`);
  const feicoes = [];
  for (const f of lista.features) {
    const { dados, tentativas } = await baixarJson(
      `${WFS}&typeName=sibh:ugrhis_sp&featureID=${encodeURIComponent(f.id)}`,
    );
    const g = dados.features[0];
    const codigo = Number(g.properties.codigo);
    const oficial = NOMES_OFICIAIS[codigo];
    if (!oficial) throw new Error(`UGRHI com código inesperado: ${g.properties.codigo}`);
    const doServidor = consertarCodificacao(g.properties.nome)?.replace('/ ', '/');
    if (doServidor !== oficial) {
      console.warn(`UGRHI ${codigo}: servidor diz "${doServidor}", mantido "${oficial}"`);
    }
    feicoes.push({
      type: 'Feature',
      properties: { codigo, nome: oficial },
      geometry: simplificar(g.geometry),
    });
    console.log(`UGRHI ${codigo} baixada em ${tentativas} tentativa(s)`);
  }
  feicoes.sort((a, b) => a.properties.codigo - b.properties.codigo);
  if (feicoes.length !== 22) throw new Error(`Esperadas 22 UGRHIs, vieram ${feicoes.length}`);
  return { type: 'FeatureCollection', features: feicoes };
}

async function gerarLimite() {
  const { dados } = await baixarJson(IBGE_SP);
  const feicao = dados.features?.[0];
  if (!feicao) throw new Error('Malha do IBGE sem feição');
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { codigo: 35, nome: 'São Paulo' },
        // A malha mínima do IBGE já é leve (cerca de 600 vértices); simplificar
        // de novo abriria fresta entre a máscara e a borda das UGRHIs no litoral.
        geometry: simplificar(feicao.geometry, 0),
      },
    ],
  };
}

async function gravar(nome, conteudo) {
  const pasta = path.join(process.cwd(), 'public', 'geo');
  await mkdir(pasta, { recursive: true });
  const destino = path.join(pasta, nome);
  const texto = JSON.stringify(conteudo);
  await writeFile(destino, texto, 'utf8');
  console.log(`${destino}: ${Buffer.byteLength(texto)} bytes`);
}

await gravar('limite-sp.json', await gerarLimite());
await gravar('ugrhis-sp.json', await gerarUgrhis());
