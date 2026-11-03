"""Posição da nota no Brasil, no estado e no município (dados sintéticos de `conftest.py`)."""

import pytest
from fastapi.testclient import TestClient

from app.carga_ref import carregar_ref
from app.db import get_conn
from app.main import app
from app.raiox import a_frente_de

SENHA = "uma-senha-boa-123"
# 19 percentis de 5 em 5: 300, 320, ..., 660
PONTOS = [300 + 20 * i for i in range(19)]


# ---------------------------------------------------------------- função pura


def test_a_frente_de_e_o_maior_percentil_que_a_nota_ja_alcancou():
    assert a_frente_de(500, PONTOS) == 55  # 11 pontos até 500: 5% x 11
    assert a_frente_de(520, PONTOS) == 60
    assert a_frente_de(519.9, PONTOS) == 55  # nunca arredonda para cima


def test_a_frente_de_nas_pontas():
    assert a_frente_de(100, PONTOS) == 0  # abaixo do percentil 5: não dá para afirmar nada
    assert a_frente_de(300, PONTOS) == 5
    assert a_frente_de(9999, PONTOS) == 95  # acima do percentil 95: "pelo menos 95%"


# ---------------------------------------------------------------- listas e Raio-X


@pytest.fixture
def cliente(conn, ref_csv):
    carregar_ref(conn, ref_csv)
    conn.commit()
    conn.execute("set role meubizu_app")
    conn.commit()
    app.dependency_overrides[get_conn] = lambda: conn
    c = TestClient(app, base_url="https://testserver")
    r = c.post(
        "/conta/cadastro",
        json={"email": "ana@exemplo.com", "nome": "Ana", "senha": SENHA, "maior_de_18": True},
    )
    assert r.status_code == 201, r.text
    yield c
    app.dependency_overrides.clear()


def test_lista_estados_e_municipios_do_ano(cliente):
    ufs = cliente.get("/geo/ufs", params={"ano": 2023}).json()
    assert ufs == [{"uf": "RJ", "n": 500}, {"uf": "SP", "n": 1000}]
    municipios = cliente.get("/geo/municipios", params={"ano": 2023, "uf": "SP"}).json()
    assert municipios == [{"codigo": "3550308", "nome": "São Paulo", "n": 300}]
    assert cliente.get("/geo/ufs", params={"ano": 2030}).json() == []
    assert cliente.get("/geo/municipios", params={"ano": 2023, "uf": "AC"}).json() == []
    assert cliente.get("/geo/municipios", params={"ano": 2023, "uf": "sp1"}).status_code == 422


def test_raiox_traz_brasil_estado_e_municipio(cliente):
    corpo = {"ano": 2023, "notas": {"MT": 500}, "uf": "SP", "municipio": "3550308"}
    (mt,) = cliente.post("/raio-x", json=corpo).json()["areas"]
    assert mt["brasil"] == {"nome": "Brasil", "a_frente_de": 55, "n": 10000}
    assert mt["uf"] == {"nome": "SP", "a_frente_de": 60, "n": 1000}  # a curva de SP começa em 280
    assert mt["municipio"] == {"nome": "São Paulo", "a_frente_de": 65, "n": 300}


def test_raiox_sem_uf_nem_municipio_so_traz_o_brasil(cliente):
    (mt,) = cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}}).json()["areas"]
    assert mt["brasil"]["a_frente_de"] == 55 and mt["uf"] is None and mt["municipio"] is None


def test_raiox_local_sem_dados_na_area_vem_vazio_sem_derrubar_o_resto(cliente):
    corpo = {"ano": 2023, "notas": {"LC": 500, "MT": 500}, "lingua": 0, "uf": "SP"}
    por_area = {a["area"]: a for a in cliente.post("/raio-x", json=corpo).json()["areas"]}
    assert por_area["LC"]["uf"] is None  # SP só existe em MT na fixture
    assert por_area["LC"]["brasil"]["a_frente_de"] == 55 and por_area["MT"]["uf"] is not None


@pytest.mark.parametrize(
    "extra", [{"uf": "sp"}, {"uf": "SPP"}, {"municipio": "abc"}, {"municipio": "12345678"}]
)
def test_raiox_recusa_uf_e_municipio_mal_formados(cliente, extra):
    corpo = {"ano": 2023, "notas": {"MT": 500}} | extra
    assert cliente.post("/raio-x", json=corpo).status_code == 422
