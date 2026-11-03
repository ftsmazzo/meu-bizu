"""Raio-X pela nota: o núcleo (funções puras) e a rota, com dados sintéticos."""

import json

import pytest
from fastapi.testclient import TestClient

from app.carga_ref import carregar_ref
from app.db import get_conn
from app.main import app
from app.raiox import analisar_area, cruzar

SENHA = "uma-senha-boa-123"

CORTES = [{"decil": d, "nota_max": 340 + 40 * d} for d in range(1, 11)]
ITENS = [
    {"co_item": 1, "habilidade": 5, "a": 1.5, "b": -2.0, "c": 0.2},  # fácil: segura
    {"co_item": 2, "habilidade": 5, "a": 1.5, "b": 0.0, "c": 0.2},  # no meio
    {"co_item": 3, "habilidade": 7, "a": 1.5, "b": 0.3, "c": 0.2},  # no meio, mais difícil
    {"co_item": 4, "habilidade": 7, "a": 1.5, "b": 4.0, "c": 0.2},  # muito difícil
]


# ---------------------------------------------------------------- núcleo


def test_decil_alvo_e_a_frente_de():
    r = analisar_area(500, ITENS, CORTES)
    assert r["decil"] == 4 and r["a_frente_de"] == 30
    assert r["alvo"] == 520  # meio do decil seguinte (nota_max 500 e 540)
    topo = analisar_area(1000, ITENS, CORTES)
    assert topo["decil"] == 10 and topo["alvo"] is None


def test_sem_cortes_nao_ha_decil_nem_alvo():
    r = analisar_area(500, ITENS, [])
    assert r["decil"] is None and r["a_frente_de"] is None and r["alvo"] is None
    assert r["foco"] == []


def test_faixas_somam_o_total_e_separam_segura_alcance_e_dificil():
    r = analisar_area(500, ITENS, CORTES)
    assert r["total"] == 4
    assert sum(r["faixas"].values()) == 4
    assert r["faixas"]["seguras"] == 1 and r["faixas"]["dificeis"] == 1
    assert [q["co_item"] for q in r["alcance"]] == [2, 3]  # da mais provável para a menos
    assert all(40 <= q["chance"] < 75 for q in r["alcance"])


def test_foco_ordena_pelo_ganho_de_acertos_no_proximo_degrau():
    r = analisar_area(400, ITENS, CORTES)  # decil 2: o próximo degrau fica 20 pontos acima
    ganhos = [h["ganho"] for h in r["foco"]]
    assert ganhos == sorted(ganhos, reverse=True)
    h7 = next(h for h in r["foco"] if h["habilidade"] == 7)
    assert h7["n"] == 2 and h7["alvo"] > h7["esperado"]
    assert r["esperado"] == pytest.approx(sum(h["esperado"] for h in r["foco"]), abs=0.2)


def test_acerto_observado_do_decil_vale_mais_que_a_tri_e_o_degrau_usa_o_decil_seguinte():
    observado = {
        4: {1: 0.90, 2: 0.30, 3: 0.30, 4: 0.30},
        5: {1: 1.00, 2: 0.60, 3: 0.35, 4: 0.30},
    }
    r = analisar_area(500, ITENS, CORTES, observado)  # decil 4
    assert r["esperado"] == pytest.approx(1.8, abs=0.05)
    assert r["faixas"] == {"seguras": 1, "alcance": 0, "dificeis": 3}
    h5 = next(h for h in r["foco"] if h["habilidade"] == 5)
    assert (h5["esperado"], h5["alvo"], h5["ganho"]) == (1.2, 1.6, 0.4)
    # item sem dado observado cai na TRI em vez de sumir
    parcial = analisar_area(500, ITENS, CORTES, {4: {1: 0.9}})
    assert parcial["total"] == 4 and parcial["esperado"] > 0.9


def test_nota_maior_espera_mais_acertos():
    baixa, alta = analisar_area(400, ITENS, CORTES), analisar_area(700, ITENS, CORTES)
    assert alta["esperado"] > baixa["esperado"]


def test_nota_estimada_fica_vazia_quando_os_acertos_nao_passam_do_chute():
    from app.correcao import _nota_estimada

    # dois itens com 50% de acerto ao acaso: o piso do chute é 1 acerto
    parametros = {i: {"a": 1.0, "b": 0.0, "c": 0.5} for i in (1, 2, 3)}
    gabaritos = {1: "A", 2: "A", 3: "A"}
    assert _nota_estimada(parametros, gabaritos, {1: "A", 2: "B", 3: "B"}) is None  # 1 <= 1,5
    assert _nota_estimada(parametros, gabaritos, {1: "A", 2: "A", 3: "B"}) is not None  # 2 > 1,5


GABARITOS = {1: "A", 2: "A", 3: "C", 4: "D"}


def _cruzar(nota, respostas, gabaritos=GABARITOS):
    return cruzar(ITENS, analisar_area(nota, ITENS, CORTES)["chances"], respostas, gabaritos)


def test_cruzar_diz_o_que_o_aluno_fez_e_acha_os_erros_evitaveis():
    c = _cruzar(500, {1: "B", 2: "A", 3: "C", 4: "."})
    assert c["resultados"] == {1: "errou", 2: "acertou", 3: "acertou", 4: "em_branco"}
    assert (c["acertos"], c["avaliadas"]) == (2, 4)
    # só o item 1 é "segura" para quem tem 500 e foi errado; o difícil em branco não é evitável
    assert c["evitaveis_total"] == 1 and c["evitaveis"][0]["co_item"] == 1
    assert c["evitaveis"][0]["chance"] >= 75 and c["evitaveis"][0]["resultado"] == "errou"
    assert c["habilidades"] == {5: {"n": 2, "acertos": 1}, 7: {"n": 2, "acertos": 1}}


def test_cruzar_ignora_anulada_e_questao_fora_da_prova_do_aluno():
    sem_gabarito = {1: "A", 2: "A", 3: "C", 4: "X"}  # item 4 anulado
    assert _cruzar(500, {1: "A", 2: "A", 3: "C", 4: "D"}, sem_gabarito)["avaliadas"] == 3
    assert _cruzar(500, {1: "A", 2: "A"})["avaliadas"] == 2  # o aluno não tem 3 e 4


def test_cruzar_le_acima_dentro_e_abaixo_do_esperado():
    assert _cruzar(400, {1: "A", 2: "A", 3: "C", 4: "D"})["leitura"] == "acima"
    assert _cruzar(500, {1: "B", 2: "B", 3: "B", 4: "B"})["leitura"] == "abaixo"
    esperado = analisar_area(500, ITENS, CORTES)["esperado"]
    assert abs(esperado - 2) < 1.5  # 2 acertos de 4 ficam dentro do esperado para quem tem 500
    assert _cruzar(500, {1: "A", 2: "A", 3: "B", 4: "B"})["leitura"] == "dentro"


def test_cruzar_nao_devolve_gabarito():
    texto = json.dumps(_cruzar(500, {1: "B", 2: "A", 3: "C", 4: "."}))
    assert '"gabarito"' not in texto and '"D"' not in texto


# ---------------------------------------------------------------- rota


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


def test_raiox_exige_login(conn, ref_csv):
    carregar_ref(conn, ref_csv)
    conn.commit()
    conn.execute("set role meubizu_app")
    conn.commit()
    app.dependency_overrides[get_conn] = lambda: conn
    try:
        anonimo = TestClient(app, base_url="https://testserver")
        assert anonimo.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}}).status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_raiox_de_matematica(cliente):
    r = cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}})
    assert r.status_code == 200, r.text
    (mt,) = r.json()["areas"]
    assert (mt["area"], mt["nota"], mt["decil"], mt["total"]) == ("MT", 500, 4, 3)
    assert mt["alvo"] == 520 and mt["a_frente_de"] == 30
    assert mt["foco"][0]["habilidade"] == 5 and mt["foco"][0]["descricao"] == "Desc"
    assert "gabarito" not in json.dumps(r.json()).lower()


def _gravar(cliente, folha, ano=2023):
    corpo = {"ano": ano, "area": "MT", "co_prova": 7, "tipo": "enem", "folha": folha}
    assert cliente.post("/provas", json=corpo).status_code == 201


def test_raiox_sem_prova_incluida_nao_traz_cruzamento(cliente):
    (mt,) = cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}}).json()["areas"]
    assert mt["sua_prova"] is None
    assert all(q["resultado"] is None for q in mt["alcance"])
    assert all(h["seus_acertos"] is None for h in mt["foco"])


def test_raiox_cruza_com_a_prova_incluida_sem_vazar_gabarito(cliente):
    _gravar(cliente, "AAA")  # gabarito A, B, C: acerta só a primeira
    r = cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}})
    (mt,) = r.json()["areas"]
    sua = mt["sua_prova"]
    assert (sua["acertos"], sua["avaliadas"]) == (1, 3)
    assert sua["leitura"] in ("acima", "dentro", "abaixo") and sua["esperado"] > 0
    assert sua["perdidas_total"] >= len(sua["perdidas"])
    assert all(p["chance"] >= 75 and p["resultado"] == "errou" for p in sua["perdidas"])
    assert {q["resultado"] for q in mt["alcance"]} <= {"acertou", "errou", "em_branco"}
    assert mt["foco"][0]["seus_de"] == 3 and mt["foco"][0]["seus_acertos"] == 1
    assert "gabarito" not in json.dumps(r.json()).lower()


def test_raiox_acertando_tudo_nao_tem_perdidas(cliente):
    _gravar(cliente, "ABC")
    (mt,) = cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}}).json()["areas"]
    assert mt["sua_prova"]["acertos"] == 3 and mt["sua_prova"]["perdidas_total"] == 0


def test_raiox_cruzamento_so_olha_as_provas_do_proprio_aluno(conn, cliente):
    _gravar(cliente, "ABC")
    outro = TestClient(app, base_url="https://testserver")
    r = outro.post(
        "/conta/cadastro",
        json={"email": "bruno@exemplo.com", "nome": "B", "senha": SENHA, "maior_de_18": True},
    )
    assert r.status_code == 201
    (mt,) = outro.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}}).json()["areas"]
    assert mt["sua_prova"] is None


def test_raiox_gerado_fica_guardado_um_por_ano_e_o_ultimo_substitui(cliente):
    assert cliente.get("/raio-x/salvos").json() == []
    cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}, "uf": "SP"})
    cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 600}})
    (salvo,) = cliente.get("/raio-x/salvos").json()
    assert salvo["ano"] == 2023 and salvo["notas"] == {"MT": 600}
    assert salvo["uf"] is None and salvo["lingua"] is None and salvo["atualizado_em"]


def test_raiox_que_falha_nao_e_guardado(cliente):
    assert cliente.post("/raio-x", json={"ano": 2023, "notas": {"CH": 500}}).status_code == 404
    assert cliente.get("/raio-x/salvos").json() == []


def test_raiox_guardado_e_privado_de_cada_aluno(cliente):
    cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}})
    outro = TestClient(app, base_url="https://testserver")
    outro.post(
        "/conta/cadastro",
        json={"email": "bruno@exemplo.com", "nome": "B", "senha": SENHA, "maior_de_18": True},
    ).raise_for_status()
    assert outro.get("/raio-x/salvos").json() == []
    assert len(cliente.get("/raio-x/salvos").json()) == 1


def test_raiox_salvos_exige_login(conn, ref_csv):
    carregar_ref(conn, ref_csv)
    conn.commit()
    conn.execute("set role meubizu_app")
    conn.commit()
    app.dependency_overrides[get_conn] = lambda: conn
    try:
        assert (
            TestClient(app, base_url="https://testserver").get("/raio-x/salvos").status_code == 401
        )
    finally:
        app.dependency_overrides.clear()


def test_raiox_devolve_o_texto_da_questao_que_esta_ao_alcance(cliente):
    (mt,) = cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 500}}).json()["areas"]
    com_texto = [q for q in mt["alcance"] if q["questao"]]
    assert all(q["questao"]["enunciado"] for q in com_texto)


def test_raiox_linguagens_pede_a_lingua_e_conta_so_o_bloco_dela(cliente):
    sem = cliente.post("/raio-x", json={"ano": 2023, "notas": {"LC": 500}})
    assert sem.status_code == 422 and "língua" in sem.text
    corpo = {"ano": 2023, "notas": {"LC": 500}, "lingua": 0}
    (lc,) = cliente.post("/raio-x", json=corpo).json()["areas"]
    assert lc["total"] == 2 and lc["decil"] is None  # itens 101 (inglês) e 103 (comum)


def test_raiox_com_varias_areas_vem_na_ordem_fixa(cliente):
    r = cliente.post("/raio-x", json={"ano": 2023, "notas": {"MT": 600, "LC": 480}, "lingua": 1})
    assert [a["area"] for a in r.json()["areas"]] == ["LC", "MT"]


@pytest.mark.parametrize(
    ("corpo", "status"),
    [
        ({"ano": 2023, "notas": {}}, 422),
        ({"ano": 2023, "notas": {"MT": 1200}}, 422),
        ({"ano": 2023, "notas": {"MT": -1}}, 422),
        ({"ano": 2023, "notas": {"XX": 500}}, 422),
        ({"ano": 2023, "notas": {"CH": 500}}, 404),  # sem dados dessa área no ano
        ({"ano": 2030, "notas": {"MT": 500}}, 404),
    ],
)
def test_raiox_recusa_entrada_invalida(cliente, corpo, status):
    assert cliente.post("/raio-x", json=corpo).status_code == status
