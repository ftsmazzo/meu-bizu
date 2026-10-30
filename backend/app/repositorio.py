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


def questoes(conn: psycopg.Connection, ano: int, co_itens: list[int]) -> dict[int, dict]:
    """Texto das questões com texto confiável, por co_item (as sem texto não aparecem)."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "select co_item, introducao, enunciado, alternativas, imagens from ref.questao "
            "where ano = %s and co_item = any(%s)",
            (ano, co_itens),
        )
        return {r["co_item"]: r for r in cur.fetchall()}
