import type { Area, Resumo, ResumoArea } from "../api";
import { estiloArea, frasePontos, nomeDaArea } from "../rotulos";
import { Anel, Sparkline } from "../ui/graficos";

interface Props {
  areas: ResumoArea[];
  /** Provas da mais antiga para a mais nova: a linha de cada área sai da nota estimada delas. */
  provas?: Resumo[];
  aoVerFoco: (area: Area) => void;
}

/** Um cartão por área: a nota estimada da prova mais recente, a linha do tempo e a variação. */
export function Evolucao({ areas, provas = [], aoVerFoco }: Props) {
  if (areas.length === 0) return null;
  return (
    <>
      <h2>Sua evolução</h2>
      <p className="mudo">
        A nota estimada sai dos seus acertos e permite comparar provas de anos
        diferentes. É uma estimativa: diferenças pequenas podem ser só acaso.
      </p>
      <div className="painel">
        {areas.map((a) => {
          const pontos = provas
            .filter((p) => p.area === a.area && p.nota_estimada !== null)
            .map((p) => p.nota_estimada as number);
          return (
            <section
              key={a.area}
              className="card area"
              style={estiloArea(a.area)}
            >
              <h3>
                <span className="chip-area">{nomeDaArea(a.area)}</span>
                <span className="mudo">{` · ${a.provas} ${a.provas === 1 ? "prova" : "provas"}`}</span>
              </h3>
              <div className="linha-nota">
                {a.ultima === null ? (
                  <p className="mudo">Sem nota estimada</p>
                ) : (
                  <Anel
                    valor={a.ultima}
                    rotulo={`Nota estimada em ${nomeDaArea(a.area)}: ${Math.round(a.ultima)}`}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Sparkline
                    pontos={pontos}
                    rotulo={`Evolução em ${nomeDaArea(a.area)}`}
                  />
                </div>
              </div>
              <p
                className={
                  a.variacao === null
                    ? "mudo"
                    : a.variacao > 0
                      ? "variacao sobe"
                      : "variacao desce"
                }
              >
                {a.variacao !== null
                  ? frasePontos(a.variacao)
                  : "Inclua mais uma prova desta área para comparar."}
              </p>
              <div className="acoes">
                <button type="button" onClick={() => aoVerFoco(a.area)}>
                  Onde focar
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
