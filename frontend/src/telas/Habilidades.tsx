import type { LinhaPerfil } from "../api";
import { SELOS, decimal } from "../rotulos";

const EM_DESTAQUE = 5;

/** As habilidades em ordem de lacuna: as 5 primeiras à vista, o resto recolhido. */
export function ListaHabilidades({ habilidades }: { habilidades: LinhaPerfil[] }) {
  const destaque = habilidades.slice(0, EM_DESTAQUE);
  const resto = habilidades.slice(EM_DESTAQUE);
  return (
    <>
      <ul className="lista">
        {destaque.map((h) => (
          <Habilidade key={`${h.area}-${h.habilidade}`} h={h} />
        ))}
      </ul>
      {resto.length > 0 && (
        <details>
          <summary>Ver as outras {resto.length} habilidades</summary>
          <ul className="lista">
            {resto.map((h) => (
              <Habilidade key={`${h.area}-${h.habilidade}`} h={h} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Habilidade({ h }: { h: LinhaPerfil }) {
  const selo = SELOS[h.selo] ?? { texto: h.selo, classe: "selo" };
  return (
    <li className="cartao">
      <div>
        <strong>Habilidade {h.habilidade}</strong>
        <span className={selo.classe}>{selo.texto}</span>
        {h.descricao && <p className="mudo">{h.descricao}</p>}
        <p className="mudo">
          Você acertou {h.acertos} de {h.n}; era esperado cerca de {decimal(h.esperado * h.n)}.
          {h.armadilhas > 0 &&
            ` Caiu na pegadinha em ${h.armadilhas} ${h.armadilhas === 1 ? "questão" : "questões"}.`}
        </p>
      </div>
    </li>
  );
}
