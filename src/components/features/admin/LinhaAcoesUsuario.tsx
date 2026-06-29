'use client';

import { useId, useRef, useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { InputSenha } from '@/components/ui/InputSenha';
import { Button } from '@/components/ui/Button';
import { type Papel } from '@/domain/auth/papel';
import { validarSenha } from '@/domain/auth/politica-senha';
import {
  alterarPapel,
  type UsuarioGerenciadoDTO,
  ErroApi,
  resetarSenha,
} from './api-usuarios';
import { capacidadesDaLinha, papeisDestinoParaLinha } from './regras-ui';
import { SeletorPapel } from './FormNovoUsuario';

export interface LinhaAcoesUsuarioProps {
  usuario: UsuarioGerenciadoDTO;
  papelAtor: Papel;
  meuId: string;
  /** Pede a exclusão (a tela abre o ConfirmDialog e executa o DELETE). */
  aoPedirExclusao: (usuario: UsuarioGerenciadoDTO) => void;
  /** Recarrega a lista após sucesso (papel/senha). */
  aoConcluir: (mensagem: string) => void;
  /** Comunica erro para a região live + alerta da tela. */
  aoFalhar: (mensagem: string) => void;
}

/**
 * Bloco de ações por usuário: trocar papel (select inline), resetar senha
 * (abre um campo) e excluir. Cada controle só aparece quando o ator pode
 * executá-lo (regras espelhadas de `gestao-acesso.ts`); o backend reforça
 * tudo e o erro 403/409 cai no callback `aoFalhar`.
 */
export function LinhaAcoesUsuario({
  usuario,
  papelAtor,
  meuId,
  aoPedirExclusao,
  aoConcluir,
  aoFalhar,
}: LinhaAcoesUsuarioProps) {
  const cap = capacidadesDaLinha(papelAtor, meuId, usuario);
  const destinos = papeisDestinoParaLinha(papelAtor, meuId, usuario);
  const seletorId = useId();

  const [salvandoPapel, setSalvandoPapel] = useState(false);
  const [resetAberto, setResetAberto] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [erroSenha, setErroSenha] = useState<string | undefined>();
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const senhaRef = useRef<HTMLInputElement>(null);

  async function trocarPapel(novo: Papel) {
    if (novo === usuario.papel || salvandoPapel) return;
    setSalvandoPapel(true);
    try {
      await alterarPapel(usuario.id, novo);
      aoConcluir(`Papel de ${rotuloUsuario(usuario)} atualizado.`);
    } catch (e) {
      aoFalhar(mensagemErro(e, 'Não foi possível alterar o papel.'));
      setSalvandoPapel(false);
    }
  }

  function abrirReset() {
    setResetAberto(true);
    setNovaSenha('');
    setErroSenha(undefined);
    requestAnimationFrame(() => senhaRef.current?.focus());
  }

  function fecharReset() {
    if (salvandoSenha) return;
    setResetAberto(false);
    setNovaSenha('');
    setErroSenha(undefined);
  }

  async function enviarReset() {
    if (salvandoSenha) return;
    const erro = validarSenha(novaSenha);
    if (erro) {
      setErroSenha(erro);
      return;
    }
    setSalvandoSenha(true);
    try {
      await resetarSenha(usuario.id, novaSenha);
      setSalvandoSenha(false);
      setResetAberto(false);
      setNovaSenha('');
      aoConcluir(`Senha de ${rotuloUsuario(usuario)} redefinida.`);
    } catch (e) {
      aoFalhar(mensagemErro(e, 'Não foi possível redefinir a senha.'));
      setSalvandoSenha(false);
    }
  }

  const podeMexer = cap.podeAlterarPapel || cap.podeResetarSenha || cap.podeExcluir;
  if (!podeMexer) {
    return (
      <span className="text-xs text-app-fg-subtle">Sem ações disponíveis</span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {cap.podeAlterarPapel ? (
          <div className="min-w-[9rem]">
            <label htmlFor={seletorId} className="sr-only">
              Papel de {rotuloUsuario(usuario)}
            </label>
            <SeletorPapel
              id={seletorId}
              rotulo=""
              valor={usuario.papel}
              opcoes={destinos}
              disabled={salvandoPapel}
              onChange={(p) => void trocarPapel(p)}
              className="py-1.5 text-sm"
            />
          </div>
        ) : null}

        {cap.podeResetarSenha ? (
          <Button
            type="button"
            variante="secundario"
            onClick={resetAberto ? fecharReset : abrirReset}
            disabled={salvandoSenha}
            aria-expanded={resetAberto}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {resetAberto ? 'Cancelar' : 'Redefinir senha'}
          </Button>
        ) : null}

        {cap.podeExcluir ? (
          <Button
            type="button"
            variante="perigo"
            onClick={() => aoPedirExclusao(usuario)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Excluir
          </Button>
        ) : null}
      </div>

      {resetAberto ? (
        <div className="rounded border border-app-border-subtle bg-app-surface-2 p-3">
          <InputSenha
            ref={senhaRef}
            rotulo={`Nova senha para ${rotuloUsuario(usuario)}`}
            name="nova-senha"
            autoComplete="new-password"
            descricao="Mínimo de 12 caracteres, combinando letras, números e ao menos um caractere especial."
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            erro={erroSenha}
            disabled={salvandoSenha}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variante="secundario"
              onClick={fecharReset}
              disabled={salvandoSenha}
              className="px-3 py-1.5 text-sm"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void enviarReset()}
              disabled={salvandoSenha}
              className="px-3 py-1.5 text-sm"
            >
              {salvandoSenha ? 'Salvando…' : 'Salvar senha'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function rotuloUsuario(u: UsuarioGerenciadoDTO): string {
  return u.nome ?? u.email;
}

function mensagemErro(e: unknown, fallback: string): string {
  return e instanceof ErroApi ? e.message : fallback;
}
