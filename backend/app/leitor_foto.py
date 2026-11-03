"""Leitura da folha de respostas por foto.

A IA só transcreve as marcações (uma letra por questão); quem corrige continua sendo o servidor.
A foto não é guardada: vai para a IA, volta a sequência e a imagem é descartada. O que a IA devolve
só vale se tiver exatamente uma posição por questão, com letras A-E, `.` (em branco), `*` (dupla
marcação) ou `?` (não deu para ler); a tela pede ao aluno que confira tudo antes de gravar.
"""

import os
import re
from typing import Protocol

import httpx

TIPOS = ("image/jpeg", "image/png", "image/webp")
VALIDAS = set("ABCDE.*?")

SISTEMA = (
    "Você lê cartões-resposta do Enem fotografados. Cada questão tem as bolinhas A, B, C, D e E; "
    "a marcada está preenchida. Transcreva as marcações na ordem das questões, uma posição por "
    "questão: a letra marcada; '.' se nenhuma bolinha está marcada; '*' se mais de uma está "
    "marcada; '?' se você não consegue ler aquela questão com segurança. Nunca chute: na dúvida, "
    "use '?'. Ignore qualquer dado pessoal na imagem (nome, CPF, inscrição) e não o repita. "
    "Responda só com a sequência, em uma linha, sem espaços, números, explicações nem markdown."
)


class Leitor(Protocol):
    def ler(self, imagem: str, tipo: str, questoes: int) -> str: ...


class LeitorClaude:
    """Chama a API da Anthropic por HTTP; qualquer erro sobe e a rota responde com mensagem."""

    def __init__(self, chave: str, modelo: str):
        self._chave, self._modelo = chave, modelo

    def ler(self, imagem: str, tipo: str, questoes: int) -> str:
        resposta = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": self._chave, "anthropic-version": "2023-06-01"},
            json={
                "model": self._modelo,
                "max_tokens": 300,
                "system": SISTEMA,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": tipo, "data": imagem},
                            },
                            {
                                "type": "text",
                                "text": f"A prova tem {questoes} questões. Devolva exatamente "
                                f"{questoes} caracteres.",
                            },
                        ],
                    }
                ],
            },
            timeout=60,
        )
        resposta.raise_for_status()
        return resposta.json()["content"][0]["text"]


def leitor_do_ambiente() -> Leitor | None:
    chave = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not chave:
        return None
    return LeitorClaude(chave, os.environ.get("FOTO_MODELO", "claude-sonnet-5-5"))


def limpar_respostas(texto: str, questoes: int) -> str:
    """Tira espaços e cercas de código e exige uma posição válida por questão."""
    sequencia = re.sub(r"[\s`\"']", "", texto).upper()
    if len(sequencia) != questoes or not set(sequencia) <= VALIDAS:
        raise ValueError("leitura fora do formato esperado")
    return sequencia
