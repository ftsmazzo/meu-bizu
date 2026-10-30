"""Regras de domínio sobre cadernos: ordem das questões e o que a tela pode oferecer.

A posição k da folha do aluno é o k-ésimo item do caderno. Em Linguagens a folha tem, nesta
ordem: as questões de inglês, as de espanhol e as comuns, cada grupo na ordem de `posicao`;
o aluno responde só o bloco da língua dele mais as comuns.
"""


def ordem_do_caderno(itens: list[dict], area: str) -> list[dict]:
    """Posição k da folha -> item. `itens` são as linhas de item_caderno de um caderno.
    Devolve [] se dois itens dividem a mesma posição (caderno ambíguo)."""
    por_posicao = sorted(itens, key=lambda i: i["posicao"])
    if area == "LC":
        chaves = [(i["posicao"], i["tp_lingua"]) for i in por_posicao]
    else:
        chaves = [i["posicao"] for i in por_posicao]
    if len(set(chaves)) != len(chaves):
        return []
    if area == "LC":
        grupos = [
            [i for i in por_posicao if i["tp_lingua"] == 0],
            [i for i in por_posicao if i["tp_lingua"] == 1],
            [i for i in por_posicao if i["tp_lingua"] is None],
        ]
    else:
        grupos = [por_posicao]
    saida = []
    for grupo in grupos:
        for i in grupo:
            saida.append(
                {
                    "co_prova": i["co_prova"],
                    "idx": len(saida) + 1,
                    "co_item": i["co_item"],
                    "gabarito": i["gabarito"],
                    "lingua": i["tp_lingua"],
                }
            )
    return saida


def opcoes_de_caderno(cadernos: list[dict]) -> list[dict]:
    """O que a tela oferece para escolher o caderno. `referencia`: 'decil' quando há
    respondentes nos microdados, 'tri' quando o esperado sai do modelo (reaplicação/PPL)."""
    saida = []
    for c in sorted(cadernos, key=lambda c: (c["cor"], c["co_prova"])):
        motivo = ""
        if c["adaptado"]:
            motivo = "caderno adaptado (ainda sem dados de referência próprios)"
        if c["ambiguo"]:
            motivo = "caderno ambíguo: o INEP lista dois itens por posição"
        saida.append(
            {
                "co_prova": c["co_prova"],
                "cor": c["cor"],
                "rotulo": f"{c['cor']} (código {c['co_prova']})",
                "referencia": "decil" if c["tem_respondentes"] else "tri",
                "selecionavel": not motivo,
                "motivo": motivo,
            }
        )
    return saida
