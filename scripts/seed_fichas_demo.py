"""
Seed de fichas digitais variadas pro posto 1D-008 (Cruzeiro / SP).

Apaga as web_simuladas existentes pra não acumular e recria 8 fichas
diversificadas (Inspeção × 3, PCD × 1, Vazão × 2, Nivelamento × 1, Troca
de Observador × 1) em datas espalhadas pra demonstrar a cronologia rica
no histórico do posto.

Rodar:
    ops/indexer/.venv/Scripts/python.exe scripts/seed_fichas_demo.py
"""

import json
import re
from pathlib import Path

import psycopg


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


FICHAS = [
    # === Inspeções (tipo 3) — várias datas pra cronologia ===
    {
        "tipo": 3, "data": "2026-01-08", "hi": "09:30:00", "hf": "10:15:00",
        "tecnico": "Maria Souza Lima",
        "obs": "Visita de rotina após chuva forte na semana anterior. Réguas íntegras. Sem desassoreamento necessário.",
        "dados": {
            "acesso": "boa", "cercado_abrigo": "boa", "exposicao": "boa", "limpeza": "ruim",
            "tipo_manutencao": "preventiva",
            "pcd_deixada": "registrando_transmitindo",
            "sensor_nivel_tipo": "pressao", "transmissao": "gprs",
            "na_saisp_metros": 730.12, "zero_regua_metros": 728.22,
            "tensao_bateria_v": 12.3,
            "svc_limpeza_reguas": True, "svc_inspecao_pcd": True,
        },
    },
    {
        "tipo": 3, "data": "2025-11-22", "hi": "13:10:00", "hf": "14:45:00",
        "tecnico": "Jonathan Lima Barbosa",
        "obs": "PCD apresentou intermitência na transmissão GPRS. Substituído modem celular. Voltou a transmitir normalmente após teste.",
        "dados": {
            "acesso": "boa", "cercado_abrigo": "boa", "exposicao": "boa", "limpeza": "boa",
            "tipo_manutencao": "corretiva",
            "pcd_deixada": "registrando_transmitindo",
            "sensor_nivel_tipo": "pressao", "transmissao": "gprs",
            "tensao_bateria_v": 11.8,
            "svc_inspecao_pcd": True, "svc_calibracao_transdutor": True,
        },
    },
    {
        "tipo": 3, "data": "2025-08-14", "hi": "08:45:00", "hf": "10:00:00",
        "tecnico": "Ramon Domingos Saldanha",
        "obs": None,
        "dados": {
            "acesso": "boa", "cercado_abrigo": "ruim", "exposicao": "boa", "limpeza": "ruim",
            "tipo_manutencao": "preventiva",
            "pcd_deixada": "registrando_transmitindo",
            "sensor_nivel_tipo": "pressao", "transmissao": "gprs",
            "tensao_bateria_v": 12.5,
            "svc_limpeza_reguas": True, "svc_reforma_cercado": True,
        },
    },
    # === PCD (tipo 2) — manutenção específica ===
    {
        "tipo": 2, "data": "2025-12-03", "hi": "10:00:00", "hf": "12:30:00",
        "tecnico": "Ramon Domingos Saldanha",
        "obs": "Substituído transdutor de pressão por defeito (modelo antigo SDI-12). Novo equipamento OTT PLS calibrado em laboratório antes da instalação.",
        "dados": {
            "tipo_servico": "substituicao",
            "modelo_datalogger": "OTT NetDL-500",
            "modelo_sensor_nivel": "OTT PLS",
            "modelo_modem": "Sierra Wireless RV50",
            "transmissao": "gprs",
            "intervalo_registro_min": 15,
            "intervalo_transmissao_min": 60,
            "tensao_bateria_v": 12.8,
            "corrente_painel_solar_ma": 145.0,
            "offset_transdutor_cm": 0.5,
        },
    },
    # === Vazão (tipo 7) — 2 medições ===
    {
        "tipo": 7, "data": "2026-02-18", "hi": "07:30:00", "hf": "11:00:00",
        "tecnico": "Equipe FCTH (Alex + João)",
        "obs": "Medição com molinete em 12 verticais. Cota estável durante a medição. Curva-chave atualizada após esta campanha.",
        "dados": {
            "metodo_medicao": "molinete",
            "equipamento_modelo": "OTT C2 + cabo",
            "cota_inicial_cm": 152, "cota_final_cm": 154, "cota_media_cm": 153,
            "vazao_calculada_m3s": 38.42,
            "velocidade_media_ms": 0.87,
            "area_molhada_m2": 44.16,
            "largura_superficie_m": 18.5,
            "mediu_sedimentos": False,
        },
    },
    {
        "tipo": 7, "data": "2025-10-09", "hi": "06:30:00", "hf": "12:00:00",
        "tecnico": "Equipe FCTH (Alex + João + Vicente)",
        "obs": "Cheia em recessão. Medição com ADCP em 8 transectos para garantir consistência. Concentração alta de sedimentos em suspensão por causa das chuvas recentes.",
        "dados": {
            "metodo_medicao": "adcp",
            "equipamento_modelo": "Teledyne RDI StreamPro",
            "cota_inicial_cm": 287, "cota_final_cm": 281, "cota_media_cm": 284,
            "vazao_calculada_m3s": 178.65,
            "velocidade_media_ms": 1.72,
            "area_molhada_m2": 103.87,
            "largura_superficie_m": 22.4,
            "mediu_sedimentos": True,
            "concentracao_sedimentos_mgL": 412.3,
        },
    },
    # === Nivelamento (tipo 4) ===
    {
        "tipo": 4, "data": "2025-06-20", "hi": "08:00:00", "hf": "14:30:00",
        "tecnico": "Equipe Topografia FCTH",
        "obs": "Verificação anual das RNs. Detectado pequeno deslocamento na RN 02 (provável acomodação do solo). Recomendar nova fixação em campanha futura.",
        "dados": {
            "metodo": "geometrico",
            "rn_padrao": "RN 00",
            "cota_rn00_m": 728.500,
            "cota_rn01_m": 729.215,
            "cota_rn02_m": 728.918,
            "cota_rn03_m": 728.762,
            "cota_rn04_m": 728.245,
            "erro_fechamento_mm": 3.2,
            "zero_regua_m": 728.22,
            "cota_regua_lance_inicial_cm": 0,
            "cota_regua_lance_final_cm": 400,
            "reguas_substituidas": False,
        },
    },
    # === Troca de observador (tipo 6) ===
    {
        "tipo": 6, "data": "2025-04-12", "hi": "14:00:00", "hf": "16:30:00",
        "tecnico": "Maria Souza Lima",
        "obs": "Sr. José Carlos optou por se aposentar do trabalho de observador após 14 anos. Apresentado novo observador (filho dele) com treinamento básico de leitura das réguas e do pluviômetro.",
        "dados": {
            "observador_anterior_nome": "José Carlos da Silva",
            "observador_anterior_data_inicio": "2011-03-01",
            "observador_anterior_motivo_saida": "aposentadoria",
            "observador_novo_nome": "Pedro da Silva",
            "observador_novo_documento": "123.456.789-00",
            "observador_novo_telefone": "(11) 98765-4321",
            "observador_novo_endereco": "Rua das Flores 123, Jardim Romano, SP",
            "observador_novo_data_inicio": "2025-04-12",
            "orientacao_realizada": True,
        },
    },
]


def main() -> None:
    url = carregar_database_url()
    inseridas = 0

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM fichas_visita WHERE prefixo = %s AND origem = 'web_simulada'",
            ("1D-008",),
        )
        apagadas = cur.rowcount

        for f in FICHAS:
            cur.execute(
                """
                INSERT INTO fichas_visita
                  (prefixo, cod_tipo_documento, data_visita, hora_inicio, hora_fim,
                   tecnico_nome, latitude_capturada, longitude_capturada,
                   observacoes, dados, origem, status)
                VALUES
                  ('1D-008', %s, %s, %s, %s, %s, -22.5833333, -45.1400000,
                   %s, %s::jsonb, 'web_simulada', 'enviada')
                """,
                (
                    f["tipo"], f["data"], f["hi"], f["hf"], f["tecnico"],
                    f["obs"], json.dumps(f["dados"]),
                ),
            )
            inseridas += 1

        conn.commit()

        cur.execute(
            """
            SELECT cod_tipo_documento, COUNT(*)
              FROM fichas_visita
             WHERE prefixo = '1D-008'
             GROUP BY cod_tipo_documento
             ORDER BY 1
            """
        )
        distribuicao = cur.fetchall()

    print(f"Apagadas anteriores: {apagadas}")
    print(f"Inseridas: {inseridas} fichas em 1D-008")
    print()
    print("Distribuição final em 1D-008:")
    for codigo, total in distribuicao:
        print(f"  tipo {codigo}: {total} fichas")


if __name__ == "__main__":
    main()
