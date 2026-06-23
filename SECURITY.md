# Política de Segurança

Este projeto integra os sistemas da **SP Águas** e segue a Política de Segurança
da Informação institucional, alinhada à Lei Geral de Proteção de Dados
(LGPD — Lei 13.709/2018), ao Decreto nº 10.046/2019 e à IN SGD/ME nº 1/2019.

## Reporte de vulnerabilidades

Caso identifique uma vulnerabilidade ou falha de segurança, **não abra uma
_issue_ pública** e não divulgue os detalhes em canais abertos.

Envie um e-mail para:

**diego.monteiro@spaguas.sp.gov.br**

Inclua, sempre que possível:

- Descrição da falha e do impacto esperado.
- Passos para reproduzir (provas de conceito mínimas, sem explorar dados reais).
- Versão/_commit_ afetado e ambiente onde foi observada.

A equipe de segurança avaliará e responderá conforme o nível de criticidade.
Pedimos reserva sobre a falha até que uma correção seja disponibilizada
(divulgação coordenada).

## Escopo e boas práticas

- **Dados e sigilo:** é proibido enviar dados pessoais, credenciais, chaves de
  API, _tokens_ de acesso ou informações classificadas em _commits_, mensagens
  ou documentação. Segredos vivem em variáveis de ambiente; arquivos `.env*`
  nunca são versionados (ver `.gitignore`).
- **Controle de acesso:** o acesso aos repositórios é controlado por papéis
  (_roles_) conforme a função institucional. Contribuições externas requerem
  aprovação prévia da Gerência de TI (SA-GTI).
- **Dependências:** dependências vulneráveis devem ser revisadas e atualizadas;
  o projeto declara dependências e licenças em conformidade com software livre
  ou licenças adquiridas institucionalmente.

## Medidas de segurança já adotadas no projeto

- Cabeçalhos de segurança (HSTS, CSP com _nonce_ por requisição, X-Frame-Options,
  COOP/CORP, Permissions-Policy restritiva) — ver `next.config.ts` e
  `src/middleware.ts`.
- RLS como defesa em profundidade no banco (migration `0040`).
- Isolamento de fila offline por usuário e cabeçalhos anti-cache _cross-user_.
- Imagens de container executam como usuário sem privilégio; segredos não são
  embutidos nas imagens (`.dockerignore`).
