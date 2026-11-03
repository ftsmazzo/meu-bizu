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


def test_raiox_real_cobre_as_quatro_areas_de_2023(cliente):
    logado = TestClient(app, base_url="https://testserver")
    cadastro = {"email": "r@exemplo.com", "nome": "R", "maior_de_18": True}
    logado.post(
        "/conta/cadastro", json=cadastro | {"senha": "uma-senha-boa-123"}
    ).raise_for_status()
    corpo = {"ano": 2023, "notas": {"LC": 520, "CH": 560, "CN": 480, "MT": 640}, "lingua": 0}
    r = logado.post("/raio-x", json=corpo)
    assert r.status_code == 200, r.text
    areas = {a["area"]: a for a in r.json()["areas"]}
    assert list(areas) == ["LC", "CH", "CN", "MT"]
    for a in areas.values():
        # anuladas e itens sem parâmetro ficam de fora, então o total pode ser um pouco menor
        assert 40 <= a["total"] <= 45 and sum(a["faixas"].values()) == a["total"]
        assert a["decil"] in range(1, 11) and a["foco"] and a["foco"][0]["ganho"] > 0
        assert len(a["alcance"]) <= 5 and 0 < a["esperado"] < a["total"]
    assert areas["MT"]["decil"] > areas["CN"]["decil"]  # 640 está acima de 480
    print({k: (v["decil"], v["esperado"], v["faixas"]) for k, v in areas.items()})
    print(areas["MT"]["foco"][:3])


def test_ranking_real_por_estado_e_municipio_em_2023(cliente):
    logado = TestClient(app, base_url="https://testserver")
    cadastro = {"email": "g@exemplo.com", "nome": "G", "maior_de_18": True}
    logado.post(
        "/conta/cadastro", json=cadastro | {"senha": "uma-senha-boa-123"}
    ).raise_for_status()
    ufs = {u["uf"]: u["n"] for u in logado.get("/geo/ufs", params={"ano": 2023}).json()}
    assert len(ufs) == 27 and ufs["SP"] > ufs["AC"] > 0
    municipios = logado.get("/geo/municipios", params={"ano": 2023, "uf": "SP"}).json()
    sao_paulo = next(m for m in municipios if m["nome"] == "São Paulo")  # acento preservado
    assert sao_paulo["codigo"] == "3550308" and sao_paulo["n"] > 50000
    corpo = {"ano": 2023, "notas": {"MT": 640}, "uf": "SP", "municipio": "3550308"}
    (mt,) = logado.post("/raio-x", json=corpo).json()["areas"]
    for local in (mt["brasil"], mt["uf"], mt["municipio"]):
        assert local and 0 <= local["a_frente_de"] <= 95 and local["n"] > 50
    assert mt["brasil"]["n"] > mt["uf"]["n"] > mt["municipio"]["n"]
    # a mesma nota, em locais diferentes, ocupa posições diferentes (o ranking não é de enfeite)
    ac = logado.post("/raio-x", json={"ano": 2023, "notas": {"MT": 640}, "uf": "AC"}).json()
    assert ac["areas"][0]["uf"]["a_frente_de"] != mt["uf"]["a_frente_de"]
    print(mt["brasil"], mt["uf"], mt["municipio"], ac["areas"][0]["uf"])


# Perfil "Mediano" de 2023, caderno AZUL: (área, caderno, nota, folha). LC é inglês.
MEDIANO = [
    ("LC", 1201, 540, "B.AADCAAAEDCCBBABCDDBCBDBEACBEEBAACADACBBE.AE"),
    ("CH", 1191, 570, "CDBDEADBBBADCADEBDD.ABCDEABEDCDEEAADCCCEEBAD."),
    ("CN", 1221, 510, "DBDEAEBCADAEAEADEACBECE.ECDCBDEDDCEC.CCDAABDB"),
    ("MT", 1211, 590, "*CADAEBBCBCBDECBCC.CECCDEEEDBBCCDDBCBBE.BDCCA"),
]


def test_raiox_cruza_com_as_provas_reais_do_mediano(cliente):
    logado = TestClient(app, base_url="https://testserver")
    cadastro = {"email": "m@exemplo.com", "nome": "M", "maior_de_18": True}
    logado.post(
        "/conta/cadastro", json=cadastro | {"senha": "uma-senha-boa-123"}
    ).raise_for_status()
    for area, co_prova, nota, folha in MEDIANO:
        corpo = {"ano": 2023, "area": area, "co_prova": co_prova, "tipo": "enem", "nota": nota}
        corpo |= {"lingua": 0 if area == "LC" else None, "folha": folha}
        r = logado.post("/provas", json=corpo)
        assert r.status_code == 201, r.text
    provas = {p["area"]: p for p in logado.get("/provas").json()}
    notas = {area: nota for area, _, nota, _ in MEDIANO}
    r = logado.post("/raio-x", json={"ano": 2023, "notas": notas, "lingua": 0})
    assert r.status_code == 200, r.text
    for a in r.json()["areas"]:
        sua, prova = a["sua_prova"], provas[a["area"]]
        # o cruzamento enxerga as mesmas questões que a correção da prova (mesmo co_item)
        assert sua is not None, a["area"]
        assert sua["acertos"] == prova["acertos"], a["area"]
        assert sua["avaliadas"] == prova["avaliadas"], a["area"]
        assert all(p["chance"] >= 75 for p in sua["perdidas"])
        print(a["area"], sua["acertos"], sua["avaliadas"], sua["esperado"], sua["leitura"])
        print("   perdidas:", sua["perdidas_total"], [p["habilidade"] for p in sua["perdidas"]])
    assert "gabarito" not in json.dumps(r.json()).lower()


def test_cadernos_ambiguos_de_2020_ficam_bloqueados(cliente):
    cadernos = cliente.get("/anos/2020/areas/LC/cadernos").json()
    ambiguos = [c for c in cadernos if not c["selecionavel"] and "ambíguo" in c["motivo"]]
    assert sorted(c["co_prova"] for c in ambiguos) == [691, 692, 693, 694]
