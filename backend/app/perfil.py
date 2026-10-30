"""Conta da prova e perfil por habilidade (funções puras, sem banco).

O método vem do laboratório de dados: o esperado de um item é o acerto observado no decil do
aluno (ou, sem respondentes no caderno, a TRI na nota dele). Lacuna negativa = o aluno acerta
menos que o esperado para o nível dele nessa habilidade, ou seja, onde focar. O `z` mede se a
lacuna passa do acaso: `z = (acertos - esperado) / sqrt(soma p(1-p))`, só com n >= 3.
"""

import math
from dataclasses import dataclass, field

from app.dominio import ordem_do_caderno


@dataclass
class Avaliacao:
    """O que se sabe de uma prova corrigida. `respostas`, `itens` e `esperado` são por co_item,
    dentro desta prova (a mesma prova refeita não se mistura com a anterior)."""

    ano: int
    area: str
    co_prova: int
    referencia: str  # 'decil' | 'tri'
    origem: str
    decil: int | None
    nota_ref: float | None
    acertos: int
    avaliadas: int
    anuladas: int
    respostas: dict[int, str]
    itens: dict[int, dict] = field(default_factory=dict)
    esperado: dict[int, float] = field(default_factory=dict)


def decil_da_nota(cortes: list[dict], nota: float) -> int:
    """Decil dos `cortes` ({decil, nota_max}) a que a nota pertence; as pontas absorvem notas
    fora da faixa."""
    ordenados = sorted(cortes, key=lambda c: c["decil"])
    for corte in ordenados:
        if nota <= corte["nota_max"]:
            return corte["decil"]
    return ordenados[-1]["decil"]


def decil_estimado(acertos: int, esperados: dict[int, float]) -> int:
    """Decil cujo total esperado de acertos (`esperados`: decil -> total) é o mais próximo."""
    return min(esperados, key=lambda d: (abs(esperados[d] - acertos), d))


def esperado_tri(a: float, b: float, c: float, nota: float) -> float:
    """Probabilidade de acerto pela TRI de 3 parâmetros, na escala do Enem
    (theta = (nota - 500) / 100). Conferida no laboratório contra o acerto observado por decil
    em 2023-2025: viés ~0, erro médio ~0,085 por item."""
    return c + (1 - c) / (1 + math.exp(-1.7 * a * ((nota - 500) / 100 - b)))


def nota_por_acertos(parametros: list[tuple[float, float, float]], acertos: int) -> float:
    """Nota (200-1000) em que o total esperado de acertos pela TRI iguala o do aluno, por
    bisecção. Aproximação por contagem simples, sem o padrão de coerência da TRI completa."""
    baixo, alto = 200.0, 1000.0
    for _ in range(40):
        meio = (baixo + alto) / 2
        if sum(esperado_tri(a, b, c, meio) for a, b, c in parametros) < acertos:
            baixo = meio
        else:
            alto = meio
    return (baixo + alto) / 2


def respostas_da_folha(
    folha: str, item_caderno: list[dict], area: str, lingua: int | None = None
) -> dict[int, str]:
    """Folha (uma letra por questão, '.' branco, '*' dupla) -> {co_item: marcada}.
    `item_caderno`: linhas de um único caderno. Levanta ValueError se não der para ligar."""
    ordem = ordem_do_caderno(item_caderno, area)
    if not ordem:
        raise ValueError("caderno ambíguo ou vazio: não dá para ligar posição a questão")
    if area == "LC":
        if lingua not in (0, 1):
            raise ValueError("em Linguagens informe a língua (0 inglês, 1 espanhol)")
        ordem = [o for o in ordem if o["lingua"] in (None, lingua)]
    if len(folha) != len(ordem):
        raise ValueError(f"o caderno tem {len(ordem)} respostas, a folha tem {len(folha)}")
    return {o["co_item"]: letra.upper() for o, letra in zip(ordem, folha, strict=True)}


def selo(n: int, z: float | None) -> str:
    """Quanto confiar na lacuna: poucos itens não dizem nada; z <= -2 é firme."""
    if n < 3 or z is None:
        return "poucos itens"
    if z <= -2:
        return "firme"
    if z <= -1:
        return "indicativo"
    return "sem sinal"


def perfil_do_aluno(avaliacoes: list[Avaliacao]) -> list[dict]:
    """Uma linha por (área, habilidade), juntando quantas provas vierem, da maior lacuna para a
    menor. Itens sem gabarito ou sem esperado ficam de fora."""
    grupos: dict[tuple[str, int], dict] = {}
    for av in avaliacoes:
        for co_item, marcada in av.respostas.items():
            item, p = av.itens.get(co_item), av.esperado.get(co_item)
            if item is None or p is None or item["habilidade"] is None:
                continue
            g = grupos.setdefault(
                (av.area, item["habilidade"]),
                {"area": av.area, "habilidade": item["habilidade"], "n": 0, "acertos": 0}
                | {"armadilhas": 0, "_esp": 0.0, "_var": 0.0},
            )
            g["n"] += 1
            g["_esp"] += p
            g["_var"] += p * (1 - p)
            if marcada == item["gabarito"]:
                g["acertos"] += 1
            elif item.get("armadilha") and marcada == item.get("distrator_dominante"):
                g["armadilhas"] += 1
    saida = []
    for g in grupos.values():
        soma_esp, variancia = g.pop("_esp"), g.pop("_var")
        n = g["n"]
        z = (g["acertos"] - soma_esp) / variancia**0.5 if variancia > 0 and n >= 3 else None
        taxa, esperado = g["acertos"] / n, soma_esp / n
        saida.append(
            {**g, "taxa": taxa, "esperado": esperado, "lacuna": taxa - esperado}
            | {"z": z, "selo": selo(n, z)}
        )
    return sorted(saida, key=lambda p: p["lacuna"])
