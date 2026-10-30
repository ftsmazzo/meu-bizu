"""Relatório por IA: o que vai para a IA, a trava de números, o texto padrão e a rota."""

import pytest
from fastapi.testclient import TestClient

from app.carga_ref import carregar_ref
from app.db import get_conn
from app.main import app
from app.relatorio import (
    fatos_do_perfil,
    pedido_para_ia,
    texto_padrao,
    usa_so_numeros_dos_fatos,
)
from app.rotas_relatorio import get_redator

SENHA = "uma-senha-boa-123"

AREAS = [{"area": "MT", "provas": 2, "ultima": 612.4, "anterior": 578.1, "variacao": 34.3}]
HABILIDADES = [
    {
        "area": "MT",
        "habilidade": 5,
        "descricao": "Resolver problemas de contagem",
        "n": 5,
        "acertos": 2,
        "taxa": 0.4,
        "esperado": 0.68,
        "lacuna": -0.28,
        "z": -2.1,
        "selo": "firme",
        "armadilhas": 1,
    },
    {
        "area": "MT",
        "habilidade": 9,
        "descricao": None,
        "n": 4,
        "acertos": 3,
        "taxa": 0.75,
        "esperado": 0.7,
        "lacuna": 0.05,
        "z": 0.2,
        "selo": "sem sinal",
        "armadilhas": 0,
    },
]


# ---------------------------------------------------------------- funções puras


def test_fatos_levam_so_numeros_e_habilidades_com_sinal_de_lacuna():
    fatos = fatos_do_perfil(AREAS, HABILIDADES)
    (mt,) = fatos["areas"]
    assert mt["nome"] == "Matemática" and mt["provas"] == 2
    assert mt["nota"] == 612 and mt["variacao"] == 34 and mt["direcao"] == "subiu"
    (h,) = mt["habilidades"]  # a 9 não tem sinal de lacuna: não entra
    assert (h["numero"], h["acertos"], h["de"], h["esperado"]) == (5, 2, 5, 3.4)
    assert h["foco"] == "foque aqui" and h["armadilhas"] == 1


def test_pedido_para_ia_nao_leva_dado_pessoal_e_proibe_jargao_e_numero_novo():
    sistema, usuario = pedido_para_ia(fatos_do_perfil(AREAS, HABILIDADES))
    assert "Matemática" in usuario and "Resolver problemas de contagem" in usuario
    for proibido in ("@", "uuid", "senha", "email"):
        assert proibido not in (sistema + usuario).lower()
    assert "decil" in sistema.lower()  # o sistema manda NÃO usar o termo
    assert "números" in sistema.lower()


def test_trava_aceita_numeros_dos_fatos_e_barra_numero_inventado():
    fatos = fatos_do_perfil(AREAS, HABILIDADES)
    bom = "Em Matemática sua nota estimada é 612 e subiu 34 pontos. Na habilidade 5 acertou 2 de 5."
    assert usa_so_numeros_dos_fatos(bom, fatos)
    assert usa_so_numeros_dos_fatos("Esperado cerca de 3,4 acertos.", fatos)
    assert not usa_so_numeros_dos_fatos("Sua nota estimada é 700.", fatos)
    assert not usa_so_numeros_dos_fatos("Você deve chegar a 800 em dois meses.", fatos)


def test_texto_padrao_escreve_com_os_numeros_e_passa_na_propria_trava():
    fatos = fatos_do_perfil(AREAS, HABILIDADES)
    texto = texto_padrao(fatos)
    assert "612" in texto and "34" in texto and "habilidade 5" in texto.lower()
    assert "3,4" in texto
    assert usa_so_numeros_dos_fatos(texto, fatos)


def test_texto_padrao_sem_lacuna_clara_diz_isso():
    fatos = fatos_do_perfil(AREAS, HABILIDADES[1:])
    texto = texto_padrao(fatos)
    assert "sem sinal claro" in texto.lower()
    assert usa_so_numeros_dos_fatos(texto, fatos)


# ---------------------------------------------------------------- rota


class Redator:
    def __init__(self):
        self.resposta, self.chamadas = "Em Matemática sua nota estimada é 612.", []

    def redigir(self, sistema: str, usuario: str) -> str:
        self.chamadas.append((sistema, usuario))
        if isinstance(self.resposta, Exception):
            raise self.resposta
        return self.resposta


@pytest.fixture
def cliente_e_redator(conn, ref_csv):
    carregar_ref(conn, ref_csv)
    conn.commit()
    conn.execute("set role meubizu_app")
    conn.commit()
    redator = Redator()
    app.dependency_overrides[get_conn] = lambda: conn
    app.dependency_overrides[get_redator] = lambda: redator

    def novo():
        return TestClient(app, base_url="https://testserver")

    yield novo, redator
    app.dependency_overrides.clear()


def _entrar(cliente, email="ana@exemplo.com"):
    r = cliente.post(
        "/conta/cadastro",
        json={"email": email, "nome": "Ana", "senha": SENHA, "maior_de_18": True},
    )
    assert r.status_code == 201, r.text


def _prova(**mudancas):
    corpo = {"ano": 2023, "area": "MT", "co_prova": 7, "tipo": "enem", "folha": "AAA"}
    return corpo | mudancas


def _nota(cliente) -> int:
    return round(cliente.get("/perfil").json()["areas"][0]["ultima"])


def test_relatorio_exige_login_e_prova(cliente_e_redator):
    novo, redator = cliente_e_redator
    assert novo().post("/relatorio").status_code == 401
    ana = novo()
    _entrar(ana)
    r = ana.post("/relatorio")
    assert r.status_code == 409 and "prova" in r.text
    assert redator.chamadas == []


def test_relatorio_usa_a_ia_guarda_e_so_refaz_quando_os_fatos_mudam(cliente_e_redator):
    novo, redator = cliente_e_redator
    ana = novo()
    _entrar(ana)
    ana.post("/provas", json=_prova())
    redator.resposta = f"Em Matemática sua nota estimada é {_nota(ana)}."
    primeira = ana.post("/relatorio").json()
    assert primeira["origem"] == "ia" and str(_nota(ana)) in primeira["texto"]
    segunda = ana.post("/relatorio").json()
    assert segunda["texto"] == primeira["texto"] and len(redator.chamadas) == 1

    ana.post("/provas", json=_prova(folha="ABA", tipo="simulado", feita_em="2025-02-10"))
    redator.resposta = f"Agora sua nota estimada é {_nota(ana)}."
    terceira = ana.post("/relatorio").json()
    assert len(redator.chamadas) == 2 and terceira["texto"] != primeira["texto"]


def test_relatorio_com_numero_inventado_cai_no_texto_padrao(cliente_e_redator):
    novo, redator = cliente_e_redator
    ana = novo()
    _entrar(ana)
    ana.post("/provas", json=_prova())
    redator.resposta = "Você vai tirar 987 na próxima prova."
    r = ana.post("/relatorio").json()
    assert r["origem"] == "padrao" and "987" not in r["texto"]


def test_relatorio_sem_ia_ou_com_falha_da_ia_usa_o_texto_padrao(cliente_e_redator):
    novo, redator = cliente_e_redator
    ana = novo()
    _entrar(ana)
    ana.post("/provas", json=_prova())
    redator.resposta = RuntimeError("fora do ar")
    r = ana.post("/relatorio")
    assert r.status_code == 200 and r.json()["origem"] == "padrao" and r.json()["texto"]
    app.dependency_overrides[get_redator] = lambda: None  # sem chave configurada
    assert ana.post("/relatorio", params={"area": "MT"}).json()["origem"] == "padrao"


def test_relatorio_de_area_sem_prova_da_409_e_area_invalida_422(cliente_e_redator):
    novo, _ = cliente_e_redator
    ana = novo()
    _entrar(ana)
    ana.post("/provas", json=_prova())
    assert ana.post("/relatorio", params={"area": "CH"}).status_code == 409
    assert ana.post("/relatorio", params={"area": "XX"}).status_code == 422


def test_relatorio_de_um_aluno_nao_vaza_para_outro(cliente_e_redator):
    novo, redator = cliente_e_redator
    ana, bruno = novo(), novo()
    _entrar(ana)
    _entrar(bruno, email="bruno@exemplo.com")
    ana.post("/provas", json=_prova())
    ana.post("/relatorio")
    assert bruno.post("/relatorio").status_code == 409
    assert len(redator.chamadas) == 1
