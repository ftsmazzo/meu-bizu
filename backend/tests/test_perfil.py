"""Conta da prova e perfil por habilidade (funções puras)."""

import pytest

from app.perfil import (
    Avaliacao,
    decil_da_nota,
    decil_estimado,
    esperado_tri,
    nota_por_acertos,
    perfil_do_aluno,
    respostas_da_folha,
    selo,
)

CORTES = [{"decil": d, "nota_max": 340 + 40 * d} for d in range(1, 11)]


def test_decil_da_nota_e_as_pontas():
    assert decil_da_nota(CORTES, 379) == 1
    assert decil_da_nota(CORTES, 381) == 2
    assert decil_da_nota(CORTES, 100) == 1  # abaixo da faixa: decil 1
    assert decil_da_nota(CORTES, 990) == 10  # acima da faixa: decil 10


def test_decil_estimado_escolhe_o_total_mais_proximo():
    assert decil_estimado(5, {1: 2.0, 2: 4.0, 3: 6.5}) == 2
    assert decil_estimado(3, {1: 2.0, 2: 4.0}) == 1  # empate: o menor decil


def test_esperado_tri_fica_entre_o_acaso_e_um_e_cresce_com_a_nota():
    a, b, c = 1.2, 0.3, 0.2
    notas = [200, 400, 600, 800, 1000]
    p = [esperado_tri(a, b, c, n) for n in notas]
    assert all(c <= x <= 1 for x in p) and p == sorted(p)


def test_nota_por_acertos_cresce_com_os_acertos():
    itens = [(1.0, 0.0, 0.2)] * 10
    notas = [nota_por_acertos(itens, k) for k in (3, 5, 8)]
    assert notas == sorted(notas) and notas[0] < notas[-1]


def _caderno_mt():
    return [
        {"co_prova": 7, "posicao": p, "co_item": 10 * p, "tp_lingua": None, "gabarito": "A"}
        for p in (3, 1, 2)
    ]


def test_folha_vira_respostas_na_ordem_do_caderno():
    assert respostas_da_folha("abc", _caderno_mt(), "MT") == {10: "A", 20: "B", 30: "C"}
    assert respostas_da_folha(".*E", _caderno_mt(), "MT") == {10: ".", 20: "*", 30: "E"}


def test_folha_com_tamanho_errado_ou_caderno_ambiguo_e_recusada():
    with pytest.raises(ValueError, match="3 respostas"):
        respostas_da_folha("AB", _caderno_mt(), "MT")
    ambiguo = _caderno_mt() + [{"co_prova": 7, "posicao": 1, "co_item": 99, "tp_lingua": None}]
    with pytest.raises(ValueError, match="ambíguo"):
        respostas_da_folha("ABCD", ambiguo, "MT")


def test_linguagens_exige_a_lingua_e_filtra_o_bloco():
    lc = [
        {"co_prova": 20, "posicao": 1, "co_item": 101, "tp_lingua": 0, "gabarito": "A"},
        {"co_prova": 20, "posicao": 1, "co_item": 102, "tp_lingua": 1, "gabarito": "B"},
        {"co_prova": 20, "posicao": 6, "co_item": 103, "tp_lingua": None, "gabarito": "C"},
    ]
    with pytest.raises(ValueError, match="língua"):
        respostas_da_folha("AC", lc, "LC")
    assert respostas_da_folha("AC", lc, "LC", 0) == {101: "A", 103: "C"}
    assert respostas_da_folha("BC", lc, "LC", 1) == {102: "B", 103: "C"}


@pytest.mark.parametrize(
    ("n", "z", "esperado"),
    [
        (2, -5.0, "poucos itens"),
        (4, None, "poucos itens"),
        (4, -2.0, "firme"),
        (4, -1.5, "indicativo"),
        (4, -1.0, "indicativo"),
        (4, -0.9, "sem sinal"),
        (4, 1.0, "sem sinal"),
    ],
)
def test_selo(n, z, esperado):
    assert selo(n, z) == esperado


def _av(respostas, itens, esperado, area="MT"):
    return Avaliacao(
        ano=2023,
        area=area,
        co_prova=7,
        referencia="decil",
        origem="",
        decil=5,
        nota_ref=None,
        acertos=0,
        avaliadas=len(itens),
        anuladas=0,
        respostas=respostas,
        itens=itens,
        esperado=esperado,
    )


def _item(habilidade, gabarito="A", armadilha=False, distrator=None):
    return {
        "habilidade": habilidade,
        "gabarito": gabarito,
        "armadilha": armadilha,
        "distrator_dominante": distrator,
    }


def test_lacuna_firme_quando_erra_o_que_se_esperava_acertar():
    itens = {i: _item(1) for i in range(1, 5)} | {i: _item(2) for i in (5, 6)}
    respostas = dict.fromkeys(range(1, 7), "B")  # errou tudo
    esperado = dict.fromkeys(range(1, 7), 0.8)
    linhas = perfil_do_aluno([_av(respostas, itens, esperado)])
    h1, h2 = linhas[0], linhas[1]
    assert (h1["habilidade"], h1["n"], h1["acertos"]) == (1, 4, 0)
    assert h1["lacuna"] == pytest.approx(-0.8)
    assert h1["z"] == pytest.approx(-4.0) and h1["selo"] == "firme"
    assert h2["habilidade"] == 2 and h2["z"] is None and h2["selo"] == "poucos itens"


def test_ordena_da_maior_lacuna_para_a_menor():
    itens = {1: _item(1), 2: _item(1), 3: _item(1), 4: _item(2), 5: _item(2), 6: _item(2)}
    respostas = {1: "B", 2: "B", 3: "B", 4: "A", 5: "A", 6: "A"}
    linhas = perfil_do_aluno([_av(respostas, itens, dict.fromkeys(itens, 0.5))])
    assert [linha["habilidade"] for linha in linhas] == [1, 2]
    assert linhas[0]["lacuna"] < 0 < linhas[1]["lacuna"]


def test_conta_armadilha_so_quando_marcou_o_distrator_dominante():
    itens = {
        1: _item(1, armadilha=True, distrator="C"),
        2: _item(1, armadilha=True, distrator="C"),
        3: _item(1, armadilha=False, distrator="C"),
    }
    respostas = {1: "C", 2: "D", 3: "C"}
    (linha,) = perfil_do_aluno([_av(respostas, itens, dict.fromkeys(itens, 0.5))])
    assert linha["armadilhas"] == 1 and linha["acertos"] == 0


def test_a_mesma_prova_feita_duas_vezes_nao_se_mistura():
    itens = {1: _item(1), 2: _item(1), 3: _item(1)}
    certa = _av(dict.fromkeys(itens, "A"), itens, dict.fromkeys(itens, 0.2))
    errada = _av(dict.fromkeys(itens, "B"), itens, dict.fromkeys(itens, 0.9))
    (linha,) = perfil_do_aluno([certa, errada])
    assert linha["n"] == 6 and linha["acertos"] == 3
    assert linha["esperado"] == pytest.approx(0.55)


def test_item_sem_esperado_ou_sem_habilidade_fica_fora():
    itens = {1: _item(1), 2: _item(None), 3: _item(1)}
    linhas = perfil_do_aluno([_av({1: "A", 2: "A", 3: "A"}, itens, {1: 0.5, 2: 0.5})])
    assert [(linha["habilidade"], linha["n"]) for linha in linhas] == [(1, 1)]
