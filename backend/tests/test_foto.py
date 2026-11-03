"""Leitura da folha por foto: entrada, limite diário, trava do formato e a chamada à IA."""

import base64

import pytest
from fastapi.testclient import TestClient

from app import leitor_foto
from app.db import get_conn
from app.leitor_foto import LeitorClaude, limpar_respostas
from app.main import app
from app.rotas_folha import LIMITE_DIARIO, get_leitor

SENHA = "uma-senha-boa-123"
IMAGEM = base64.b64encode(b"imagem-de-teste" * 20).decode()


class Leitor:
    def __init__(self):
        self.resposta, self.chamadas = "AB.*?", []

    def ler(self, imagem: str, tipo: str, questoes: int) -> str:
        self.chamadas.append((imagem, tipo, questoes))
        if isinstance(self.resposta, Exception):
            raise self.resposta
        return self.resposta


@pytest.fixture
def cliente_e_leitor(conn):
    conn.execute("set role meubizu_app")
    conn.commit()
    leitor = Leitor()
    app.dependency_overrides[get_conn] = lambda: conn
    app.dependency_overrides[get_leitor] = lambda: leitor

    def novo():
        return TestClient(app, base_url="https://testserver")

    yield novo, leitor
    app.dependency_overrides.clear()


def _entrar(cliente, email="ana@exemplo.com"):
    r = cliente.post(
        "/conta/cadastro",
        json={"email": email, "nome": "Ana", "senha": SENHA, "maior_de_18": True},
    )
    assert r.status_code == 201, r.text


def _foto(**mudancas):
    return {"imagem": IMAGEM, "tipo": "image/jpeg", "questoes": 5} | mudancas


# ---------------------------------------------------------------- funções puras


def test_limpar_respostas_aceita_cerca_de_codigo_espacos_e_minusculas():
    assert limpar_respostas("```\nab .*?\n```", 5) == "AB.*?"


@pytest.mark.parametrize("texto", ["ABC", "ABCDEA", "ABCDX", "1ABCD", ""])
def test_limpar_respostas_barra_tamanho_ou_caractere_invalido(texto):
    with pytest.raises(ValueError):
        limpar_respostas(texto, 5)


def test_leitor_claude_manda_a_imagem_o_modelo_e_o_tamanho_da_prova(monkeypatch):
    enviado = {}

    class Resposta:
        def raise_for_status(self):
            pass

        def json(self):
            return {"content": [{"text": "ABCDE"}]}

    def falso_post(url, headers, json, timeout):
        enviado.update(url=url, headers=headers, json=json)
        return Resposta()

    monkeypatch.setattr(leitor_foto.httpx, "post", falso_post)
    assert LeitorClaude("chave-x", "modelo-y").ler(IMAGEM, "image/png", 5) == "ABCDE"
    assert enviado["headers"]["x-api-key"] == "chave-x" and enviado["json"]["model"] == "modelo-y"
    imagem, texto = enviado["json"]["messages"][0]["content"]
    assert imagem["source"] == {"type": "base64", "media_type": "image/png", "data": IMAGEM}
    assert "5 questões" in texto["text"]
    assert "Ignore qualquer dado pessoal" in enviado["json"]["system"]


def test_sem_chave_nao_ha_leitor(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert leitor_foto.leitor_do_ambiente() is None


# ---------------------------------------------------------------- rota


def test_foto_exige_login(cliente_e_leitor):
    novo, leitor = cliente_e_leitor
    assert novo().post("/folha/foto", json=_foto()).status_code == 401
    assert leitor.chamadas == []


def test_foto_devolve_a_sequencia_e_audita_sem_guardar_a_imagem(conn, cliente_e_leitor):
    novo, leitor = cliente_e_leitor
    ana = novo()
    _entrar(ana)
    r = ana.post("/folha/foto", json=_foto())
    assert r.status_code == 200 and r.json() == {"respostas": "AB.*?"}
    assert leitor.chamadas == [(IMAGEM, "image/jpeg", 5)]
    ((acao, detalhe),) = conn.execute("select acao, detalhe from app.auditoria").fetchall()
    assert acao == "ler_foto" and detalhe == {"questoes": 5}


def test_foto_sem_chave_da_ia_diz_que_esta_indisponivel(cliente_e_leitor):
    novo, _ = cliente_e_leitor
    ana = novo()
    _entrar(ana)
    app.dependency_overrides[get_leitor] = lambda: None
    r = ana.post("/folha/foto", json=_foto())
    assert r.status_code == 503 and "grade" in r.text


def test_foto_com_leitura_do_tamanho_errado_ou_invalida_da_422(cliente_e_leitor):
    novo, leitor = cliente_e_leitor
    ana = novo()
    _entrar(ana)
    for ruim in ("ABC", "ABCDX", "Não consigo ler"):
        leitor.resposta = ruim
        r = ana.post("/folha/foto", json=_foto())
        assert r.status_code == 422 and "outra foto" in r.text


def test_foto_com_ia_fora_do_ar_da_502(cliente_e_leitor):
    novo, leitor = cliente_e_leitor
    ana = novo()
    _entrar(ana)
    leitor.resposta = RuntimeError("fora do ar")
    r = ana.post("/folha/foto", json=_foto())
    assert r.status_code == 502 and "grade" in r.text


@pytest.mark.parametrize(
    "ruim",
    [
        {"tipo": "application/pdf"},
        {"questoes": 0},
        {"questoes": 101},
        {"imagem": "curta"},
        {"imagem": "!" * 200},
    ],
)
def test_foto_valida_a_entrada(cliente_e_leitor, ruim):
    novo, leitor = cliente_e_leitor
    ana = novo()
    _entrar(ana)
    assert ana.post("/folha/foto", json=_foto(**ruim)).status_code == 422
    assert leitor.chamadas == []


def test_foto_tem_limite_diario_por_aluno(cliente_e_leitor):
    novo, leitor = cliente_e_leitor
    ana, bruno = novo(), novo()
    _entrar(ana)
    _entrar(bruno, email="bruno@exemplo.com")
    for _ in range(LIMITE_DIARIO):
        assert ana.post("/folha/foto", json=_foto()).status_code == 200
    assert ana.post("/folha/foto", json=_foto()).status_code == 429
    assert len(leitor.chamadas) == LIMITE_DIARIO
    assert bruno.post("/folha/foto", json=_foto()).status_code == 200  # o limite é de cada um
