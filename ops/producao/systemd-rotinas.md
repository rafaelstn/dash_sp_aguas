# Rotinas periódicas no host (systemd)

Destino: `/etc/systemd/system/`. O chamador é `ops/producao/spaguas-cron.sh`,
instalado em `/usr/local/bin/spaguas-cron.sh` com `0750 root:root`.

**Por que no host, e não num agendador externo:** o servidor do órgão não tem
saída para a internet, então não há serviço de fora que alcance as rotas. Antes
disto, ninguém as chamava, e a anonimização da trilha (prazo de retenção da
LGPD) não acontecia, em silêncio, enquanto a documentação afirmava que
acontecia. Runbook, seção 9.4.

**Por que `systemd` e não `cron`:** o `journalctl` guarda a saída de cada
execução, `systemctl --failed` mostra rotina que passou a falhar, e
`OnBootSec` evita a rajada de execuções quando a máquina reinicia. Com `cron`,
uma rotina que começasse a responder 500 falharia todo dia sem ninguém ver.

---

## 1. `spaguas-anonimizar-trilha`

Cumpre o prazo de retenção da trilha de auditoria (LGPD). Diária, de madrugada.

```ini
# /etc/systemd/system/spaguas-anonimizar-trilha.service
[Unit]
Description=SP Aguas DMO - anonimiza a trilha de auditoria (retencao LGPD)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/spaguas-cron.sh anonimizar-trilha
```

```ini
# /etc/systemd/system/spaguas-anonimizar-trilha.timer
[Unit]
Description=Diario, 03:10, anonimizacao da trilha de auditoria

[Timer]
OnCalendar=*-*-* 03:10:00
# Se a maquina estava desligada na hora marcada, roda na proxima subida em vez
# de pular o dia: prazo de retencao nao se cumpre "quando der".
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

## 2. `spaguas-liberar-locks`

Solta travas de triagem que ficaram penduradas. A cada 5 minutos, que é a
cadência que o próprio código documenta. Idempotente.

```ini
# /etc/systemd/system/spaguas-liberar-locks.service
[Unit]
Description=SP Aguas DMO - libera locks de triagem expirados
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/spaguas-cron.sh liberar-locks-expirados
```

```ini
# /etc/systemd/system/spaguas-liberar-locks.timer
[Unit]
Description=A cada 5 minutos, liberacao de locks de triagem

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

## 3. `spaguas-sincronizar-monitor`

Traz do SIBH as leituras das estações. **Só passou a ser possível depois que a
saída pelo proxy do órgão foi configurada** (ADR-0025): sem `HTTP_PROXY` a
chamada fica pendurada até o tempo limite.

De hora em hora, que é a cadência sugerida no próprio arquivo da rota. Na
Vercel era uma vez por dia, às 9h, e isso era limitação do plano, não do
domínio: as estações automáticas transmitem de hora em hora.

```ini
# /etc/systemd/system/spaguas-sincronizar-monitor.service
[Unit]
Description=SP Aguas DMO - sincroniza o Monitor com o SIBH
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/spaguas-cron.sh sincronizar-monitor
```

```ini
# /etc/systemd/system/spaguas-sincronizar-monitor.timer
[Unit]
Description=De hora em hora, sincronizacao do Monitor com o SIBH

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=180

[Install]
WantedBy=timers.target
```

---

## Instalar

```
sudo install -m 0750 -o root -g root spaguas-cron.sh /usr/local/bin/spaguas-cron.sh
sudo systemctl daemon-reload
sudo systemctl enable --now spaguas-anonimizar-trilha.timer \
                            spaguas-liberar-locks.timer \
                            spaguas-sincronizar-monitor.timer
```

## Conferir que roda de verdade

Habilitar não é executar, e timer parado tem a mesma aparência de timer que
nunca disparou:

```
systemctl list-timers 'spaguas-*'        # NEXT e LAST preenchidos
systemctl start spaguas-anonimizar-trilha.service   # dispara agora
journalctl -u spaguas-anonimizar-trilha.service -n 20 --no-pager
systemctl --failed | grep spaguas        # precisa devolver vazio
```

O `journalctl` mostra `HTTP 200` e o começo da resposta. Código diferente de 2xx
marca a unidade como falha, então `systemctl --failed` passa a acusar.
