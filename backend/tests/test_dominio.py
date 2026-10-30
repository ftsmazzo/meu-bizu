from app.dominio import opcoes_de_caderno, ordem_do_caderno


def _item(posicao, co_item, lingua=None, gabarito="A"):
    return {
        "co_prova": 1,
        "posicao": posicao,
        "co_item": co_item,
        "tp_lingua": lingua,
        "gabarito": gabarito,
    }


def test_ordem_simples_segue_a_posicao():
    itens = [_item(3, 30), _item(1, 10), _item(2, 20)]
    ordem = ordem_do_caderno(itens, "MT")
    assert [(o["idx"], o["co_item"]) for o in ordem] == [(1, 10), (2, 20), (3, 30)]


def test_ordem_de_linguagens_poe_ingles_espanhol_e_depois_os_comuns():
    itens = [
        _item(6, 60),
        _item(1, 11, lingua=0),
        _item(1, 21, lingua=1),
        _item(2, 12, lingua=0),
        _item(2, 22, lingua=1),
        _item(7, 70),
    ]
    ordem = ordem_do_caderno(itens, "LC")
    assert [o["co_item"] for o in ordem] == [11, 12, 21, 22, 60, 70]
    assert [o["lingua"] for o in ordem] == [0, 0, 1, 1, None, None]


def test_caderno_com_dois_itens_na_mesma_posicao_e_ambiguo():
    assert ordem_do_caderno([_item(1, 10), _item(1, 11), _item(2, 20)], "MT") == []


def test_opcoes_de_caderno_marca_o_que_nao_da_para_escolher():
    cadernos = [
        {
            "co_prova": 1,
            "cor": "AZUL",
            "adaptado": False,
            "ambiguo": False,
            "tem_respondentes": True,
        },
        {
            "co_prova": 2,
            "cor": "ROSA",
            "adaptado": False,
            "ambiguo": False,
            "tem_respondentes": False,
        },
        {
            "co_prova": 3,
            "cor": "LARANJA",
            "adaptado": True,
            "ambiguo": False,
            "tem_respondentes": True,
        },
        {
            "co_prova": 4,
            "cor": "VERDE",
            "adaptado": False,
            "ambiguo": True,
            "tem_respondentes": True,
        },
    ]
    opcoes = {o["co_prova"]: o for o in opcoes_de_caderno(cadernos)}
    assert opcoes[1]["referencia"] == "decil" and opcoes[1]["selecionavel"] is True
    assert opcoes[2]["referencia"] == "tri" and opcoes[2]["selecionavel"] is True
    assert opcoes[3]["selecionavel"] is False and "adaptado" in opcoes[3]["motivo"]
    assert opcoes[4]["selecionavel"] is False and "ambíguo" in opcoes[4]["motivo"]
    assert opcoes[1]["rotulo"] == "AZUL (código 1)"
