import { useQuery } from "@tanstack/react-query";

import { api, type Resultado } from "../api";
import { explicarReferencia, tituloDaProva } from "../rotulos";
import { ListaHabilidades } from "./Habilidades";

export function TelaResultado(props: {
  id: string;
  aoVoltar: () => void;
  aoCorrigir: () => void;
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
      <div className="acoes">
        <button type="button" onClick={props.aoCorrigir}>
          Corrigir respostas
        </button>
        <button type="button" className="primario" onClick={props.aoIncluirOutra}>
          Incluir outra prova
        </button>
      </div>
    </>
  );
}

function Corpo({ r }: { r: Resultado }) {
  if (r.acertos === null || r.avaliadas === null) {
    return <p className="erro">Esta prova não pode mais ser corrigida com a base atual.</p>;
  }
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
      {r.nota_estimada !== null && (
        <p className="mudo">
          Nota estimada pelos seus acertos: <strong>{Math.round(r.nota_estimada)}</strong>. É ela que
          permite comparar esta prova com as outras.
        </p>
      )}
      <p className="mudo">{explicarReferencia(r)}</p>

      <h2>Onde focar</h2>
      <p className="mudo">
        Com uma prova só, cada habilidade tem poucas questões. Quanto mais provas você incluir, mais
        firme fica o diagnóstico.
      </p>
      <ListaHabilidades habilidades={r.habilidades} />
    </section>
  );
}
