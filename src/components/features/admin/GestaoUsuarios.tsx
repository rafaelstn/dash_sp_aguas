'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alerta } from '@/components/ui/Alerta';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { Skeleton, SkeletonGrupo } from '@/components/ui/Skeleton';
import { LiveRegion } from '@/components/a11y/LiveRegion';
import { type Papel, ROTULO_PAPEL } from '@/domain/auth/papel';
import {
  excluirUsuario,
  ErroApi,
  listarUsuarios,
  type UsuarioGerenciadoDTO,
} from './api-usuarios';
import { podeCriarUsuario } from './regras-ui';
import { LinhaAcoesUsuario } from './LinhaAcoesUsuario';
import { FormNovoUsuario } from './FormNovoUsuario';

export interface GestaoUsuariosProps {
  /** Papel do ator (resolvido no servidor). Decide o que a UI oferece. */
  papelAtor: Papel;
  /** Id do ator (não pode alterar o próprio papel nem se excluir). */
  meuId: string;
}

type EstadoLista =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; usuarios: UsuarioGerenciadoDTO[] };

/**
 * Gestão de usuários (RBAC). Lista os usuários e oferece criar, alterar papel,
 * redefinir senha e excluir conforme o papel do ator. Cada ação revalida pela
 * lista (refetch) e dá feedback visível (Alerta + LiveRegion). As regras de UI
 * espelham `domain/auth/gestao-acesso.ts`; o backend reforça e os erros 403/409
 * caem no alerta de erro com mensagem amigável.
 *
 * A11y (e-MAG / WCAG 2.1 AA): heading hierárquico, tabela com legenda, foco
 * visível, diálogos com aria, estados anunciados via região live.
 */
export function GestaoUsuarios({ papelAtor, meuId }: GestaoUsuariosProps) {
  const [estado, setEstado] = useState<EstadoLista>({ fase: 'carregando' });
  const [formAberto, setFormAberto] = useState(false);
  const [alvoExclusao, setAlvoExclusao] = useState<UsuarioGerenciadoDTO | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);
  const [anuncio, setAnuncio] = useState('');

  const carregar = useCallback(async () => {
    setEstado({ fase: 'carregando' });
    try {
      const usuarios = await listarUsuarios();
      setEstado({ fase: 'ok', usuarios });
    } catch (e) {
      setEstado({
        fase: 'erro',
        mensagem:
          e instanceof ErroApi
            ? e.message
            : 'Não foi possível carregar os usuários. Tente novamente.',
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aoConcluir = useCallback(
    (mensagem: string) => {
      setFeedback({ tipo: 'sucesso', texto: mensagem });
      setAnuncio(mensagem);
      void carregar();
    },
    [carregar],
  );

  const aoFalhar = useCallback((mensagem: string) => {
    setFeedback({ tipo: 'erro', texto: mensagem });
    setAnuncio(mensagem);
  }, []);

  async function confirmarExclusao() {
    if (!alvoExclusao) return;
    const rotulo = alvoExclusao.nome ?? alvoExclusao.email;
    try {
      await excluirUsuario(alvoExclusao.id);
      setAlvoExclusao(null);
      aoConcluir(`Usuário ${rotulo} removido.`);
    } catch (e) {
      // Mantém o diálogo aberto e mostra o erro nele (o ConfirmDialog exibe a
      // mensagem da exceção lançada por `aoConfirmar`).
      throw new Error(
        e instanceof ErroApi
          ? e.message
          : 'Não foi possível remover o usuário. Tente novamente em instantes.',
      );
    }
  }

  const podeCriar = podeCriarUsuario(papelAtor);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-app-fg">Usuários</h1>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            Gestão de acesso ao sistema: papéis, criação de contas e redefinição
            de senha
          </p>
        </div>
        {podeCriar ? (
          <Button
            type="button"
            onClick={() => setFormAberto(true)}
            className="inline-flex items-center justify-center gap-2"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Adicionar usuário
          </Button>
        ) : null}
      </header>

      {feedback ? (
        <Alerta
          tipo={feedback.tipo === 'sucesso' ? 'sucesso' : 'erro'}
          titulo={feedback.tipo === 'sucesso' ? 'Tudo certo' : 'Não foi possível concluir'}
        >
          {feedback.texto}
        </Alerta>
      ) : null}

      {estado.fase === 'carregando' ? (
        <CarregandoLista />
      ) : estado.fase === 'erro' ? (
        <div className="space-y-3">
          <Alerta tipo="erro" titulo="Erro ao carregar">
            {estado.mensagem}
          </Alerta>
          <Button type="button" variante="secundario" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </div>
      ) : estado.usuarios.length === 0 ? (
        <EstadoVazio
          icone={Users}
          titulo="Nenhum usuário cadastrado"
          descricao={
            podeCriar
              ? 'Adicione o primeiro usuário para conceder acesso ao sistema.'
              : 'Ainda não há usuários para exibir.'
          }
          acao={
            podeCriar ? (
              <Button type="button" onClick={() => setFormAberto(true)}>
                Adicionar usuário
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ListaUsuarios
          usuarios={estado.usuarios}
          papelAtor={papelAtor}
          meuId={meuId}
          aoPedirExclusao={setAlvoExclusao}
          aoConcluir={aoConcluir}
          aoFalhar={aoFalhar}
        />
      )}

      <FormNovoUsuario
        aberto={formAberto}
        papelAtor={papelAtor}
        aoCancelar={() => setFormAberto(false)}
        aoCriar={(nome) => {
          setFormAberto(false);
          aoConcluir(`Usuário ${nome} criado.`);
        }}
      />

      <ConfirmDialog
        aberto={alvoExclusao !== null}
        titulo="Remover usuário"
        variante="perigo"
        rotuloConfirmar="Remover"
        descricao={
          alvoExclusao ? (
            <span>
              Esta ação remove o acesso de{' '}
              <strong>{alvoExclusao.nome ?? alvoExclusao.email}</strong>{' '}
              ({alvoExclusao.email}) ao sistema. Não é possível desfazer.
            </span>
          ) : (
            ''
          )
        }
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => setAlvoExclusao(null)}
      />

      <LiveRegion mensagem={anuncio} />
    </div>
  );
}

/** Tabela em telas médias+, cartões empilhados no mobile. */
function ListaUsuarios({
  usuarios,
  papelAtor,
  meuId,
  aoPedirExclusao,
  aoConcluir,
  aoFalhar,
}: {
  usuarios: readonly UsuarioGerenciadoDTO[];
  papelAtor: Papel;
  meuId: string;
  aoPedirExclusao: (u: UsuarioGerenciadoDTO) => void;
  aoConcluir: (m: string) => void;
  aoFalhar: (m: string) => void;
}) {
  return (
    <>
      {/* Desktop / tablet: tabela com scroll horizontal de segurança */}
      <div className="hidden overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Lista de usuários do sistema com papel e ações de gestão
          </caption>
          <thead>
            <tr className="bg-app-surface-2">
              <Th>Nome</Th>
              <Th>E-mail</Th>
              <Th>Papel</Th>
              <Th>Criado em</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr
                key={u.id}
                className="border-b border-app-border-subtle last:border-0 align-top"
              >
                <td className="px-3 py-3 text-app-fg">
                  {u.nome ?? <span className="text-app-fg-subtle">Não informado</span>}
                  {u.id === meuId ? <MarcaVoce /> : null}
                </td>
                <td className="px-3 py-3 break-all text-app-fg">{u.email}</td>
                <td className="px-3 py-3">
                  <BadgePapel papel={u.papel} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-app-fg-muted">
                  {formatarData(u.criadoEm)}
                </td>
                <td className="px-3 py-3">
                  <LinhaAcoesUsuario
                    usuario={u}
                    papelAtor={papelAtor}
                    meuId={meuId}
                    aoPedirExclusao={aoPedirExclusao}
                    aoConcluir={aoConcluir}
                    aoFalhar={aoFalhar}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cartões */}
      <ul className="space-y-3 md:hidden">
        {usuarios.map((u) => (
          <li
            key={u.id}
            className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-app-fg">
                  {u.nome ?? (
                    <span className="text-app-fg-subtle">Não informado</span>
                  )}
                  {u.id === meuId ? <MarcaVoce /> : null}
                </p>
                <p className="break-all text-sm text-app-fg-muted">{u.email}</p>
              </div>
              <BadgePapel papel={u.papel} />
            </div>
            <p className="mt-2 text-xs text-app-fg-muted">
              Criado em {formatarData(u.criadoEm)}
            </p>
            <div className="mt-3 border-t border-app-border-subtle pt-3">
              <LinhaAcoesUsuario
                usuario={u}
                papelAtor={papelAtor}
                meuId={meuId}
                aoPedirExclusao={aoPedirExclusao}
                aoConcluir={aoConcluir}
                aoFalhar={aoFalhar}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-app-border-subtle px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
    >
      {children}
    </th>
  );
}

function BadgePapel({ papel }: { papel: Papel }) {
  const estilo: Record<Papel, string> = {
    super_admin: 'bg-blue-50 text-gov-azul border-blue-200',
    admin: 'bg-amber-50 text-amber-900 border-amber-200',
    user: 'bg-app-surface-2 text-app-fg-muted border-app-border-subtle',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${estilo[papel]}`}
    >
      {ROTULO_PAPEL[papel]}
    </span>
  );
}

function MarcaVoce() {
  return (
    <span className="ml-2 align-middle text-2xs font-medium uppercase tracking-wide text-app-fg-subtle">
      (você)
    </span>
  );
}

function CarregandoLista() {
  return (
    <SkeletonGrupo rotulo="Carregando usuários…" className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="w-1/2 space-y-2">
              <Skeleton variante="texto" className="h-4 w-2/3" />
              <Skeleton variante="texto" className="h-3 w-full" />
            </div>
            <Skeleton variante="bloco" className="h-6 w-20" />
          </div>
        </div>
      ))}
    </SkeletonGrupo>
  );
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
