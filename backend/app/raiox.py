"""Raio-X pela nota: o que se espera de quem tem a sua nota numa área, sem as marcações.

É uma descrição, não um diagnóstico. A chance de acerto de cada questão sai da TRI na nota do
aluno (a mesma conta da correção, validada contra o acerto observado por decil). O "próximo
degrau" é o meio do decil seguinte: as habilidades em que a chance mais cresce até lá são o
melhor lugar para investir. Funções puras, sem banco.
"""

from app.perfil import decil_da_nota, esperado_tri

SEGURA = 0.75  # a partir daqui o aluno tende a acertar
ALCANCE = 0.40  # entre ALCANCE e SEGURA: vale revisar, é onde mais se ganha
MAX_FOCO = 8
MAX_ALCANCE = 5


def _proximo_degrau(cortes: list[dict], decil: int) -> float | None:
    """Meio do decil seguinte (entre o teto dele e o teto do decil seguinte a ele)."""
    teto = {c["decil"]: c["nota_max"] for c in cortes}
    if decil + 1 not in teto:
        return None
    return (teto[decil] + teto[decil + 1]) / 2


def analisar_area(
    nota: float,
    itens: list[dict],
    cortes: list[dict],
    observado: dict[int, dict[int, float]] | None = None,
) -> dict:
    """`itens`: {co_item, habilidade, a, b, c} da prova do ano; `cortes`: {decil, nota_max};
    `observado`: acerto real por decil ({decil: {co_item: taxa}}), que vale mais que a TRI.
    Item sem dado observado cai na TRI. Sem decil (sem cortes) só há a TRI."""
    observado = observado or {}
    decil = decil_da_nota(cortes, nota) if cortes else None
    alvo = _proximo_degrau(cortes, decil) if decil is not None else None

    def chance(i: dict, no_decil: int | None, na_nota: float) -> float:
        p = observado.get(no_decil, {}).get(i["co_item"]) if no_decil is not None else None
        return p if p is not None else esperado_tri(i["a"], i["b"], i["c"], na_nota)

    chances = {i["co_item"]: chance(i, decil, nota) for i in itens}
    faixas = {
        "seguras": sum(p >= SEGURA for p in chances.values()),
        "alcance": sum(ALCANCE <= p < SEGURA for p in chances.values()),
        "dificeis": sum(p < ALCANCE for p in chances.values()),
    }
    no_alcance = sorted(
        (i for i in itens if ALCANCE <= chances[i["co_item"]] < SEGURA),
        key=lambda i: -chances[i["co_item"]],
    )[:MAX_ALCANCE]

    foco = []
    if alvo is not None:
        grupos: dict[int, dict] = {}
        for i in itens:
            g = grupos.setdefault(i["habilidade"], {"n": 0, "esperado": 0.0, "alvo": 0.0})
            g["n"] += 1
            g["esperado"] += chances[i["co_item"]]
            g["alvo"] += chance(i, decil + 1, alvo)
        for habilidade, g in grupos.items():
            foco.append(
                {
                    "habilidade": habilidade,
                    "n": g["n"],
                    "esperado": round(g["esperado"], 1),
                    "alvo": round(g["alvo"], 1),
                    "ganho": round(g["alvo"] - g["esperado"], 1),
                }
            )
        foco = sorted(foco, key=lambda h: -h["ganho"])[:MAX_FOCO]

    return {
        "decil": decil,
        "a_frente_de": None if decil is None else (decil - 1) * 10,
        "alvo": alvo,
        "total": len(itens),
        "esperado": round(sum(chances.values()), 1),
        "faixas": faixas,
        "foco": foco,
        "alcance": [
            {
                "co_item": i["co_item"],
                "habilidade": i["habilidade"],
                "chance": round(chances[i["co_item"]] * 100),
            }
            for i in no_alcance
        ],
    }
