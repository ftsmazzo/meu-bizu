import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Area, type Usuario } from "../api";
import { dataCurta, tituloDaProva } from "../rotulos";
import { Evolucao } from "./Evolucao";

interface Props {
  usuario: Usuario;
  aoIncluir: () => void;
  aoAbrir: (id: string) => void;
  aoVerFoco: (area: Area) => void;
  aoVerRelatorio: () => void;
  aoSair: () => void;
}

export function Inicio({ usuario, aoIncluir, aoAbrir, aoVerFoco, aoVerRelatorio, aoSair }: Props) {
  const cliente = useQueryClient();
  const provas = useQuery({ queryKey: ["provas"], queryFn: api.provas });
  const perfil = useQuery({ queryKey: ["perfil"], queryFn: () => api.perfil(null) });
  const excluir = useMutation({
    mutationFn: api.excluirProva,
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ["provas"] });
      void cliente.invalidateQueries({ queryKey: ["perfil"] });
    },
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

      {perfil.data && <Evolucao areas={perfil.data.areas} aoVerFoco={aoVerFoco} />}
      {perfil.data && perfil.data.areas.length > 0 && (
        <button type="button" onClick={aoVerRelatorio}>
          Ver relatório completo
        </button>
      )}

      <h2>Suas provas</h2>
      {provas.isPending && <p className="carregando">Carregando…</p>}
      {provas.isError && <p className="erro">{provas.error.message}</p>}
      {provas.data?.length === 0 && (
        <p className="vazio">
          Nenhuma prova ainda. Inclua o que você marcou numa prova do Enem para ver onde focar.
        </p>
      )}
      <ul className="lista">
        {[...(provas.data ?? [])].reverse().map((p) => (
          <li key={p.id} className="cartao">
            <div>
              <strong>{tituloDaProva(p)}</strong>
              <span className="mudo">
                {p.acertos !== null && p.avaliadas !== null
                  ? ` · ${p.acertos} de ${p.avaliadas} acertos`
                  : " · sem correção"}
                {p.nota_estimada !== null ? ` · nota estimada ${Math.round(p.nota_estimada)}` : ""}
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
