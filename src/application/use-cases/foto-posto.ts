import type { PostosFotosRepository } from '@/application/ports/postos-fotos-repository';
import type { PostoFoto } from '@/domain/posto-foto';
import { idadeFotoEmDias, precisaAtualizarFotoCapa } from '@/domain/posto-foto';
import {
  montarCaminhoFoto,
  subirFotoPosto,
  urlAssinadaFotoPosto,
} from '@/infrastructure/storage/foto-posto-storage';
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
  entrada: { prefixo: string; fotoDataUrl: string; tiradaPor: string | null },
): Promise<PostoFoto> {
  const conteudo = decodificarDataUrlJpeg(entrada.fotoDataUrl);
  const tiradaEm = new Date();
  const caminho = montarCaminhoFoto(entrada.prefixo, tiradaEm);
  await subirFotoPosto(caminho, conteudo);
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
  prefixo: string,
  agora: Date = new Date(),
): Promise<CapaPostoView> {
  const foto = await repo.capaAtual(prefixo);
  const url = foto ? await urlAssinadaFotoPosto(foto.storagePath) : null;
  return {
    url,
    tiradaEm: foto?.tiradaEm ?? null,
    idadeDias: idadeFotoEmDias(foto, agora),
    precisaAtualizar: precisaAtualizarFotoCapa(foto, agora),
  };
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
  return conteudo;
}
