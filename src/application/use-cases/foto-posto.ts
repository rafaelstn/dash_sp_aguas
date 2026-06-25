import type { PostosFotosRepository } from '@/application/ports/postos-fotos-repository';
import type { FotoStorageGateway } from '@/application/ports/foto-storage-gateway';
import type { PostoFoto } from '@/domain/posto-foto';
import { idadeFotoEmDias, precisaAtualizarFotoCapa } from '@/domain/posto-foto';
import { DadosInvalidos } from '@/domain/errors';

const MAX_BYTES_FOTO = 5 * 1024 * 1024;

/** Estado da capa para o app/dashboard decidirem o que exibir. */
export interface CapaPostoView {
  url: string | null;
  tiradaEm: Date | null;
  idadeDias: number | null;
  precisaAtualizar: boolean;
}

/**
 * Decodifica o dataURL JPEG, sobe ao Storage e registra a foto como nova capa
 * do posto. Retorna o registro persistido.
 */
export async function registrarFotoCapa(
  repo: PostosFotosRepository,
  storage: FotoStorageGateway,
  entrada: { prefixo: string; fotoDataUrl: string; tiradaPor: string | null },
): Promise<PostoFoto> {
  const conteudo = decodificarDataUrlJpeg(entrada.fotoDataUrl);
  const tiradaEm = new Date();
  const caminho = storage.montarCaminho(entrada.prefixo, tiradaEm);
  await storage.subir(caminho, conteudo);
  return repo.registrar({
    prefixo: entrada.prefixo,
    storagePath: caminho,
    tiradaPor: entrada.tiradaPor,
    tiradaEm,
  });
}

/** Capa atual do posto pronta para exibição (signed URL + flag de validade). */
export async function obterCapaPosto(
  repo: PostosFotosRepository,
  storage: FotoStorageGateway,
  prefixo: string,
  agora: Date = new Date(),
): Promise<CapaPostoView> {
  const foto = await repo.capaAtual(prefixo);
  const url = foto ? await storage.urlAssinada(foto.storagePath) : null;
  return {
    url,
    tiradaEm: foto?.tiradaEm ?? null,
    idadeDias: idadeFotoEmDias(foto, agora),
    precisaAtualizar: precisaAtualizarFotoCapa(foto, agora),
  };
}

/** Uma foto do histórico pronta para exibição (signed URL + idade em dias). */
export interface FotoHistoricoView {
  id: string;
  url: string | null;
  tiradaEm: Date;
  idadeDias: number | null;
}

/**
 * Histórico de fotos do posto (acompanhamento ao longo dos anos), da mais
 * recente para a mais antiga, cada uma com signed URL. Usado no painel do
 * posto no sistema; o app só consome a vigente via `obterCapaPosto`.
 */
export async function listarFotosPosto(
  repo: PostosFotosRepository,
  storage: FotoStorageGateway,
  prefixo: string,
  agora: Date = new Date(),
): Promise<FotoHistoricoView[]> {
  const fotos = await repo.listarDoPosto(prefixo);
  return Promise.all(
    fotos.map(async (foto) => ({
      id: foto.id,
      url: await storage.urlAssinada(foto.storagePath),
      tiradaEm: foto.tiradaEm,
      idadeDias: idadeFotoEmDias(foto, agora),
    })),
  );
}

function decodificarDataUrlJpeg(dataUrl: string): Buffer {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!match || !match[2]) {
    throw new DadosInvalidos('Foto deve ser um data URL de imagem base64.');
  }
  const conteudo = Buffer.from(match[2], 'base64');
  if (conteudo.length === 0) {
    throw new DadosInvalidos('Foto vazia.');
  }
  if (conteudo.length > MAX_BYTES_FOTO) {
    throw new DadosInvalidos('Foto excede 5 MB.');
  }
  // Defesa de upload: o prefixo do data URL é declarado pelo cliente e pode ser
  // forjado (arquivo malicioso renomeado). Validamos a assinatura real do
  // conteúdo (magic bytes) e exigimos que ela corresponda ao tipo declarado.
  const tipoReal = detectarTipoImagem(conteudo);
  if (!tipoReal) {
    throw new DadosInvalidos('Conteúdo não é uma imagem JPEG, PNG ou WEBP válida.');
  }
  const tipoDeclarado = match[1] === 'jpg' ? 'jpeg' : match[1];
  if (tipoReal !== tipoDeclarado) {
    throw new DadosInvalidos('O tipo declarado não corresponde ao conteúdo da imagem.');
  }
  return conteudo;
}

/**
 * Detecta o tipo da imagem pela assinatura binária (magic bytes), ignorando o
 * que o cliente declarou. Retorna null se não for JPEG, PNG ou WEBP.
 */
function detectarTipoImagem(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // "RIFF"
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // "WEBP"
  ) {
    return 'webp';
  }
  return null;
}
