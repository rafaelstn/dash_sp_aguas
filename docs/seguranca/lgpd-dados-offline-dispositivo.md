# Nota Técnica — Tratamento de Dados em Armazenamento Local Offline (LGPD)

| Campo | Valor |
|-------|-------|
| Cliente | SPÁguas — Governo do Estado de São Paulo |
| Responsável técnico | André — PO Segurança (Damasceno Dev OS) |
| Módulo | App de campo (PWA `/app/*`) — preenchimento e envio de fichas técnicas |
| Versão | 1.0 |
| Data | 2026-05-22 |
| Regras aplicadas | `governo.md` (LGPD, classificação de dados), `padrao.md` |
| Documentos relacionados | ADR-0007 (PWA Capacitor), `docs/seguranca/checklist-modulo-mobile.md` |

---

## 1. Objetivo

Esta nota documenta o tratamento de dados pessoais que ocorre no armazenamento local do dispositivo do técnico de campo, decorrente da funcionalidade de operação offline das fichas, e registra os controles existentes e as recomendações para adequação à Lei nº 13.709/2018 (LGPD).

## 2. Contexto

O aplicativo de campo opera em regiões com conectividade intermitente. Para que o técnico não perca o trabalho realizado sem rede, dois mecanismos persistem dados no próprio aparelho:

1. **Rascunho da ficha** (`localStorage`): salva automaticamente o preenchimento em edição.
2. **Fila de envio offline** (`IndexedDB`): quando o técnico submete uma ficha sem conexão, o envio fica armazenado e é transmitido automaticamente ao servidor assim que a rede retorna.

Em ambos os casos, o dado permanece no dispositivo apenas até a confirmação do envio ao servidor, quando é descartado.

## 3. Dados pessoais envolvidos e classificação

| Dado | Natureza | Classificação |
|------|----------|---------------|
| Nome do técnico responsável | Pessoal | Restrito |
| Coordenadas de GPS da visita | Pessoal (localização) | Restrito |
| Fotografia da ficha física | Pode conter dado pessoal | Restrito |
| Data, hora e observações da inspeção | Operacional | Restrito |

Não há tratamento de dados pessoais sensíveis (art. 5º, II, da LGPD) nem de dados de cidadão terceiro nesta superfície. Os dados referem-se ao próprio agente público e à atividade de inspeção.

## 4. Base legal e finalidade

O tratamento apoia-se na execução de políticas públicas e no exercício regular de atribuições do órgão (art. 7º, III, e art. 23 da LGPD). A finalidade é exclusivamente o registro técnico da inspeção de campo, sem uso secundário.

## 5. Risco identificado

Os dados acima são gravados **em claro** (sem cifragem em repouso) no armazenamento local do dispositivo, entre o preenchimento e a confirmação do envio. Em caso de perda, furto ou acesso físico não autorizado ao aparelho, há exposição potencial desses dados.

A severidade é **baixa a moderada**: o volume é pequeno, os dados são restritos (não sensíveis), a janela de exposição é curta (até a próxima sincronização) e o acesso depende de posse física do aparelho desbloqueado.

## 6. Controles já implementados

- **Descarte após sincronização:** rascunho e item de fila são removidos do dispositivo assim que o servidor confirma o recebimento da ficha.
- **Isolamento por usuário:** a fila de envio só sincroniza e exibe as fichas do técnico autenticado. Em dispositivo compartilhado, a ficha de um técnico não é transmitida sob a sessão de outro, evitando atribuição cruzada de autoria (controle coberto por teste automatizado).
- **Idempotência:** o reenvio automático reaproveita a chave de idempotência, de modo que a retransmissão não duplica registros no servidor.
- **Escopo do Service Worker:** o cache do app não armazena respostas de autenticação nem de operações de triagem (estratégia `NetworkOnly` para essas rotas).
- **Transporte:** toda sincronização ocorre sobre HTTPS.

## 7. Recomendações

| # | Recomendação | Prioridade | Status |
|---|--------------|------------|--------|
| 1 | Exigir bloqueio de tela e cifragem de disco do dispositivo via política de MDM do órgão (controle organizacional, complementa o controle técnico) | Alta | A cargo do órgão |
| 2 | Avaliar cifragem em repouso do rascunho e da fila no dispositivo (Web Crypto API com chave derivada da sessão) | Média | Backlog |
| 3 | Definir expurgo automático de itens de fila com falha permanente após limite de tentativas, evitando retenção indefinida | Baixa | Backlog |

A recomendação nº 1 é organizacional e independe de software. As recomendações nº 2 e nº 3 são melhorias técnicas a serem priorizadas conforme exigência do órgão; não são bloqueantes para a operação, dado o perfil de risco descrito na seção 5.

## 8. Conclusão

A funcionalidade de operação offline está adequada para uso, com os controles técnicos da seção 6 em vigor. O armazenamento local em claro constitui risco residual baixo a moderado, mitigável pela política de dispositivos do órgão (recomendação nº 1) e, opcionalmente, pela cifragem em repouso (recomendação nº 2), que se registra como evolução planejada.
