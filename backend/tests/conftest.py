"""Fixtures de teste: PostgreSQL real, sem mocks.

Usa `TEST_DATABASE_URL` se existir (CI); senão sobe um cluster descartável com o PostgreSQL
instalado na máquina (`PG_BIN` ou o caminho padrão); senão pula os testes que precisam de banco.
"""

import csv
import glob
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import psycopg
import pytest

from app.migrar import migrar


def _pg_bin() -> Path | None:
    candidatos = [os.environ.get("PG_BIN", "")]
    candidatos += sorted(glob.glob(r"C:\Program Files\PostgreSQL\*\bin"), reverse=True)
    candidatos += sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True)
    for c in candidatos:
        if c and (Path(c) / ("postgres.exe" if os.name == "nt" else "postgres")).exists():
            return Path(c)
    return None


def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def pg_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        yield url
        return
    binarios = _pg_bin()
    if binarios is None:
        pytest.skip("sem PostgreSQL para os testes (defina TEST_DATABASE_URL ou PG_BIN)")
    ext = ".exe" if os.name == "nt" else ""
    pasta = Path(tempfile.mkdtemp(prefix="meubizu_pg_"))
    dados, porta = pasta / "dados", _porta_livre()
    subprocess.run(
        [str(binarios / f"initdb{ext}"), "-D", str(dados), "-U", "postgres", "-A", "trust"]
        + ["-E", "UTF8", "--locale=C"],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    log = open(pasta / "log.txt", "w")  # noqa: SIM115 (fechado no fim da sessão)
    servidor = subprocess.Popen(
        [str(binarios / f"postgres{ext}"), "-D", str(dados), "-p", str(porta)]
        + ["-c", "listen_addresses=127.0.0.1", "-c", "fsync=off"],
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=log,
    )
    url = f"postgresql://postgres@127.0.0.1:{porta}/postgres"
    for _ in range(100):
        try:
            psycopg.connect(url, connect_timeout=2).close()
            break
        except psycopg.OperationalError:
            time.sleep(0.3)
    else:
        servidor.kill()
        pytest.fail("o PostgreSQL de teste não subiu")
    yield url
    subprocess.run(
        [str(binarios / f"pg_ctl{ext}"), "-D", str(dados), "-m", "immediate", "stop"],
        timeout=60,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    servidor.wait(timeout=30)
    log.close()
    shutil.rmtree(pasta, ignore_errors=True)


@pytest.fixture
def conn(pg_url):
    """Conexão com o banco limpo e as migrações aplicadas."""
    with psycopg.connect(pg_url) as c:
        c.execute("drop schema if exists app cascade")
        c.execute("drop schema if exists ref cascade")
        c.execute("drop table if exists public.schema_migracoes")
        c.commit()
        migrar(c)
        yield c
        c.rollback()


CABECALHOS = {
    "habilidade": "area,habilidade,competencia,competencia_texto,descricao",
    "caderno": "ano,co_prova,area,cor,n_itens,adaptado,ambiguo,tem_respondentes",
    "item": "ano,co_item,area,habilidade,abandonado,motivo_abandono,param_a,param_b,param_c",
    "item_caderno": "ano,co_prova,area,posicao,co_item,tp_lingua,gabarito",
    "questao": "ano,co_item,area,fonte,introducao,enunciado,alternativas,imagens",
    "item_estatistica": (
        "ano,co_item,area,habilidade,abandonado,gabarito,n,acerto,acerto_decil_1,acerto_decil_10,"
        "discriminacao,inversao,distrator_dominante,prop_distrator_topo,armadilha,prop_sem_resposta"
    ),
    "item_esperado": "ano,co_item,decil,acerto,n",
    "decil_nota": "ano,area,decil,nota_min,nota_max,n",
}

ALT = '{"A": "um", "B": "dois", "C": "tres", "D": "quatro", "E": "cinco"}'

# Dados sintéticos: MT 2023 com um caderno normal (7), um ambíguo (8) e um adaptado (9);
# LC 2023 com um caderno (20) com inglês, espanhol e comuns.
LINHAS = {
    "habilidade": [["MT", 5, 1, "Comp", "Desc"], ["LC", 2, 1, "Comp", "Desc"]],
    "caderno": [
        [2023, 7, "MT", "AZUL", 3, "false", "false", "true"],
        [2023, 8, "MT", "ROSA", 3, "false", "true", "true"],
        [2023, 9, "MT", "LARANJA", 3, "true", "false", "false"],
        [2023, 20, "LC", "AZUL", 4, "false", "false", "true"],
    ],
    "item": [
        [2023, 10, "MT", 5, "false", "", 1.5, 0.2, 0.2],
        [2023, 20, "MT", 5, "false", "", 1.0, 0.5, 0.2],
        [2023, 30, "MT", 5, "false", "", 1.0, 0.1, 0.2],
        [2023, 101, "LC", 2, "false", "", 1.0, 0.1, 0.2],
        [2023, 102, "LC", 2, "false", "", 1.0, 0.1, 0.2],
        [2023, 103, "LC", 2, "false", "", 1.0, 0.1, 0.2],
    ],
    "item_caderno": [
        [2023, 7, "MT", 1, 10, "", "A"],
        [2023, 7, "MT", 2, 20, "", "B"],
        [2023, 7, "MT", 3, 30, "", "C"],
        [2023, 8, "MT", 1, 10, "", "A"],
        [2023, 8, "MT", 1, 20, "", "B"],
        [2023, 8, "MT", 3, 30, "", "C"],
        [2023, 9, "MT", 1, 10, "", "A"],
        [2023, 20, "LC", 1, 101, 0, "A"],
        [2023, 20, "LC", 1, 102, 1, "B"],
        [2023, 20, "LC", 6, 103, "", "C"],
    ],
    "questao": [
        [2023, 10, "MT", "enem.dev", "", "Quanto e 1+1?", ALT, "[]"],
        [2023, 20, "MT", "enem.dev", "Intro", "Quanto e 2+2?", ALT, "[]"],
        [2023, 101, "LC", "enem.dev", "", "Question one", ALT, "[]"],
        [2023, 102, "LC", "enem.dev", "", "Pregunta uno", ALT, "[]"],
        [2023, 103, "LC", "enem.dev", "", "Questao comum", ALT, "[]"],
    ],
    "item_estatistica": [
        [2023, 10, "MT", 5, "false", "A", 100, 0.5, 0.2, 0.9, 0.7, "false", "B", 0.1, "false", 0.02]
    ],
    "item_esperado": [[2023, 10, d, 0.1 * d, 10] for d in range(1, 11)],
    "decil_nota": [[2023, "MT", d, 300 + 40 * d, 340 + 40 * d, 1000] for d in range(1, 11)],
}


@pytest.fixture
def ref_csv(tmp_path) -> Path:
    """Pasta com os CSVs sintéticos de referência, no formato da exportação do laboratório."""
    for nome, cabecalho in CABECALHOS.items():
        with open(tmp_path / f"{nome}.csv", "w", encoding="utf-8", newline="") as f:
            escritor = csv.writer(f)
            escritor.writerow(cabecalho.split(","))
            escritor.writerows(LINHAS[nome])
    return tmp_path
