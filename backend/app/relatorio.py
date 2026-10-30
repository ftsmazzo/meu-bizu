"""Relatório por IA: os números vêm do perfil, a IA só redige.

A IA recebe um resumo mínimo (áreas, notas, habilidades com contagens), sem nome, e-mail ou id.
O texto que ela devolve só vale se todo número que aparece nele estiver nos fatos enviados; do
contrário, ou sem chave ou com a IA fora do ar, usa-se um texto padrão escrito por código.
"""

import hashlib
import json
import os
import re
from typing import Protocol

import httpx

NOMES = {
    "LC": "Linguagens",
    "CH": "Ciências Humanas",
    "CN": "Ciências da Natureza",
    "MT": "Matemática",
}
FOCOS = {"firme": "foque aqui", "indicativo": "vale olhar"}
MAX_HABILIDADES = 3
NUMERO = re.compile(r"\d+(?:[.,]\d+)?")

SISTEMA = (
    "Você é o Meu Bizu, mentor de estudos para o Enem. Escreva um relatório curto, de até 180 "
    "palavras, em português do Brasil, falando com o aluno em segunda pessoa, com tom amigável e "
    "direto (gíria só leve). Use somente os números que aparecem nos dados, exatamente como "
    "estão: não invente números, notas, prazos nem previsões, e não prometa resultado. Não use os "
    "termos decil, TRI, z nem desvio. Para cada área, diga onde focar primeiro e um passo "
    "prático. Sem listas longas e sem markdown."
)


class Redator(Protocol):
    def redigir(self, sistema: str, usuario: str) -> str: ...


class RedatorClaude:
    """Chama a API da Anthropic por HTTP; qualquer erro sobe e a rota cai no texto padrão."""

    def __init__(self, chave: str, modelo: str):
        self._chave, self._modelo = chave, modelo

    def redigir(self, sistema: str, usuario: str) -> str:
        resposta = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": self._chave, "anthropic-version": "2023-06-01"},
            json={
                "model": self._modelo,
                "max_tokens": 600,
                "system": sistema,
                "messages": [{"role": "user", "content": usuario}],
            },
            timeout=30,
        )
        resposta.raise_for_status()
        return resposta.json()["content"][0]["text"]


def redator_do_ambiente() -> Redator | None:
    chave = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not chave:
        return None
    return RedatorClaude(chave, os.environ.get("RELATORIO_MODELO", "claude-haiku-5-5"))


def fatos_do_perfil(areas: list[dict], habilidades: list[dict]) -> dict:
    """O mínimo que a IA precisa. Habilidades só entram com sinal de lacuna, as piores primeiro
    (`habilidades` já vem em ordem de lacuna)."""
    saida = []
    for a in areas:
        variacao = a["variacao"]
        direcao = None
        if variacao is not None:
            direcao = "igual" if round(variacao) == 0 else "subiu" if variacao > 0 else "caiu"
        foco = [h for h in habilidades if h["area"] == a["area"] and h["selo"] in FOCOS]
        saida.append(
            {
                "nome": NOMES[a["area"]],
                "provas": a["provas"],
                "nota": None if a["ultima"] is None else round(a["ultima"]),
                "variacao": None if variacao is None else abs(round(variacao)),
                "direcao": direcao,
                "habilidades": [
                    {
                        "numero": h["habilidade"],
                        "descricao": h["descricao"],
                        "acertos": h["acertos"],
                        "de": h["n"],
                        "esperado": round(h["esperado"] * h["n"], 1),
                        "foco": FOCOS[h["selo"]],
                        "armadilhas": h["armadilhas"],
                    }
                    for h in foco[:MAX_HABILIDADES]
                ],
            }
        )
    return {"areas": saida}


def impressao(fatos: dict) -> str:
    return hashlib.sha256(json.dumps(fatos, sort_keys=True).encode()).hexdigest()


def pedido_para_ia(fatos: dict) -> tuple[str, str]:
    return SISTEMA, "Dados do aluno (JSON):\n" + json.dumps(fatos, ensure_ascii=False)


def _normal(token: str) -> str:
    valor = float(token.replace(",", "."))
    return str(int(valor)) if valor.is_integer() else f"{valor:g}"


def _permitidos(fatos: dict) -> set[str]:
    numeros: set[str] = set()
    for area in fatos["areas"]:
        valores = [area["provas"], area["nota"], area["variacao"]]
        for h in area["habilidades"]:
            valores += [h["numero"], h["acertos"], h["de"], h["esperado"], h["armadilhas"]]
            numeros.update(_normal(t) for t in NUMERO.findall(h["descricao"] or ""))
        numeros.update(_normal(str(v)) for v in valores if v is not None)
    return numeros


def usa_so_numeros_dos_fatos(texto: str, fatos: dict) -> bool:
    permitidos = _permitidos(fatos)
    return all(_normal(t) in permitidos for t in NUMERO.findall(texto))


def _virgula(valor: float) -> str:
    return f"{valor:.1f}".replace(".", ",")


def texto_padrao(fatos: dict) -> str:
    """O relatório escrito por código: serve de reserva e segue as mesmas regras de tom."""
    blocos = []
    for a in fatos["areas"]:
        linhas = []
        if a["nota"] is None:
            linhas.append(f"Em {a['nome']}, ainda não tenho uma nota estimada para você.")
        else:
            linhas.append(f"Em {a['nome']}, a nota estimada pelos seus acertos é {a['nota']}.")
        if a["direcao"] == "igual":
            linhas.append("Ficou igual à prova anterior.")
        elif a["direcao"] is not None:
            pontos = "ponto" if a["variacao"] == 1 else "pontos"
            verbo = "Subiu" if a["direcao"] == "subiu" else "Caiu"
            linhas.append(f"{verbo} {a['variacao']} {pontos} desde a prova anterior.")
        elif a["provas"] == 1:
            linhas.append("Inclua mais uma prova desta área para comparar.")
        if a["habilidades"]:
            linhas.append("Onde focar primeiro:")
            for h in a["habilidades"]:
                nome = f" ({h['descricao']})" if h["descricao"] else ""
                frase = (
                    f"- Habilidade {h['numero']}{nome}: você acertou {h['acertos']} de {h['de']}; "
                    f"era esperado cerca de {_virgula(h['esperado'])}."
                )
                if h["armadilhas"]:
                    plural = "questão" if h["armadilhas"] == 1 else "questões"
                    frase += f" Caiu na pegadinha em {h['armadilhas']} {plural}."
                linhas.append(frase)
        else:
            linhas.append(
                "Sem sinal claro de lacuna por enquanto. Com mais provas o diagnóstico fica "
                "mais firme."
            )
        blocos.append("\n".join(linhas))
    return "\n\n".join(blocos)
