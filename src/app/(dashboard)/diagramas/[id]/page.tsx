import Link from 'next/link';
import { PencilRuler } from 'lucide-react';
import { EstadoVazio } from '@/components/ui/EstadoVazio';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Placeholder da rota do editor de diagramas. O editor visual (React Flow no
 * padrao SIBH) chega nas fases A2 a A5 do plano de integracao. Este placeholder
 * existe para a acao "abrir" da lista nao cair em 404 enquanto o editor nao fica
 * pronto.
 */
export default async function EditorDiagramaPage({ params }: PageProps) {
  await params;
  return (
    <div className="p-6">
      <EstadoVazio
        icone={PencilRuler}
        titulo="Editor de diagrama em construção"
        descricao="O editor visual no padrão SIBH (reservatórios, postos de nível, postos de chuva e rios, com limiares de alerta e exportação) chega na próxima atualização deste módulo."
        acao={
          <Link
            href="/diagramas"
            className="inline-flex items-center rounded-md bg-gov-azul px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Voltar para a lista
          </Link>
        }
      />
    </div>
  );
}
