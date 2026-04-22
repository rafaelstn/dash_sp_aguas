import type {
  ParametrosNovaRevisao,
  RevisaoDesconformidade,
} from '@/domain/revisao-desconformidade';

export interface RevisoesRepository {
  marcarRevisado(params: ParametrosNovaRevisao): Promise<RevisaoDesconformidade>;
  reabrir(id: string): Promise<void>;
}
