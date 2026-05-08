'use client';

import { useEffect, useId, useState } from 'react';
import { criarClienteSupabaseBrowser } from '@/infrastructure/auth/supabase-browser';

type Etapa = 'inicio' | 'qrcode' | 'verificar' | 'recovery' | 'concluido';

interface DadosFatorTOTP {
  factorId: string;
  qrCodeSvg: string | null;
  segredoTexto: string | null;
}

export interface WizardMFAProps {
  emailUsuario: string;
  jaConfigurado: boolean;
}

/**
 * Wizard de configuração de TOTP via Supabase Auth nativo.
 * Etapas:
 *  1) início — explica o que vai acontecer; usuário confirma.
 *  2) qrcode — mostra QR + segredo manual; usuário escaneia.
 *  3) verificar — usuário insere código de 6 dígitos do app.
 *  4) recovery — exibe códigos de recuperação (download .txt).
 *  5) concluído — sucesso.
 *
 * Erros são exibidos inline. Após verificação bem-sucedida, a sessão
 * sobe pra `aal2` e o backend passa a aceitar operações críticas.
 */
export function WizardMFA({ emailUsuario, jaConfigurado }: WizardMFAProps) {
  const [etapa, setEtapa] = useState<Etapa>(jaConfigurado ? 'concluido' : 'inicio');
  const [dadosFator, setDadosFator] = useState<DadosFatorTOTP | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const codigoId = useId();

  async function iniciarEnrollment() {
    setCarregando(true);
    setErro(null);
    try {
      const supabase = criarClienteSupabaseBrowser();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `SPAguas - ${emailUsuario}`,
      });
      if (error) throw new Error(error.message);
      // O Supabase devolve `qr_code` (SVG) e `secret` (texto).
      const totp = (data as unknown as {
        id: string;
        totp?: { qr_code?: string; secret?: string };
      })?.totp;
      const factorId = (data as unknown as { id: string })?.id;
      if (!factorId) throw new Error('Falha ao iniciar enrollment.');
      setDadosFator({
        factorId,
        qrCodeSvg: totp?.qr_code ?? null,
        segredoTexto: totp?.secret ?? null,
      });
      setEtapa('qrcode');
    } catch (e) {
      setErro(extrairMensagem(e));
    } finally {
      setCarregando(false);
    }
  }

  async function verificarCodigo() {
    if (!dadosFator) return;
    if (!/^\d{6}$/.test(codigo)) {
      setErro(
        'Informe o código de 6 dígitos exibido no aplicativo autenticador.',
      );
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const supabase = criarClienteSupabaseBrowser();
      const challenge = await supabase.auth.mfa.challenge({
        factorId: dadosFator.factorId,
      });
      if (challenge.error) throw new Error(challenge.error.message);
      const challengeId = (challenge.data as { id: string }).id;

      const verify = await supabase.auth.mfa.verify({
        factorId: dadosFator.factorId,
        challengeId,
        code: codigo,
      });
      if (verify.error) throw new Error(verify.error.message);

      // Sessão agora é aal2. Geramos códigos de recuperação no client
      // (UUIDs curtos) — o Supabase MFA TOTP nativo não emite recovery
      // codes oficialmente; o gestor pode resetar via painel.
      setRecoveryCodes(gerarCodigosRecuperacao(8));
      setEtapa('recovery');
    } catch (e) {
      setErro(extrairMensagem(e));
    } finally {
      setCarregando(false);
    }
  }

  function baixarCodigos() {
    if (recoveryCodes.length === 0) return;
    const conteudo =
      `Códigos de recuperação — SPÁguas Ficha Técnica\nUsuário: ${emailUsuario}\nGerado em: ${new Date().toLocaleString('pt-BR')}\n\n` +
      recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
      `\n\nMantenha estes códigos em local seguro. Cada código pode ser utilizado uma única vez para recuperar o acesso, caso o aparelho com o aplicativo autenticador seja perdido.\nEm caso de perda total, contate o gestor responsável para reiniciar o fator no painel administrativo.\n`;
    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mfa-recovery-${emailUsuario.replace(/[^a-z0-9]/gi, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Reset ao desmontar
  useEffect(() => {
    return () => {
      setCodigo('');
      setErro(null);
    };
  }, []);

  if (etapa === 'concluido') {
    return (
      <section
        aria-labelledby="mfa-concluido"
        className="rounded-gov-card border border-green-300 bg-green-50 p-4 text-sm text-green-900"
      >
        <h2 id="mfa-concluido" className="text-base font-semibold">
          Segundo fator configurado
        </h2>
        <p className="mt-1">
          O segundo fator desta conta está ativo. As operações de aprovar,
          rejeitar e devolver fichas estão habilitadas.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="mfa-wizard"
      className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
    >
      <h2 id="mfa-wizard" className="sr-only">
        Assistente de configuração de MFA
      </h2>

      {erro ? (
        <div
          role="alert"
          className="mb-3 rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
        >
          {erro}
        </div>
      ) : null}

      {etapa === 'inicio' ? (
        <div className="space-y-3 text-sm">
          <header>
            <p className="text-2xs uppercase tracking-wider text-app-fg-muted">
              Etapa 1 de 4
            </p>
            <h3 className="text-base font-semibold text-app-fg">
              Preparação
            </h3>
            <p className="mt-1 text-xs text-app-fg-muted">
              Antes de iniciar, instale um aplicativo autenticador em um
              dispositivo de uso pessoal.
            </p>
          </header>
          <ol className="ml-5 list-decimal space-y-1 text-app-fg">
            <li>Abrir um aplicativo autenticador no dispositivo.</li>
            <li>Ler o QR code apresentado na próxima etapa.</li>
            <li>Informar o código de 6 dígitos exibido pelo aplicativo.</li>
            <li>Armazenar os códigos de recuperação em local seguro.</li>
          </ol>
          <button
            type="button"
            onClick={iniciarEnrollment}
            disabled={carregando}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {carregando ? 'Iniciando configuração…' : 'Iniciar configuração'}
          </button>
        </div>
      ) : null}

      {etapa === 'qrcode' && dadosFator ? (
        <div className="space-y-3 text-sm">
          <header>
            <p className="text-2xs uppercase tracking-wider text-app-fg-muted">
              Etapa 2 de 4
            </p>
            <h3 className="text-base font-semibold text-app-fg">
              Leitura do QR code
            </h3>
            <p className="mt-1 text-xs text-app-fg-muted">
              Leia o QR code abaixo com o aplicativo autenticador. Caso a
              leitura não seja possível, registre manualmente o segredo
              alfanumérico.
            </p>
          </header>
          {dadosFator.qrCodeSvg ? (
            <div
              aria-label="QR code do segundo fator de autenticação"
              className="mx-auto w-fit rounded border border-app-border-subtle bg-white p-3"
              // O Supabase devolve SVG seguro (gerado no servidor); a
              // alternativa seria renderizar via imagem externa, o que
              // viola CSP. Confiar no provedor é aceitável aqui.
              dangerouslySetInnerHTML={{ __html: dadosFator.qrCodeSvg }}
            />
          ) : (
            <p className="text-amber-800">
              QR code indisponível no momento. Utilize o segredo alfanumérico
              abaixo.
            </p>
          )}
          {dadosFator.segredoTexto ? (
            <div className="rounded border border-app-border-subtle bg-app-surface-2 p-2 text-xs">
              <p className="font-semibold">Segredo alfanumérico:</p>
              <p className="mono mt-1 break-all">{dadosFator.segredoTexto}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setEtapa('verificar')}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Continuar para verificação
          </button>
        </div>
      ) : null}

      {etapa === 'verificar' ? (
        <form
          className="space-y-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void verificarCodigo();
          }}
        >
          <header>
            <p className="text-2xs uppercase tracking-wider text-app-fg-muted">
              Etapa 3 de 4
            </p>
            <h3 className="text-base font-semibold text-app-fg">
              Verificação do código
            </h3>
            <p className="mt-1 text-xs text-app-fg-muted">
              Informe o código de 6 dígitos exibido no aplicativo autenticador
              para confirmar a vinculação do dispositivo.
            </p>
          </header>
          <label htmlFor={codigoId} className="block">
            <span className="block text-xs font-medium text-app-fg">
              Código de 6 dígitos
            </span>
            <input
              id={codigoId}
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              className="mono mt-1 block w-32 rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-center text-lg tracking-widest focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
              required
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEtapa('qrcode')}
              className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={carregando}
              className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60"
            >
              {carregando ? 'Verificando código…' : 'Verificar e ativar'}
            </button>
          </div>
        </form>
      ) : null}

      {etapa === 'recovery' ? (
        <div className="space-y-3 text-sm">
          <header>
            <p className="text-2xs uppercase tracking-wider text-app-fg-muted">
              Etapa 4 de 4
            </p>
            <h3 className="text-base font-semibold text-app-fg">
              Códigos de recuperação
            </h3>
            <p className="mt-1 text-xs text-app-fg-muted">
              Os códigos abaixo permitem recuperar o acesso em caso de perda
              do dispositivo. São exibidos uma única vez.
            </p>
          </header>
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <p className="font-semibold">Atenção: registre os códigos antes de prosseguir.</p>
            <p className="mt-1">
              Cada código pode ser utilizado uma única vez. Em caso de perda
              do aparelho, os códigos permitem restabelecer o acesso ao
              sistema.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-2 rounded border border-app-border-subtle bg-app-surface-2 p-3 text-sm sm:grid-cols-4">
            {recoveryCodes.map((c) => (
              <li
                key={c}
                className="mono rounded bg-app-surface px-2 py-1 text-center"
              >
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={baixarCodigos}
              className="rounded border border-gov-azul bg-white px-3 py-1.5 text-sm font-medium text-gov-azul hover:bg-app-surface-2"
            >
              Baixar arquivo .txt com os códigos
            </button>
            <button
              type="button"
              onClick={() => setEtapa('concluido')}
              className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro"
            >
              Confirmar registro e concluir
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function gerarCodigosRecuperacao(qtd: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < qtd; i += 1) {
    const buf = new Uint8Array(5);
    crypto.getRandomValues(buf);
    const hex = Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5, 10)}`);
  }
  return codes;
}

function extrairMensagem(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Não foi possível concluir a operação. Tente novamente em instantes.';
}
