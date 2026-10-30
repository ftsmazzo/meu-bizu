import { useMutation } from "@tanstack/react-query";

import { api, type Area } from "../api";
import { nomeDaArea } from "../rotulos";

/** Relatório em texto sobre o perfil. Só é gerado quando o aluno pede (a IA tem custo). */
export function Relatorio(props: { area: Area | null; aoVoltar: () => void }) {
  const gerar = useMutation({ mutationFn: () => api.relatorio(props.area) });

  return (
    <>
      <button type="button" className="link" onClick={props.aoVoltar}>
        ← Voltar
      </button>
      <h1>Relatório{props.area ? ` de ${nomeDaArea(props.area)}` : ""}</h1>
      <p className="mudo">
        Um resumo em texto do que os seus números mostram. Ele usa só os seus resultados, nada
        pessoal.
      </p>
      {!gerar.data && (
        <button
          type="button"
          className="primario"
          disabled={gerar.isPending}
          onClick={() => gerar.mutate()}
        >
          {gerar.isPending ? "Gerando…" : "Gerar relatório"}
        </button>
      )}
      {gerar.isError && <p className="erro">{gerar.error.message}</p>}
      {gerar.data && (
        <section>
          <p className="texto">{gerar.data.texto}</p>
          {gerar.data.origem === "padrao" && (
            <p className="mudo">Este texto foi montado automaticamente, sem a IA.</p>
          )}
        </section>
      )}
    </>
  );
}
