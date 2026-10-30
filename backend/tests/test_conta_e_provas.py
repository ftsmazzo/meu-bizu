"""Conta, provas e isolamento entre alunos, contra PostgreSQL real com o papel sem privilégios.

A conexão de teste roda como `meubizu_app` (sem dono, sem BYPASSRLS), como a API em produção:
superusuário ignoraria o RLS e os testes de vazamento não provariam nada.
"""

from datetime import date, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.carga_ref import carregar_ref
from app.db import get_conn
from app.main import app

SENHA = "uma-senha-boa-123"


@pytest.fixture
def novo_cliente(conn, ref_csv):
    """Fábrica de clientes HTTP (cada um com o próprio cookie) sobre a mesma conexão de teste."""
    carregar_ref(conn, ref_csv)
    conn.commit()
    conn.execute("set role meubizu_app")
    conn.commit()  # o SET sobrevive aos rollbacks da transação de cada requisição
    app.dependency_overrides[get_conn] = lambda: conn
    yield lambda: TestClient(app, base_url="https://testserver")
    app.dependency_overrides.clear()


def _cadastrar(cliente, email="ana@exemplo.com", nome="Ana"):
    r = cliente.post(
        "/conta/cadastro",
        json={"email": email, "nome": nome, "senha": SENHA, "maior_de_18": True},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _prova(**mudancas):
    corpo = {"ano": 2023, "area": "MT", "co_prova": 7, "tipo": "enem", "folha": "ABC"}
    return corpo | mudancas


# ---------------------------------------------------------------- conta


def test_cadastro_abre_sessao_e_o_cookie_e_httponly(novo_cliente):
    ana = novo_cliente()
    usuario = _cadastrar(ana)
    assert usuario["email"] == "ana@exemplo.com" and "senha" not in usuario
    assert [c.name for c in ana.cookies.jar] == ["sessao"]
    assert ana.get("/conta/eu").json()["nome"] == "Ana"


def test_cookie_de_sessao_e_httponly_seguro_e_lax(novo_cliente):
    r = novo_cliente().post(
        "/conta/cadastro",
        json={"email": "a@b.com", "nome": "A", "senha": SENHA, "maior_de_18": True},
    )
    cabecalho = r.headers["set-cookie"].lower()
    assert "httponly" in cabecalho and "secure" in cabecalho and "samesite=lax" in cabecalho


def test_rotas_de_aluno_exigem_login(novo_cliente):
    anonimo = novo_cliente()
    for caminho in ("/conta/eu", "/provas", "/perfil"):
        assert anonimo.get(caminho).status_code == 401
    assert anonimo.post("/provas", json=_prova()).status_code == 401
    anonimo.cookies.set("sessao", "token-inventado")
    assert anonimo.get("/provas").status_code == 401


def test_cadastro_recusa_menor_senha_curta_e_email_invalido(novo_cliente):
    c = novo_cliente()
    base = {"email": "a@b.com", "nome": "A", "senha": SENHA, "maior_de_18": True}
    assert c.post("/conta/cadastro", json=base | {"maior_de_18": False}).status_code == 422
    assert c.post("/conta/cadastro", json=base | {"senha": "curta"}).status_code == 422
    assert c.post("/conta/cadastro", json=base | {"email": "sem-arroba"}).status_code == 422
    assert c.post("/conta/cadastro", json=base | {"nome": "   "}).status_code == 422


def test_email_repetido_da_409_mesmo_com_caixa_diferente(novo_cliente):
    _cadastrar(novo_cliente(), email="ana@exemplo.com")
    r = novo_cliente().post(
        "/conta/cadastro",
        json={"email": "ANA@Exemplo.com", "nome": "Outra", "senha": SENHA, "maior_de_18": True},
    )
    assert r.status_code == 409


def test_entrar_sair_e_mensagem_unica_para_login_errado(novo_cliente):
    _cadastrar(novo_cliente())
    c = novo_cliente()
    errada = c.post("/conta/entrar", json={"email": "ana@exemplo.com", "senha": "x" * 9})
    sem_conta = c.post("/conta/entrar", json={"email": "ninguem@exemplo.com", "senha": SENHA})
    assert errada.status_code == sem_conta.status_code == 401
    assert errada.json() == sem_conta.json()
    certa = c.post("/conta/entrar", json={"email": "ANA@exemplo.com", "senha": SENHA})
    assert certa.status_code == 200
    assert c.get("/conta/eu").status_code == 200
    assert c.post("/conta/sair").status_code == 204
    assert c.get("/conta/eu").status_code == 401


def test_sessao_expirada_nao_vale(conn, novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    conn.execute("reset role")
    conn.execute("update app.sessao set expira_em = now() - interval '1 minute'")
    conn.execute("set role meubizu_app")
    assert ana.get("/conta/eu").status_code == 401


def test_papel_da_api_nao_le_usuario_nem_sessao_direto(conn, novo_cliente):
    _cadastrar(novo_cliente())
    for tabela in ("app.usuario", "app.sessao"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
            conn.execute(f"select * from {tabela}")


def test_senha_fica_so_como_hash_argon2(conn, novo_cliente):
    _cadastrar(novo_cliente())
    conn.execute("reset role")
    (hash_guardado,) = conn.execute("select senha_hash from app.usuario").fetchone()
    conn.execute("set role meubizu_app")
    assert hash_guardado.startswith("$argon2") and SENHA not in hash_guardado


# ---------------------------------------------------------------- provas


def test_gravar_prova_corrige_e_nunca_devolve_gabarito(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    r = ana.post("/provas", json=_prova(folha="abc"))
    assert r.status_code == 201, r.text
    corpo = r.json()
    # só o item 10 tem estatística (gabarito A); os outros dois ficam como não avaliados
    assert (corpo["acertos"], corpo["avaliadas"], corpo["anuladas"]) == (1, 1, 2)
    assert (
        corpo["referencia"] == "decil" and corpo["decil"] == 10
    )  # 1 acerto = esperado do decil 10
    assert "gabarito" not in r.text.lower()
    (h,) = corpo["habilidades"]
    assert (h["habilidade"], h["n"], h["acertos"], h["selo"]) == (5, 1, 1, "poucos itens")
    assert h["descricao"] == "Desc"


def test_com_nota_o_decil_vem_da_nota(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    corpo = ana.post("/provas", json=_prova(nota=345.0)).json()
    assert corpo["decil"] == 1 and corpo["origem"] == "decil da nota informada"
    assert corpo["habilidades"][0]["esperado"] == pytest.approx(0.1)


def test_caderno_sem_estatistica_usa_a_tri(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    r = ana.post("/provas", json=_prova(area="LC", co_prova=20, lingua=0, folha="AC"))
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert corpo["referencia"] == "tri" and corpo["decil"] is None
    assert (corpo["acertos"], corpo["avaliadas"]) == (2, 2)
    assert corpo["habilidades"][0]["habilidade"] == 2


@pytest.mark.parametrize(
    ("mudancas", "status", "trecho"),
    [
        ({"co_prova": 999}, 404, "não encontrado"),
        ({"co_prova": 8}, 409, "ambíguo"),
        ({"co_prova": 9}, 409, "adaptado"),
        ({"folha": "AB"}, 422, "3 respostas"),
        ({"folha": "ABX"}, 422, "folha"),
        ({"area": "LC", "co_prova": 20, "folha": "AC"}, 422, "língua"),
        ({"tipo": "simulado"}, 422, "data"),
        ({"tipo": "simulado", "feita_em": str(date.today() + timedelta(days=1))}, 422, "futuro"),
        ({"nota": 1200}, 422, ""),
    ],
)
def test_prova_invalida_nao_grava_nada(novo_cliente, mudancas, status, trecho):
    ana = novo_cliente()
    _cadastrar(ana)
    r = ana.post("/provas", json=_prova(**mudancas))
    assert r.status_code == status and trecho in r.text
    assert ana.get("/provas").json() == []


def test_historico_em_ordem_de_data_e_exclusao_com_auditoria(conn, novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    criada = ana.post("/provas", json=_prova()).json()
    ana.post("/provas", json=_prova(tipo="simulado", feita_em="2025-03-10", folha="BBB"))
    # Enem sem data conta como 15/11 do ano da prova: vem antes do simulado de 2025
    assert [p["tipo"] for p in ana.get("/provas").json()] == ["enem", "simulado"]
    assert ana.delete(f"/provas/{criada['id']}").status_code == 204
    assert ana.get(f"/provas/{criada['id']}").status_code == 404
    assert ana.delete(f"/provas/{criada['id']}").status_code == 404
    acoes = [a for (a,) in conn.execute("select acao from app.auditoria order by id")]
    assert acoes == ["criar_prova", "criar_prova", "excluir_prova"]


def test_perfil_junta_provas_e_filtra_por_area(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    ana.post("/provas", json=_prova(nota=345.0))
    ana.post("/provas", json=_prova(folha="BBB", nota=345.0))
    ana.post("/provas", json=_prova(area="LC", co_prova=20, lingua=1, folha="BC"))
    tudo = ana.get("/perfil").json()
    assert len(tudo["provas"]) == 3
    assert {(h["area"], h["habilidade"]) for h in tudo["habilidades"]} == {("MT", 5), ("LC", 2)}
    mt = next(h for h in tudo["habilidades"] if h["area"] == "MT")
    assert (mt["n"], mt["acertos"]) == (2, 1)
    so_mt = ana.get("/perfil", params={"area": "MT"}).json()
    assert len(so_mt["provas"]) == 2 and {h["area"] for h in so_mt["habilidades"]} == {"MT"}
    assert ana.get("/perfil", params={"area": "XX"}).status_code == 422


# ---------------------------------------------------------------- nota estimada e edição


def test_nota_estimada_sai_dos_acertos_e_nao_depende_da_nota_informada(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    sem_nota = ana.post("/provas", json=_prova(folha="AAA")).json()
    com_nota = ana.post("/provas", json=_prova(folha="AAA", nota=345.0)).json()
    assert 200 < sem_nota["nota_estimada"] < 1000
    assert com_nota["nota_estimada"] == pytest.approx(sem_nota["nota_estimada"])
    assert com_nota["decil"] == 1 and sem_nota["decil"] != com_nota["decil"]


def test_nota_estimada_sobe_com_os_acertos(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    um = ana.post("/provas", json=_prova(folha="AAA")).json()["nota_estimada"]
    dois = ana.post("/provas", json=_prova(folha="ABA")).json()["nota_estimada"]
    assert dois > um


def test_nota_estimada_fica_vazia_quando_a_tri_nao_separa(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    assert ana.post("/provas", json=_prova(folha="ABC")).json()["nota_estimada"] is None  # tudo
    assert ana.post("/provas", json=_prova(folha="...")).json()["nota_estimada"] is None  # nada


def test_nota_estimada_tambem_vale_no_caderno_sem_respondentes(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    r = ana.post("/provas", json=_prova(area="LC", co_prova=20, lingua=0, folha="AA")).json()
    assert r["referencia"] == "tri" and 200 < r["nota_estimada"] < 1000


def test_editar_prova_recalcula_e_audita(conn, novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    criada = ana.post("/provas", json=_prova(folha="AAA")).json()
    r = ana.put(f"/provas/{criada['id']}", json=_prova(folha="ABA", nota=345.0))
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["id"] == criada["id"] and corpo["nota"] == 345.0
    assert corpo["nota_estimada"] > criada["nota_estimada"]
    assert ana.get(f"/provas/{criada['id']}").json()["nota_estimada"] == corpo["nota_estimada"]
    assert len(ana.get("/provas").json()) == 1
    acoes = [a for (a,) in conn.execute("select acao from app.auditoria order by id")]
    assert acoes == ["criar_prova", "editar_prova"]
    (detalhe,) = conn.execute("select detalhe from app.auditoria where acao = 'editar_prova'")
    assert detalhe[0]["antes"]["folha"] == "AAA" and detalhe[0]["depois"]["folha"] == "ABA"


def test_ver_prova_devolve_a_folha_do_proprio_aluno_para_editar(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    criada = ana.post("/provas", json=_prova(folha="a.*")).json()
    assert criada["folha"] == "A.*"
    assert ana.get(f"/provas/{criada['id']}").json()["folha"] == "A.*"
    assert "folha" not in ana.get("/provas").json()[0]  # a lista fica leve


def test_editar_com_dado_invalido_nao_muda_nada(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    criada = ana.post("/provas", json=_prova(folha="AAA")).json()
    for ruim in ({"folha": "AB"}, {"co_prova": 8}, {"co_prova": 999}, {"folha": "ABX"}):
        r = ana.put(f"/provas/{criada['id']}", json=_prova(**ruim))
        assert r.status_code in (404, 409, 422)
    depois = ana.get(f"/provas/{criada['id']}").json()
    assert depois["acertos"] == criada["acertos"]
    assert ana.put(f"/provas/{criada['id']}", json={}).status_code == 422


def test_editar_exige_login_e_prova_de_outro_da_404(conn, novo_cliente):
    ana, bruno = novo_cliente(), novo_cliente()
    _cadastrar(ana)
    _cadastrar(bruno, email="bruno@exemplo.com", nome="Bruno")
    da_ana = ana.post("/provas", json=_prova(folha="AAA")).json()["id"]
    assert novo_cliente().put(f"/provas/{da_ana}", json=_prova()).status_code == 401
    assert bruno.put(f"/provas/{da_ana}", json=_prova(folha="ABC")).status_code == 404
    assert ana.get(f"/provas/{da_ana}").json()["acertos"] == 1  # a folha da Ana não mudou
    assert bruno.get("/provas").json() == []
    acoes = [a for (a,) in conn.execute("select acao from app.auditoria")]
    assert "editar_prova" not in acoes


def test_perfil_resume_cada_area_com_a_variacao_da_nota(novo_cliente):
    ana = novo_cliente()
    _cadastrar(ana)
    ana.post("/provas", json=_prova(folha="AAA", tipo="simulado", feita_em="2025-01-10"))
    ana.post("/provas", json=_prova(folha="ABA", tipo="simulado", feita_em="2025-02-10"))
    ana.post("/provas", json=_prova(area="LC", co_prova=20, lingua=0, folha="AA"))
    areas = {a["area"]: a for a in ana.get("/perfil").json()["areas"]}
    assert set(areas) == {"MT", "LC"}
    mt = areas["MT"]
    assert mt["provas"] == 2 and mt["ultima"] > mt["anterior"]
    assert mt["variacao"] == pytest.approx(mt["ultima"] - mt["anterior"])
    assert areas["LC"]["provas"] == 1 and areas["LC"]["variacao"] is None
    so_lc = ana.get("/perfil", params={"area": "LC"}).json()["areas"]
    assert [a["area"] for a in so_lc] == ["LC"]


# ---------------------------------------------------------------- isolamento (RLS)


def test_aluno_nao_ve_nem_apaga_prova_de_outro(novo_cliente):
    ana, bruno = novo_cliente(), novo_cliente()
    _cadastrar(ana)
    _cadastrar(bruno, email="bruno@exemplo.com", nome="Bruno")
    da_ana = ana.post("/provas", json=_prova()).json()["id"]

    assert bruno.get("/provas").json() == []
    assert bruno.get(f"/provas/{da_ana}").status_code == 404
    assert bruno.delete(f"/provas/{da_ana}").status_code == 404
    assert bruno.get("/perfil").json() == {"provas": [], "areas": [], "habilidades": []}

    assert ana.get(f"/provas/{da_ana}").status_code == 200  # a da Ana continua lá
    assert len(ana.get("/provas").json()) == 1


def test_rls_no_banco_filtra_leitura_e_barra_escrita_em_nome_de_outro(conn, novo_cliente):
    ana, bruno = novo_cliente(), novo_cliente()
    id_ana = _cadastrar(ana)["id"]
    id_bruno = _cadastrar(bruno, email="bruno@exemplo.com", nome="Bruno")["id"]
    ana.post("/provas", json=_prova())

    def contar(usuario, tabela):
        conn.execute("select set_config('app.usuario_id', %s, true)", (usuario,))
        return conn.execute(f"select count(*) from {tabela}").fetchone()[0]

    assert contar(id_ana, "app.prova") == 1 and contar(id_bruno, "app.prova") == 0
    assert contar(id_ana, "app.auditoria") == 1 and contar(id_bruno, "app.auditoria") == 0
    assert contar("", "app.prova") == 0  # sem usuário na sessão, nada aparece

    conn.execute("select set_config('app.usuario_id', %s, true)", (id_bruno,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute(
            "insert into app.prova (usuario_id, ano, area, co_prova, tipo, folha) "
            "values (%s, 2023, 'MT', 7, 'enem', 'ABC')",
            (id_ana,),
        )
    conn.execute("update app.prova set folha = 'CCC'")  # Bruno não tem linha: afeta 0
    conn.execute("delete from app.prova")
    conn.execute("select set_config('app.usuario_id', %s, true)", (id_ana,))
    assert conn.execute("select folha from app.prova").fetchone()[0] == "ABC"
