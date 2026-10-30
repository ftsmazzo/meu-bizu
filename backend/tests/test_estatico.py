"""A API serve o build do front quando a pasta existe; as rotas da API continuam com prioridade."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import montar_interface


def _app(pasta):
    app = FastAPI()

    @app.get("/saude")
    def saude():
        return {"status": "ok"}

    montar_interface(app, pasta)
    return TestClient(app)


def test_serve_a_pagina_inicial_e_os_arquivos(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>bizu</html>", encoding="utf-8")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    c = _app(tmp_path)
    assert "bizu" in c.get("/").text
    assert c.get("/assets/app.js").status_code == 200


def test_rota_da_api_vence_a_interface(tmp_path):
    (tmp_path / "index.html").write_text("<html>bizu</html>", encoding="utf-8")
    assert _app(tmp_path).get("/saude").json() == {"status": "ok"}


def test_caminho_desconhecido_nao_vira_pagina(tmp_path):
    (tmp_path / "index.html").write_text("<html>bizu</html>", encoding="utf-8")
    assert _app(tmp_path).get("/conta/nao-existe").status_code == 404


def test_sem_a_pasta_nada_e_montado(tmp_path):
    assert _app(tmp_path / "nao-existe").get("/").status_code == 404
