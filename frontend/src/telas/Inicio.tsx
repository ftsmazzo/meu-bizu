import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Usuario } from "../api";
import { dataCurta, tituloDaProva } from "../rotulos";

interface Props {
  usuario: Usuario;
  aoIncluir: () => void;
  aoAbrir: (id: string) => void;
  aoSair: () => void;
}

export function Inicio({ usuario, aoIncluir, aoAbrir, aoSair }: Props) {
  const cliente = useQueryClient();
  const provas = useQuery({ queryKey: ["provas"], queryFn: api.provas });
  const excluir = useMutation({
    mutationFn: api.excluirProva,
    onSuccess: () => cliente.invalidateQueries({ queryKey: ["provas"] }),
  });
  const sair = useMutation({ mutationFn: api.sair, onSuccess: aoSair });

  return (
    <>
      <header className="topo">
        <h1>Olá, {usuario.nome}</h1>
        <button type="button" className="link" onClick={() => sair.mutate()}>
          Sair
        </button>
      </header>

      <button type="button" className="primario grande" onClick={aoIncluir}>
        Incluir resultado
      </button>

      <h2>Suas provas</h2>
      {provas.isPending && <p className="carregando">Carregando…</p>}
      {provas.isError && <p className="erro">{provas.error.message}</p>}
      {provas.data?.length === 0 && (
        <p className="vazio">
          Nenhuma prova ainda. Inclua o que você marcou numa prova do Enem para ver onde focar.
        </p>
      )}
      <ul className="lista">
        {provas.data?.map((p) => (
          <li key={p.id} className="cartao">
            <div>
              <strong>{tituloDaProva(p)}</strong>
              <span className="mudo">
                {p.acertos !== null && p.avaliadas !== null
                  ? ` · ${p.acertos} de ${p.avaliadas} acertos`
                  : " · sem correção"}
                {p.feita_em ? ` · ${dataCurta(p.feita_em)}` : ""}
              </span>
            </div>
            <div className="acoes">
              <button type="button" onClick={() => aoAbrir(p.id)}>
                Ver
              </button>
              <button
                type="button"
                className="perigo"
                onClick={() => window.confirm("Excluir esta prova?") && excluir.mutate(p.id)}
              >
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
