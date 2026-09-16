import { Abas } from '@/components/features/desconformidades/Abas';
import {
  ID_NOTA_REVISAO_INDISPONIVEL,
  RevisaoDisponibilidade,
} from '@/components/features/desconformidades/RevisaoDisponibilidade';
import { MENSAGEM_REVISAO_INDISPONIVEL } from '@/components/features/desconformidades/revisao-envio';
import { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { desconformidadesRepository } from '@/infrastructure/repositories';
import { contarDesconformidades } from '@/application/use-cases/listar-desconformidades';

export const dynamic = 'force-dynamic';

export default async function LayoutDesconformidades({
  children,
}: {
  children: React.ReactNode;
}) {
  const [contagens, usuario] = await Promise.all([
    contarDesconformidades(desconformidadesRepository),
    obterUsuarioAtual(),
  ]);
  // Mesma regra do servidor (exigirIdentidadeVerificada): o usuário institucional
  // da janela não revisa. O 403 continua tratado no botão se as duas divergirem.
  const revisaoDisponivel = usuario?.id !== USUARIO_SEM_IDENTIDADE.id;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-gov-texto">
          Desconformidades cadastrais
        </h2>
        <p className="mt-2 text-sm text-gov-muted max-w-3xl">
          Identificamos registros e arquivos cujo formato diverge do padrão oficial
          fornecido pelo cliente em 22 de abril de 2026. O sistema apresenta
          sugestões de correção para orientar a curadoria manual da planilha-fonte.
          Nenhuma alteração cadastral é aplicada automaticamente.
        </p>
      </header>

      <Abas contagens={contagens} />

      <div className="mt-4 space-y-4">
        {revisaoDisponivel ? null : (
          <p id={ID_NOTA_REVISAO_INDISPONIVEL} className="text-sm text-gov-muted">
            {MENSAGEM_REVISAO_INDISPONIVEL}
          </p>
        )}
        <RevisaoDisponibilidade disponivel={revisaoDisponivel}>{children}</RevisaoDisponibilidade>
      </div>
    </div>
  );
}
