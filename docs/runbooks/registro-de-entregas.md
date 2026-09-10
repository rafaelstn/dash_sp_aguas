# Registro de entregas em produção

Cada subida de versão no servidor do órgão deixa uma linha aqui, com data, versão,
quem autorizou, o que foi conferido e o que deu errado. Existe por dois motivos.

O primeiro é operacional: quando algo quebrar, a primeira pergunta é "o que mudou
e quando", e ela precisa de resposta escrita, não de memória.

O segundo é de coerência. O item **IN-05** do relatório de pendências pede ao órgão
que defina o canal oficial de transporte de versão, **quem tem acesso a ele e como
se registra cada passagem**, e diz que sem isso "cada publicação vira procedimento
improvisado". Enquanto o canal não estiver definido, ao menos o registro existe do
nosso lado, para não cobrarmos do órgão o que nós mesmos não fazemos.

**O canal continua pendente.** Este arquivo não o substitui: ele registra as
passagens feitas pelo caminho disponível hoje (SSH com VPN, imagem por arquivo).

---

## 10/09/2026 — `sha-5ff93c7`

| Campo | Valor |
|---|---|
| Versão que entrou | `sha-5ff93c7` |
| Versão anterior | `sha-006d33b` |
| Autorizado por | Rafael Damasceno, nesta data |
| Executado por | Matheus (DamaTech), via SSH com VPN |
| Transporte | imagem por arquivo, 236 MiB, `scp` |
| Integridade | `sha256` conferido nas duas pontas: `d60359f259a8145e6f376de2` |

**O que entrou.** As duas correções de código do fluxo de ficha: a aprovação de
triagem deixou de responder `posto_inativo` para posto ativo, e o `aceitar-match`
do inventário ANA deixou de responder 404 para posto existente e de tentar escrever
num cadastro que é somente leitura. Junto, a mensagem de erro na tela deixou de
mostrar o slug `erro_interno`. Antes disso, no mesmo dia, a migration 0069 já havia
removido em produção as nove chaves estrangeiras contra `postos`, restaurando a
gravação de ficha, favorito e foto.

**Incidente durante a subida, e o que se aprende.** A primeira tentativa
(`sha-903ecc4`) derrubou o serviço: o `migrate` abortou ao reaplicar a migration
0045, que recria um índice único de `prefixo` que a 0052 derruba de propósito, e o
banco tem 363 prefixos duplicados legítimos. Como o `app` só sobe depois de o
`migrate` encerrar com sucesso, o site respondeu **502**.

- **Tempo fora do ar:** cerca de três minutos.
- **Restauração:** o app subiu sem a dependência do `migrate`
  (`up -d --no-deps app`), o que era seguro porque o banco já estava com o schema
  completo, inclusive a 0069.
- **Correção definitiva:** commit `5ff93c7`, que guarda a criação do índice por
  catálogo. Provada do zero e na reaplicação com duplicata presente, e validada
  aqui: o `migrate` encerrou com **exit 0** e "[migrate] concluído".
- **Não era defeito desta entrega.** Enquanto estivesse assim, **nenhum** deploy
  subiria pelo caminho normal. O incidente antecipou uma falha que ia acontecer na
  próxima subida, qualquer que fosse.

**Conferido depois de subir** (seção 6.3 do runbook de entrega): `migrate` exit 0;
`app` e `db` healthy; 40 tabelas e PostGIS 3.4.3; o banco não publica porta e o app
publica só em `127.0.0.1`; limites de memória e `read_only` aplicados; e pela borda
`https://dmo.spaguas.sp.gov.br/` respondendo **200** com
`{"status":"ok","db":"ok"}`.

**Rollback disponível:** `sha-006d33b` e outras quatro tags no disco do servidor.
Não foi necessário.
