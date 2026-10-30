import json

import pytest
from fastapi.testclient import TestClient

from app.carga_ref import carregar_ref
from app.db import get_conn
from app.main import app


@pytest.fixture
def cliente(conn, ref_csv):
    carregar_ref(conn, ref_csv)
    app.dependency_overrides[get_conn] = lambda: conn
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_anos_lista_os_anos_da_base(cliente):
    assert cliente.get("/anos").json() == [2023]


def test_cadernos_do_ano_e_area_trazem_o_que_a_tela_precisa(cliente):
    resposta = cliente.get("/anos/2023/areas/MT/cadernos")
    assert resposta.status_code == 200
    cadernos = {c["co_prova"]: c for c in resposta.json()}
    assert set(cadernos) == {7, 8, 9}
    assert cadernos[7]["rotulo"] == "AZUL (código 7)" and cadernos[7]["selecionavel"] is True
    assert cadernos[8]["selecionavel"] is False and "ambíguo" in cadernos[8]["motivo"]
    assert cadernos[9]["selecionavel"] is False and "adaptado" in cadernos[9]["motivo"]


def test_area_invalida_e_ano_sem_caderno(cliente):
    assert cliente.get("/anos/2023/areas/XX/cadernos").status_code == 422
    assert cliente.get("/anos/1999/areas/MT/cadernos").status_code == 404


def test_questoes_vem_na_ordem_da_folha_e_sem_gabarito(cliente):
    resposta = cliente.get("/cadernos/7/questoes", params={"ano": 2023, "area": "MT"})
    assert resposta.status_code == 200
    questoes = resposta.json()
    assert [q["numero"] for q in questoes] == [1, 2, 3]
    assert questoes[0]["enunciado"] == "Quanto e 1+1?"
    assert questoes[0]["alternativas"]["A"] == "um"
    assert questoes[2]["tem_texto"] is False  # o item 30 não tem texto confiável
    corpo = json.dumps(resposta.json()).lower()
    assert "gabarito" not in corpo and "co_item" not in corpo


def test_questoes_de_linguagens_pedem_a_lingua_e_filtram(cliente):
    sem_lingua = cliente.get("/cadernos/20/questoes", params={"ano": 2023, "area": "LC"})
    assert sem_lingua.status_code == 422
    ingles = cliente.get("/cadernos/20/questoes", params={"ano": 2023, "area": "LC", "lingua": 0})
    assert [q["enunciado"] for q in ingles.json()] == ["Question one", "Questao comum"]
    espanhol = cliente.get("/cadernos/20/questoes", params={"ano": 2023, "area": "LC", "lingua": 1})
    assert [q["enunciado"] for q in espanhol.json()] == ["Pregunta uno", "Questao comum"]


def test_caderno_ambiguo_e_inexistente(cliente):
    ambiguo = cliente.get("/cadernos/8/questoes", params={"ano": 2023, "area": "MT"})
    assert ambiguo.status_code == 409
    inexistente = cliente.get("/cadernos/999/questoes", params={"ano": 2023, "area": "MT"})
    assert inexistente.status_code == 404
