import { useQuery } from "@tanstack/react-query";

import { api, type Resultado } from "../api";
import { SELOS, decimal, explicarReferencia, tituloDaProva } from "../rotulos";

const EM_DESTAQUE = 5;

export function TelaResultado(props: {
  id: string;
  aoVoltar: () => void;
  aoIncluirOutra: () => void;
}) {
  const prova = useQuery({ queryKey: ["prova", props.id], queryFn: () => api.prova(props.id) });

  return (
    <>
      <button type="button" className="link" onClick={props.aoVoltar}>
        ← Voltar
      </button>
      {prova.isPending && <p className="carregando">Carregando…</p>}
      {prova.isError && <p className="erro">{prova.error.message}</p>}
      {prova.data && <Corpo r={prova.data} />}
      <button type="button" className="primario" onClick={props.aoIncluirOutra}>
        Incluir outra prova
      </button>
    </>
  );
}

function Corpo({ r }: { r: Resultado }) {
  if (r.acertos === null || r.avaliadas === null) {
    return <p className="erro">Esta prova não pode mais ser corrigida com a base atual.</p>;
  }
  const destaque = r.habilidades.slice(0, EM_DESTAQUE);
  const resto = r.habilidades.slice(EM_DESTAQUE);
  return (
    <section>
      <h1>Seu resultado</h1>
      <p className="mudo">{tituloDaProva(r)}</p>
      <p className="placar">
        <strong>{r.acertos}</strong> de {r.avaliadas} acertos
      </p>
      {r.anuladas !== null && r.anuladas > 0 && (
        <p className="mudo">
          {r.anuladas}{" "}
          {r.anuladas === 1 ? "questão anulada não conta" : "questões anuladas não contam"}.
        </p>
      )}
      <p className="mudo">{explicarReferencia(r)}</p>

      <h2>Onde focar</h2>
      <p className="mudo">
        Com uma prova só, cada habilidade tem poucas questões. Quanto mais provas você incluir, mais
        firme fica o diagnóstico.
      </p>
      <ul className="lista">
        {destaque.map((h) => (
          <Habilidade key={h.habilidade} h={h} />
        ))}
      </ul>
      {resto.length > 0 && (
        <details>
          <summary>Ver as outras {resto.length} habilidades</summary>
          <ul className="lista">
            {resto.map((h) => (
              <Habilidade key={h.habilidade} h={h} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Habilidade({ h }: { h: Resultado["habilidades"][number] }) {
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
