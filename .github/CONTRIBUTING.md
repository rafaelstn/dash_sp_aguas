# Guia de Contribuição

Obrigado por contribuir com os sistemas da **SP Águas**. Este guia resume as
diretrizes de desenvolvimento e o fluxo esperado de contribuições.

## Antes de começar

- Leia o [Código de Conduta](CODE_OF_CONDUCT.md) e a
  [Política de Segurança](SECURITY.md).
- Contribuições externas requerem **aprovação prévia da Gerência de TI (SA-GTI)**.
  O acesso aos repositórios é controlado por papéis (_roles_) conforme a função
  institucional.

## Diretrizes técnicas

- Preferir tecnologias _open-source_ e padrões abertos (OGC, REST, JSON,
  GeoJSON, CSV).
- Manter compatibilidade com o ecossistema interno (PostgreSQL/PostGIS,
  Elasticsearch, Docker, Grafana).
- Adotar **versionamento semântico** (SemVer).
- Garantir **testes automatizados** e **documentação de endpoints**.
- Acessibilidade obrigatória (WCAG 2.1 AA / e-MAG) em toda interface — é lei.
- LGPD: não trafegar dados pessoais em logs, _commits_ ou fixtures.

## Fluxo de _issues_ e _pull requests_

1. Abra uma _issue_ clara descrevendo o problema ou a proposta.
2. Em cada _pull request_, descreva:
   - o **motivo** da alteração;
   - o **impacto esperado**;
   - a **relação com a demanda institucional**.
3. Garanta que a CI passa (lint, _typecheck_, testes) antes de pedir revisão.
4. Mantenha _commits_ atômicos e mensagens descritivas; preserve a autoria e a
   rastreabilidade das contribuições.

## Segredos e dados

- **Nunca** versione credenciais, chaves de API, _tokens_ ou dados pessoais.
- Use variáveis de ambiente; arquivos `.env*` são ignorados pelo Git
  (ver `.gitignore`). Templates: `.env.example` e `.env.docker.example`.

## Ambiente local

- Desenvolvimento web: ver [README.md](README.md).
- Stack conteinerizada (alvo PRODESP): `docker compose up -d` após copiar
  `.env.docker.example` para `.env.docker`. Detalhes no README e no
  `docs/adr/0015-conteinerizacao-prodesp.md`.

## Licença

Ao contribuir, você concorda que sua contribuição será licenciada sob a
[Licença Apache 2.0](LICENSE), salvo indicação em contrário.
