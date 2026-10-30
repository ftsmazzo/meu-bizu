"""Relatório por IA do aluno logado. Só números do perfil vão à IA; o texto passa por uma trava."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app import auth, provas, repo_relatorio
from app.relatorio import (
    Redator,
    fatos_do_perfil,
    impressao,
    pedido_para_ia,
    redator_do_ambiente,
    texto_padrao,
    usa_so_numeros_dos_fatos,
)
from app.rotas_provas import Area, perfil

router = APIRouter()
Sessao = Annotated[auth.Sessao, Depends(auth.sessao_atual)]
registro = logging.getLogger(__name__)


def get_redator() -> Redator | None:
    """`None` quando não há chave da IA configurada: o relatório sai com o texto padrão."""
    return redator_do_ambiente()


class RelatorioSaida(BaseModel):
    texto: str
    origem: Literal["ia", "padrao"]


@router.post("/relatorio")
def gerar_relatorio(
    sessao: Sessao,
    redator: Annotated[Redator | None, Depends(get_redator)],
    area: Annotated[Area | None, Query()] = None,
) -> RelatorioSaida:
    conn = sessao.conn
    dados = perfil(sessao, area, None)
    fatos = fatos_do_perfil(
        [a.model_dump() for a in dados.areas], [h.model_dump() for h in dados.habilidades]
    )
    if not fatos["areas"]:
        raise HTTPException(409, "Inclua uma prova antes de pedir o relatório.")

    chave, marca = area or "todas", impressao(fatos)
    guardado = repo_relatorio.obter(conn, chave, marca)
    if guardado is not None:
        return RelatorioSaida(texto=guardado, origem="ia")

    texto = None
    if redator is not None:
        try:
            bruto = redator.redigir(*pedido_para_ia(fatos)).strip()
        except Exception:  # IA fora do ar, limite, chave inválida: o aluno recebe o texto padrão
            registro.warning("redator de relatório falhou", exc_info=True)
            bruto = ""
        if bruto and usa_so_numeros_dos_fatos(bruto, fatos):
            texto = bruto
    origem = "ia" if texto is not None else "padrao"
    if texto is None:
        texto = texto_padrao(fatos)
    else:
        repo_relatorio.guardar(conn, chave, marca, texto)
    provas.auditar(conn, "gerar_relatorio", None, {"area": chave, "origem": origem})
    return RelatorioSaida(texto=texto, origem=origem)
