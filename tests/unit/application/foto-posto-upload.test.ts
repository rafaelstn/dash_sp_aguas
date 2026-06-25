import { describe, it, expect, vi, beforeEach } from 'vitest';

import { registrarFotoCapa } from '@/application/use-cases/foto-posto';
import { DadosInvalidos } from '@/domain/errors';
import type { PostosFotosRepository } from '@/application/ports/postos-fotos-repository';
import type { FotoStorageGateway } from '@/application/ports/foto-storage-gateway';

// O storage agora é injetado (port FotoStorageGateway): usamos um stub para
// isolar a validação de conteúdo do use-case sem tocar no Supabase Storage.
const subir = vi.fn(async (caminho: string) => caminho);
const storageFake: FotoStorageGateway = {
  montarCaminho: () => 'postos/X/2026.jpg',
  subir,
  urlAssinada: vi.fn(async () => 'https://signed.example/x'),
};

const repoFake = {
  registrar: vi.fn(async (entrada) => ({
    id: 'foto-1',
    prefixo: entrada.prefixo,
    storagePath: entrada.storagePath,
    tiradaPor: entrada.tiradaPor,
    tiradaEm: entrada.tiradaEm,
  })),
} as unknown as PostosFotosRepository;

// Assinaturas reais (magic bytes) em base64.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const LIXO = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
const dataUrl = (tipo: string, buf: Buffer) => `data:image/${tipo};base64,${buf.toString('base64')}`;

const entrada = (fotoDataUrl: string) => ({ prefixo: 'X', fotoDataUrl, tiradaPor: 'u1' });

describe('registrarFotoCapa — validação de conteúdo (SEG-2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aceita imagem cujo conteúdo bate com o tipo declarado', async () => {
    await expect(
      registrarFotoCapa(repoFake, storageFake, entrada(dataUrl('png', PNG))),
    ).resolves.toMatchObject({ prefixo: 'X' });
    expect(subir).toHaveBeenCalledOnce();
  });

  it('rejeita arquivo forjado: prefixo png mas conteúdo jpeg', async () => {
    await expect(
      registrarFotoCapa(repoFake, storageFake, entrada(dataUrl('png', JPEG))),
    ).rejects.toBeInstanceOf(DadosInvalidos);
    expect(subir).not.toHaveBeenCalled();
  });

  it('rejeita conteúdo que não é imagem reconhecida', async () => {
    await expect(
      registrarFotoCapa(repoFake, storageFake, entrada(dataUrl('jpeg', LIXO))),
    ).rejects.toBeInstanceOf(DadosInvalidos);
    expect(subir).not.toHaveBeenCalled();
  });
});
