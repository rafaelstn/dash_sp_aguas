import Link from 'next/link';
import { EstadoVazio } from '@/components/ui/EstadoVazio';

export default function NotFound() {
  return (
    <EstadoVazio
      titulo="Posto não encontrado"
      descricao="O prefixo informado não existe na base de postos. Verifique o termo e tente novamente."
      acao={
        <Link href="/" className="text-gov-azul hover:underline font-medium">
          Voltar à busca
        </Link>
      }
    />
  );
}
