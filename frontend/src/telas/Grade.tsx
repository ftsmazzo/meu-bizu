import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { Questao } from "../api";
import { LETRAS, marcaDaTecla, type Folha, type Marca } from "../folha";

interface Props {
  questoes: Questao[];
  folha: Folha;
  aoMarcar: (indice: number, marca: Marca | null) => void;
}

/**
 * Uma linha por questão, na ordem do caderno. Teclado primeiro: A-E marca e avança, "." deixa em
 * branco, "*" é dupla marcação, as setas navegam e Backspace limpa. No celular, toque nos botões.
 * Nunca mostra o gabarito.
 */
export function Grade({ questoes, folha, aoMarcar }: Props) {
  const [atual, setAtual] = useState(() => Math.max(0, folha.findIndex((m) => m === null)));
  const linhas = useRef<(HTMLLIElement | null)[]>([]);
  const ultimo = questoes.length - 1;

  useEffect(() => {
    linhas.current[atual]?.scrollIntoView?.({ block: "nearest" });
  }, [atual]);

  function marcar(indice: number, marca: Marca | null) {
    aoMarcar(indice, marca);
    if (marca !== null) setAtual(Math.min(indice + 1, ultimo));
  }

  function aoTeclar(e: KeyboardEvent<HTMLElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtual(Math.min(atual + 1, ultimo));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtual(Math.max(atual - 1, 0));
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      aoMarcar(atual, null);
    } else {
      const marca = marcaDaTecla(e.key);
      if (marca) {
        e.preventDefault();
        marcar(atual, marca);
      }
    }
  }

  return (
    <div className="grade" role="group" aria-label="Respostas" tabIndex={0} onKeyDown={aoTeclar}>
      <ol>
        {questoes.map((q, i) => {
          const botao = (marca: Marca, texto: string, rotulo: string) => (
            <button
              type="button"
              key={marca}
              aria-pressed={folha[i] === marca}
              aria-label={`Questão ${q.numero}, ${rotulo}`}
              onClick={() => {
                setAtual(i);
                if (folha[i] === marca) aoMarcar(i, null);
                else marcar(i, marca);
              }}
            >
              {texto}
            </button>
          );
          return (
            <li
              key={q.numero}
              ref={(el) => {
                linhas.current[i] = el;
              }}
              className={i === atual ? "questao atual" : "questao"}
            >
              <div className="cabecalho">
                <span className="numero">{q.numero}</span>
                <div className="opcoes">
                  {LETRAS.map((l) => botao(l, l, `alternativa ${l}`))}
                  {botao(".", "Branco", "em branco")}
                  {botao("*", "Dupla", "dupla marcação")}
                </div>
              </div>
              {q.tem_texto && (
                <details>
                  <summary>Ver a questão</summary>
                  {q.introducao && <p className="texto">{q.introducao}</p>}
                  {q.enunciado && <p className="texto">{q.enunciado}</p>}
                  {q.imagens.length > 0 && <p className="mudo">[Imagem]</p>}
                  <ul>
                    {LETRAS.map(
                      (l) =>
                        q.alternativas[l] && (
                          <li key={l} className="texto">
                            <strong>{l}</strong> {q.alternativas[l]}
                          </li>
                        ),
                    )}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
