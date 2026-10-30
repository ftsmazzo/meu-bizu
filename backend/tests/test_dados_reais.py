"""Carga e rotas com a exportação REAL do laboratório. Só roda com `REF_CSV_DIR` definido."""

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.carga_ref import carregar_ref
from app.db import get_conn
from app.main import app

PASTA = os.environ.get("REF_CSV_DIR")
pytestmark = pytest.mark.skipif(not PASTA, reason="defina REF_CSV_DIR com a exportação real")


@pytest.fixture
def cliente(conn):
    carregar_ref(conn, Path(PASTA))
    app.dependency_overrides[get_conn] = lambda: conn
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_carga_real_tem_os_numeros_do_laboratorio(conn, cliente):
    contagem = {
        t: conn.execute(f"select count(*) from ref.{t}").fetchone()[0]
        for t in ("caderno", "questao", "item_esperado", "habilidade")
    }
    assert contagem["caderno"] == 874 and contagem["questao"] == 1850
    assert contagem["habilidade"] == 120 and contagem["item_esperado"] > 30000
    assert cliente.get("/anos").json() == list(range(2016, 2026))


def test_matematica_2023_devolve_45_questoes_com_texto_e_sem_gabarito(cliente):
    cadernos = cliente.get("/anos/2023/areas/MT/cadernos").json()
    escolha = next(c for c in cadernos if c["selecionavel"] and c["referencia"] == "decil")
    resposta = cliente.get(
        f"/cadernos/{escolha['co_prova']}/questoes", params={"ano": 2023, "area": "MT"}
    )
    questoes = resposta.json()
    assert len(questoes) == 45 and [q["numero"] for q in questoes] == list(range(1, 46))
    assert sum(q["tem_texto"] for q in questoes) >= 43
    assert "gabarito" not in json.dumps(questoes).lower()


def test_linguagens_2023_tem_45_questoes_por_lingua(cliente):
    cadernos = cliente.get("/anos/2023/areas/LC/cadernos").json()
    escolha = next(c for c in cadernos if c["selecionavel"] and c["referencia"] == "decil")
    for lingua in (0, 1):
        r = cliente.get(
            f"/cadernos/{escolha['co_prova']}/questoes",
            params={"ano": 2023, "area": "LC", "lingua": lingua},
        )
        assert r.status_code == 200 and len(r.json()) == 45


def test_cadernos_ambiguos_de_2020_ficam_bloqueados(cliente):
    cadernos = cliente.get("/anos/2020/areas/LC/cadernos").json()
    ambiguos = [c for c in cadernos if not c["selecionavel"] and "ambíguo" in c["motivo"]]
    assert sorted(c["co_prova"] for c in ambiguos) == [691, 692, 693, 694]
