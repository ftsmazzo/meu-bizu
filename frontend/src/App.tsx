import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "./api";
import { Entrada } from "./telas/Entrada";
import { Incluir } from "./telas/Incluir";
import { Inicio } from "./telas/Inicio";
import { TelaResultado } from "./telas/TelaResultado";

type Tela = { nome: "inicio" } | { nome: "incluir" } | { nome: "resultado"; id: string };

/** Sem rotas no navegador: a tela é um estado. O cookie de sessão decide se há alguém logado. */
export function App() {
  const cliente = useQueryClient();
  const eu = useQuery({ queryKey: ["eu"], queryFn: api.eu });
  const [tela, setTela] = useState<Tela>({ nome: "inicio" });

  if (eu.isPending) return <p className="carregando">Carregando…</p>;
  if (eu.isError) return <p className="erro">Não consegui falar com o servidor. Tente de novo.</p>;

  if (!eu.data) {
    return (
      <Entrada
        aoEntrar={() => {
          setTela({ nome: "inicio" });
          void cliente.invalidateQueries({ queryKey: ["eu"] });
        }}
      />
    );
  }

  const inicio = () => setTela({ nome: "inicio" });
  return (
    <main className="app">
      {tela.nome === "inicio" && (
        <Inicio
          usuario={eu.data}
          aoIncluir={() => setTela({ nome: "incluir" })}
          aoAbrir={(id) => setTela({ nome: "resultado", id })}
          aoSair={() => {
            cliente.clear();
            void cliente.invalidateQueries({ queryKey: ["eu"] });
          }}
        />
      )}
      {tela.nome === "incluir" && (
        <Incluir aoVoltar={inicio} aoGravar={(id) => setTela({ nome: "resultado", id })} />
      )}
      {tela.nome === "resultado" && (
        <TelaResultado
          id={tela.id}
          aoVoltar={inicio}
          aoIncluirOutra={() => setTela({ nome: "incluir" })}
        />
      )}
    </main>
  );
}
