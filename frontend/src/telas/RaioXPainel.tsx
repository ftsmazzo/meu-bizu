import { useState } from "react";

import type { Area, AreaRaioX, EnunciadoRaioX, RaioX, SuaProva } from "../api";
import { LETRAS } from "../folha";
import { decimal, estiloArea, nomeDaArea } from "../rotulos";
import {
  Anel,
  BarraFaixas,
  BarraGrupos,
  BarraPosicao,
  BarrasGanho,
} from "../ui/graficos";

interface Props {
  dados: RaioX;
  aoVoltar: () => void;
  aoRefazer: () => void;
  aoIncluirProva: () => void;
  /** Áreas em que o aluno já gravou uma prova neste ano. */
  areasComProva: Area[];
  aoVerDiagnostico: (area: Area) => void;
}

/** Frase sobre a posição, sem jargão: a base é o grupo de 10% em que a nota cai. */
export function frasePosicao(
  a: Pick<AreaRaioX, "decil" | "a_frente_de">,
): string {
  if (a.decil === null || a.a_frente_de === null) {
    return "Ainda não temos o ranking desta área neste ano.";
  }
  if (a.a_frente_de === 0) return "Você está entre os 10% de menor nota.";
  return `Você está à frente de pelo menos ${a.a_frente_de}% dos participantes.`;
}

export function RaioXPainel({
  dados,
  aoVoltar,
  aoRefazer,
  aoIncluirProva,
  areasComProva,
  aoVerDiagnostico,
}: Props) {
  const comProva = dados.areas.filter((a) => areasComProva.includes(a.area));
  const semProva = dados.areas.length > comProva.length;
  const [aberta, setAberta] = useState(dados.areas[0].area);
  const area = dados.areas.find((a) => a.area === aberta) ?? dados.areas[0];

  return (
    <>
      <button type="button" className="link" onClick={aoVoltar}>
        ← Voltar
      </button>
      <section className="hero">
        <h1>Seu Raio-X do Enem {dados.ano}</h1>
        <p>
          O que costuma acontecer com quem tem as suas notas. É uma leitura pela
          nota, não um diagnóstico das suas respostas.
        </p>
        <div className="acoes">
          <button type="button" className="claro" onClick={aoRefazer}>
            Refazer com outras notas
          </button>
        </div>
      </section>

      <div className="painel">
        {dados.areas.map((a) => (
          <button
            key={a.area}
            type="button"
            className="card area"
            style={{ ...estiloArea(a.area), textAlign: "left" }}
            onClick={() => setAberta(a.area)}
            aria-label={`Abrir ${nomeDaArea(a.area)}`}
          >
            <h3>
              <span className="chip-area">{nomeDaArea(a.area)}</span>
            </h3>
            <div className="linha-nota">
              <Anel
                valor={a.nota}
                rotulo={`Nota em ${nomeDaArea(a.area)}: ${Math.round(a.nota)}`}
              />
              <p className="mudo" style={{ margin: 0 }}>
                {frasePosicao(a)}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="abas" role="tablist" aria-label="Áreas do Raio-X">
        {dados.areas.map((a) => (
          <button
            key={a.area}
            type="button"
            role="tab"
            aria-selected={a.area === area.area}
            style={estiloArea(a.area)}
            onClick={() => setAberta(a.area)}
          >
            <span className="ponto" />
            {nomeDaArea(a.area)}
          </button>
        ))}
      </div>

      <DetalheArea key={area.area} a={area} />

      {comProva.length > 0 && (
        <section className="card" style={{ marginTop: 14 }}>
          <h3>Seu diagnóstico de verdade já está pronto</h3>
          <p>
            Você já incluiu {comProva.length === 1 ? "a prova" : "as provas"} de{" "}
            {comProva.map((a) => nomeDaArea(a.area)).join(", ")}. Aqui mostramos
            onde <strong>você</strong> errou, comparando com quem tem a sua nota.
          </p>
          <div className="acoes">
            {comProva.map((a) => (
              <button
                key={a.area}
                type="button"
                className="primario"
                onClick={() => aoVerDiagnostico(a.area)}
              >
                Ver onde errei em {nomeDaArea(a.area)}
              </button>
            ))}
          </div>
        </section>
      )}

      {semProva && (
        <section className="card" style={{ marginTop: 14 }}>
          <h3>Quer um diagnóstico de verdade?</h3>
          <p>
            Esta leitura usa só a sua nota. Se você informar o que marcou numa
            prova, mostramos onde <strong>você</strong> errou, comparando com
            quem tem a sua nota.
          </p>
          <div className="acoes">
            <button type="button" className="primario" onClick={aoIncluirProva}>
              Incluir o que marquei numa prova
            </button>
          </div>
        </section>
      )}
      <p className="mudo">
        Estimativa feita com dados oficiais do INEP sobre quem fez a prova de{" "}
        {dados.ano}. Pode variar de pessoa para pessoa.
      </p>
    </>
  );
}

const RESULTADO = {
  acertou: "Você acertou",
  errou: "Você errou",
  em_branco: "Você deixou em branco",
} as const;

const LEITURA = {
  acima: "Isso está acima do esperado para a sua nota.",
  dentro: "Isso está dentro do esperado para a sua nota.",
  abaixo:
    "Isso está abaixo do esperado para a sua nota: dá para recuperar, veja os pontos que escaparam.",
} as const;

function VerQuestao({ questao }: { questao: EnunciadoRaioX | null }) {
  if (!questao) return null;
  return (
    <details>
      <summary>Ver a questão</summary>
      {questao.introducao && <p className="texto">{questao.introducao}</p>}
      {questao.enunciado && <p className="texto">{questao.enunciado}</p>}
      {questao.imagens.length > 0 && <p className="mudo">[Imagem]</p>}
      <ul>
        {LETRAS.map(
          (l) =>
            questao.alternativas[l] && (
              <li key={l} className="texto">
                <strong>{l}</strong> {questao.alternativas[l]}
              </li>
            ),
        )}
      </ul>
    </details>
  );
}

/** Onde a nota sobe mais rápido: o que quem tem a sua nota acerta e a sua prova não acertou. */
function Perdidas({ prova }: { prova: SuaProva }) {
  if (prova.perdidas_total === 0) {
    return (
      <section className="card largo">
        <h3>Pontos que escaparam</h3>
        <p className="mudo">
          Nenhuma questão fácil para a sua nota escapou nesta prova. Bom sinal.
        </p>
      </section>
    );
  }
  const restantes = prova.perdidas_total - prova.perdidas.length;
  return (
    <section className="card largo">
      <h3>Pontos que escaparam</h3>
      <p className="mudo">
        Questões que quem tem a sua nota costuma acertar e você não acertou.
        Aqui a nota sobe mais rápido: vale refazer.
      </p>
      <ul className="lista">
        {prova.perdidas.map((q, i) => (
          <li key={i} className="cartao alcance-item">
            <div>
              <strong>Habilidade {q.habilidade}</strong>{" "}
              <span className="chance">{q.chance}% de quem tem a sua nota acerta</span>
              <span className={`resultado ${q.resultado}`}>{RESULTADO[q.resultado]}</span>
              {q.descricao && <p className="mudo">{q.descricao}</p>}
              <VerQuestao questao={q.questao} />
            </div>
          </li>
        ))}
      </ul>
      {restantes > 0 && (
        <small>
          E mais {restantes} {restantes === 1 ? "questão" : "questões"} desse tipo.
        </small>
      )}
    </section>
  );
}

function DetalheArea({ a }: { a: AreaRaioX }) {
  const total = Math.round(a.esperado);
  return (
    <div className="detalhe-area" style={estiloArea(a.area)}>
      <section className="card">
        <h3>Onde você está</h3>
        {a.decil !== null && <BarraGrupos grupo={a.decil} />}
        <p>{frasePosicao(a)}</p>
        {a.alvo !== null && (
          <p className="mudo">
            O próximo degrau fica por volta de{" "}
            <strong>{Math.round(a.alvo)}</strong> pontos.
          </p>
        )}
      </section>

      {a.brasil && (
        <section className="card largo">
          <h3>Seu ranking</h3>
          <ul className="barras">
            {[a.brasil, a.uf, a.municipio].map(
              (p) =>
                p && (
                  <BarraPosicao
                    key={p.nome}
                    rotulo={p.nome}
                    aFrenteDe={p.a_frente_de}
                    n={p.n}
                  />
                ),
            )}
          </ul>
          <small>
            Mostramos o piso: “pelo menos X%” é o maior marco de 5 em 5 que a sua
            nota já alcançou. Estado e município são os do local da prova.
          </small>
        </section>
      )}

      <section className="card">
        <h3>O que esperar da prova</h3>
        <p>
          Quem tem a sua nota costuma acertar cerca de{" "}
          <strong>
            {total} de {a.total}
          </strong>{" "}
          questões.
        </p>
        <BarraFaixas {...a.faixas} />
        <small>
          “Ao seu alcance” são as questões em que a sua chance é boa, mas não
          certa: é onde mais se ganha.
        </small>
        {a.sua_prova && (
          <p className="cruzado">
            Na prova que você incluiu, você acertou{" "}
            <strong>
              {a.sua_prova.acertos} de {a.sua_prova.avaliadas}
            </strong>
            . {LEITURA[a.sua_prova.leitura]}
          </p>
        )}
      </section>

      {a.sua_prova && <Perdidas prova={a.sua_prova} />}

      <section className="card largo">
        <h3>Onde focar para subir um degrau</h3>
        {a.foco.length === 0 ? (
          <p className="mudo">
            {a.decil === 10
              ? "Você já está no grupo de maior nota. O foco agora é manter o que já funciona."
              : "Ainda não temos dados para calcular o próximo degrau desta área."}
          </p>
        ) : (
          <>
            <p className="mudo">
              Habilidades em que quem está um degrau acima acerta mais. O número
              é quantas questões a mais, em média.
            </p>
            <BarrasGanho
              itens={a.foco.slice(0, 5).map((h) => ({
                chave: String(h.habilidade),
                rotulo: `Habilidade ${h.habilidade}${h.descricao ? ` · ${h.descricao}` : ""}`,
                valor: h.ganho,
                texto: `+${decimal(h.ganho)}`,
                detalhe:
                  `Hoje cerca de ${decimal(h.esperado)}; um degrau acima, ${decimal(h.alvo)} (de ${h.n} ${h.n === 1 ? "questão" : "questões"})` +
                  (h.seus_acertos !== null && h.seus_de !== null
                    ? `. Na sua prova: ${h.seus_acertos} de ${h.seus_de}`
                    : ""),
              }))}
            />
          </>
        )}
      </section>

      {a.alcance.length > 0 && (
        <section className="card largo">
          <h3>Questões ao seu alcance</h3>
          <p className="mudo">
            Questões desta prova em que a sua chance é boa, mas não garantida.
            Vale refazer.
          </p>
          <ul className="lista">
            {a.alcance.map((q, i) => (
              <li key={i} className="cartao alcance-item">
                <div>
                  <strong>Habilidade {q.habilidade}</strong>{" "}
                  <span className="chance">{q.chance}% de chance</span>
                  {q.resultado && (
                    <span className={`resultado ${q.resultado}`}>
                      {RESULTADO[q.resultado]}
                    </span>
                  )}
                  {q.descricao && <p className="mudo">{q.descricao}</p>}
                  <VerQuestao questao={q.questao} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
