import type { AcessoFicha } from '@/domain/acesso-ficha';

export interface AuditoriaRepository {
  registrarAcesso(evento: AcessoFicha): Promise<void>;
}
