"""Corrige uma folha de respostas contra a base de referência e acha o esperado do aluno.

O gabarito é lido aqui, no servidor; nenhuma rota o devolve. Com respondentes no caderno, o
esperado vem do decil do aluno (da nota, ou estimado pelos acertos). Sem respondentes
(reaplicação e PPL de 2024-2025), vem da TRI na nota informada ou estimada pelos acertos.
"""

import psycopg

from app import repositorio
from app.perfil import (
    Avaliacao,
    decil_da_nota,
    decil_estimado,
    esperado_tri,
    nota_por_acertos,
    respostas_da_folha,
)

LETRAS = tuple("ABCDE")


class ProvaInvalida(Exception):
    """A prova não pode ser corrigida; `status` é o código HTTP que a rota devolve."""

    def __init__(self, mensagem: str, status: int = 422):
        super().__init__(mensagem)
        self.status = status


def avaliar_prova(
    conn: psycopg.Connection,
    *,
    ano: int,
    area: str,
    co_prova: int,
    lingua: int | None,
    folha: str,
    nota: float | None,
) -> Avaliacao:
    cad = repositorio.caderno(conn, ano, area, co_prova)
    if cad is None:
        raise ProvaInvalida("caderno não encontrado", 404)
    if cad["ambiguo"]:
        raise ProvaInvalida("caderno ambíguo: não dá para ligar posição a questão", 409)
    if cad["adaptado"]:
        raise ProvaInvalida("caderno adaptado: ainda sem dados de referência próprios", 409)
    itens_caderno = repositorio.itens_do_caderno(conn, ano, area, co_prova)
    try:
        respostas = respostas_da_folha(folha, itens_caderno, area, lingua)
    except ValueError as erro:
        raise ProvaInvalida(str(erro)) from erro
    base = {"ano": ano, "area": area, "co_prova": co_prova, "respostas": respostas}
    estatisticas = repositorio.estatisticas(conn, ano, area)
    parametros = repositorio.parametros_tri(conn, ano, area)
    gabaritos = {i["co_item"]: i["gabarito"] for i in itens_caderno}
    av = None
    if cad["tem_respondentes"] and any(co in estatisticas for co in respostas):
        por_decil = repositorio.esperado_por_decil(conn, ano, list(respostas))
        if por_decil:
            av = _por_decil(conn, base, estatisticas, por_decil, nota)
    if av is None:
        av = _por_tri(base, gabaritos, nota, parametros)
    av.nota_estimada = _nota_estimada(parametros, gabaritos, respostas)
    return av


def _nota_estimada(parametros: dict[int, dict], gabaritos: dict[int, str], respostas: dict):
    """Nota pela TRI a partir dos acertos, a mesma conta para provas com decil e sem ele: é o eixo
    que permite comparar provas de anos diferentes. Vazia quando acertar tudo ou nada, pois aí a
    TRI não separa a nota (só dá piso ou teto) e prometeria precisão que não existe."""
    avaliadas = [co for co in respostas if co in parametros and gabaritos.get(co) in LETRAS]
    acertos = sum(respostas[co] == gabaritos[co] for co in avaliadas)
    abc = [(parametros[co]["a"], parametros[co]["b"], parametros[co]["c"]) for co in avaliadas]
    # Abaixo do que o chute puro rende (soma dos c) a TRI só devolveria o piso da escala.
    if acertos <= sum(c for _, _, c in abc) or acertos >= len(avaliadas):
        return None
    return nota_por_acertos(abc, acertos)


def _por_decil(conn, base, estatisticas, por_decil, nota) -> Avaliacao:
    avaliadas = {co: m for co, m in base["respostas"].items() if co in estatisticas}
    acertos = sum(m == estatisticas[co]["gabarito"] for co, m in avaliadas.items())
    cortes = repositorio.cortes(conn, base["ano"], base["area"]) if nota is not None else []
    if cortes:
        decil, origem = decil_da_nota(cortes, nota), "decil da nota informada"
    else:
        totais = {d: sum(esp.get(co, 0.0) for co in avaliadas) for d, esp in por_decil.items()}
        decil, origem = decil_estimado(acertos, totais), "decil estimado pelos acertos"
    return Avaliacao(
        **base,
        referencia="decil",
        origem=origem,
        decil=decil,
        nota_ref=nota,
        acertos=acertos,
        avaliadas=len(avaliadas),
        anuladas=len(base["respostas"]) - len(avaliadas),
        itens={co: estatisticas[co] for co in avaliadas},
        esperado={co: p for co, p in por_decil.get(decil, {}).items() if co in avaliadas},
    )


def _por_tri(base, gabaritos, nota, parametros) -> Avaliacao:
    avaliadas = {
        co: m
        for co, m in base["respostas"].items()
        if co in parametros and gabaritos.get(co) in LETRAS
    }
    if not avaliadas:
        raise ProvaInvalida("sem dados de referência para corrigir este caderno", 409)
    acertos = sum(m == gabaritos[co] for co, m in avaliadas.items())
    abc = {co: (parametros[co]["a"], parametros[co]["b"], parametros[co]["c"]) for co in avaliadas}
    if nota is not None:
        nota_ref, origem = nota, "TRI na nota informada"
    else:
        nota_ref = nota_por_acertos(list(abc.values()), acertos)
        origem = "TRI na nota estimada pelos acertos"
    return Avaliacao(
        **base,
        referencia="tri",
        origem=origem,
        decil=None,
        nota_ref=nota_ref,
        acertos=acertos,
        avaliadas=len(avaliadas),
        anuladas=len(base["respostas"]) - len(avaliadas),
        itens={
            co: {
                "habilidade": parametros[co]["habilidade"],
                "gabarito": gabaritos[co],
                "armadilha": False,
                "distrator_dominante": None,
            }
            for co in avaliadas
        },
        esperado={co: esperado_tri(*abc[co], nota_ref) for co in avaliadas},
    )
