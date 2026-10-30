import type { Area, ResumoArea } from "../api";
import { frasePontos, nomeDaArea } from "../rotulos";

interface Props {
  areas: ResumoArea[];
  aoVerFoco: (area: Area) => void;
}

/** Uma linha por área: a nota estimada da prova mais recente e quanto mudou desde a anterior. */
export function Evolucao({ areas, aoVerFoco }: Props) {
  if (areas.length === 0) return null;
  return (
    <>
      <h2>Sua evolução</h2>
      <p className="mudo">
        A nota estimada sai dos seus acertos e permite comparar provas de anos diferentes. É uma
        estimativa: diferenças pequenas podem ser só acaso.
      </p>
      <ul className="lista">
        {areas.map((a) => (
          <li key={a.area} className="cartao">
            <div>
              <strong>{nomeDaArea(a.area)}</strong>
              <span className="mudo">
                {` · ${a.provas} ${a.provas === 1 ? "prova" : "provas"}`}
              </span>
              <p className="placar">
                {a.ultima === null ? (
                  <span className="mudo">Sem nota estimada</span>
                ) : (
                  <>
                    <strong>{Math.round(a.ultima)}</strong> <span className="mudo">de nota</span>
                  </>
                )}
              </p>
              <p className="mudo">
                {a.variacao !== null
                  ? frasePontos(a.variacao)
                  : "Inclua mais uma prova desta área para comparar."}
              </p>
            </div>
            <div className="acoes">
              <button type="button" onClick={() => aoVerFoco(a.area)}>
                Onde focar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
