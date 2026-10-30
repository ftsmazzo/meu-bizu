import pytest

from app.carga_ref import TABELAS, carregar_ref
from app.migrar import migrar


def test_migrar_cria_o_esquema_ref_e_e_idempotente(conn):
    existe = conn.execute("select to_regclass('ref.caderno') is not null").fetchone()[0]
    assert existe
    assert migrar(conn) == []  # nada novo a aplicar


def test_carregar_ref_grava_todas_as_tabelas_e_converte_tipos(conn, ref_csv):
    totais = carregar_ref(conn, ref_csv)
    assert set(totais) == set(TABELAS)
    assert totais["caderno"] == 4 and totais["item_caderno"] == 10
    ambiguo = conn.execute("select ambiguo from ref.caderno where co_prova = 8").fetchone()[0]
    assert ambiguo is True
    alternativas = conn.execute(
        "select alternativas from ref.questao where co_item = 10"
    ).fetchone()[0]
    assert alternativas["A"] == "um"
    nula = conn.execute(
        "select count(*) from ref.item_caderno where tp_lingua is null and area = 'LC'"
    ).fetchone()[0]
    assert nula == 1  # a questão comum de LC ficou com língua nula, não com texto vazio


def test_carregar_ref_substitui_o_conteudo_anterior(conn, ref_csv):
    carregar_ref(conn, ref_csv)
    carregar_ref(conn, ref_csv)
    assert conn.execute("select count(*) from ref.caderno").fetchone()[0] == 4


def test_carregar_ref_recusa_pasta_incompleta_sem_mexer_no_banco(conn, ref_csv):
    carregar_ref(conn, ref_csv)
    (ref_csv / "item_esperado.csv").unlink()
    with pytest.raises(FileNotFoundError, match="item_esperado"):
        carregar_ref(conn, ref_csv)
    assert conn.execute("select count(*) from ref.caderno").fetchone()[0] == 4
