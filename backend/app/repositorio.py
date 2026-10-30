"""Consultas à base de referência (schema `ref`), sempre parametrizadas."""

import psycopg
from psycopg.rows import dict_row


def anos(conn: psycopg.Connection) -> list[int]:
    return [r[0] for r in conn.execute("select distinct ano from ref.caderno order by ano")]


def cadernos(conn: psycopg.Connection, ano: int, area: str) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "select co_prova, cor, adaptado, ambiguo, tem_respondentes from ref.caderno "
            "where ano = %s and area = %s",
            (ano, area),
        )
        return cur.fetchall()


def caderno(conn: psycopg.Connection, ano: int, area: str, co_prova: int) -> dict | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "select co_prova, cor, adaptado, ambiguo, tem_respondentes from ref.caderno "
            "where ano = %s and area = %s and co_prova = %s",
            (ano, area, co_prova),
        )
        return cur.fetchone()


def itens_do_caderno(conn: psycopg.Connection, ano: int, area: str, co_prova: int) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "select co_prova, posicao, co_item, tp_lingua, gabarito from ref.item_caderno "
            "where ano = %s and area = %s and co_prova = %s",
            (ano, area, co_prova),
        )
        return cur.fetchall()


def estatisticas(conn: psycopg.Connection, ano: int, area: str) -> dict[int, dict]:
    """Itens avaliáveis (não abandonados, com gabarito) de um ano e área, por co_item."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "select co_item, habilidade, gabarito, coalesce(armadilha, false) as armadilha, "
            "distrator_dominante from ref.item_estatistica "
            "where ano = %s and area = %s and not abandonado and gabarito is not null",
            (ano, area),
        )
        return {r["co_item"]: r for r in cur.fetchall()}


def esperado_por_decil(
    conn: psycopg.Connection, ano: int, co_itens: list[int]
) -> dict[int, dict[int, float]]:
    """Acerto observado por decil: {decil: {co_item: taxa}}."""
    saida: dict[int, dict[int, float]] = {}
    for co_item, decil, acerto in conn.execute(
        "select co_item, decil, acerto from ref.item_esperado where ano = %s and co_item = any(%s)",
        (ano, co_itens),
    ):
        saida.setdefault(decil, {})[co_item] = acerto
    return saida


def cortes(conn: psycopg.Connection, ano: int, area: str) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "select decil, nota_max from ref.decil_nota where ano = %s and area = %s",
            (ano, area),
        )
        return cur.fetchall()


def parametros_tri(conn: psycopg.Connection, ano: int, area: str) -> dict[int, dict]:
    """Itens com parâmetros da TRI (não abandonados), por co_item."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "select co_item, habilidade, param_a as a, param_b as b, param_c as c from ref.item "
            "where ano = %s and area = %s and not abandonado and param_a is not null",
            (ano, area),
        )
        return {r["co_item"]: r for r in cur.fetchall()}


def habilidades(conn: psycopg.Connection) -> dict[tuple[str, int], str]:
    consulta = "select area, habilidade, descricao from ref.habilidade"
    return {(a, h): d for a, h, d in conn.execute(consulta)}


def questoes(conn: psycopg.Connection, ano: int, co_itens: list[int]) -> dict[int, dict]:
    """Texto das questões com texto confiável, por co_item (as sem texto não aparecem)."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "select co_item, introducao, enunciado, alternativas, imagens from ref.questao "
            "where ano = %s and co_item = any(%s)",
            (ano, co_itens),
        )
        return {r["co_item"]: r for r in cur.fetchall()}
