"""Provas do aluno (schema `app`). Só a folha é gravada; acertos e perfil são recalculados.

O dono vem sempre de `current_setting('app.usuario_id')`, ajustado pela sessão (veja `auth`), e
o RLS do banco garante o resto: aqui nenhuma consulta recebe um id de usuário.
"""

from datetime import date

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

COLUNAS = "id, ano, area, co_prova, lingua, tipo, feita_em, nota, folha"


def inserir(
    conn: psycopg.Connection,
    *,
    ano: int,
    area: str,
    co_prova: int,
    lingua: int | None,
    tipo: str,
    feita_em: date | None,
    nota: float | None,
    folha: str,
) -> dict:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "insert into app.prova (usuario_id, ano, area, co_prova, lingua, tipo, feita_em, "
            "nota, folha) values (current_setting('app.usuario_id')::uuid, "
            f"%s, %s, %s, %s, %s, %s, %s, %s) returning {COLUNAS}",
            (ano, area, co_prova, lingua, tipo, feita_em, nota, folha),
        )
        return cur.fetchone()


def listar(conn: psycopg.Connection, area: str | None = None, desde: date | None = None):
    """Provas do usuário da sessão, da mais antiga para a mais nova (Enem sem data = 15/11)."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"select {COLUNAS} from app.prova "
            "where (%(area)s::text is null or area = %(area)s) "
            "and (%(desde)s::date is null "
            "     or coalesce(feita_em, make_date(ano, 11, 15)) >= %(desde)s) "
            "order by coalesce(feita_em, make_date(ano, 11, 15)), criada_em",
            {"area": area, "desde": desde},
        )
        return cur.fetchall()


def obter(conn: psycopg.Connection, prova_id) -> dict | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(f"select {COLUNAS} from app.prova where id = %s", (prova_id,))
        return cur.fetchone()


def atualizar(
    conn: psycopg.Connection,
    prova_id,
    *,
    ano: int,
    area: str,
    co_prova: int,
    lingua: int | None,
    tipo: str,
    feita_em: date | None,
    nota: float | None,
    folha: str,
) -> dict | None:
    """Troca os dados de uma prova do usuário da sessão; None se ela não existe (ou é de outro)."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "update app.prova set ano = %s, area = %s, co_prova = %s, lingua = %s, tipo = %s, "
            f"feita_em = %s, nota = %s, folha = %s where id = %s returning {COLUNAS}",
            (ano, area, co_prova, lingua, tipo, feita_em, nota, folha, prova_id),
        )
        return cur.fetchone()


def excluir(conn: psycopg.Connection, prova_id) -> bool:
    achou = conn.execute("delete from app.prova where id = %s returning id", (prova_id,))
    return achou.fetchone() is not None


def auditar(conn: psycopg.Connection, acao: str, prova_id, detalhe: dict | None = None) -> None:
    conn.execute(
        "insert into app.auditoria (usuario_id, acao, prova_id, detalhe) "
        "values (current_setting('app.usuario_id')::uuid, %s, %s, %s)",
        (acao, prova_id, Jsonb(detalhe) if detalhe is not None else None),
    )
