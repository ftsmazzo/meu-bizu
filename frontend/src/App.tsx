import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, type Area } from "./api";
import { Entrada } from "./telas/Entrada";
import { Incluir } from "./telas/Incluir";
import { Inicio } from "./telas/Inicio";
import { PerfilPorArea } from "./telas/PerfilPorArea";
import { RaioX } from "./telas/RaioX";
import { Relatorio } from "./telas/Relatorio";
import { TelaResultado } from "./telas/TelaResultado";
import { Barra } from "./ui/Marca";

type Tela =
  | { nome: "inicio" }
  | { nome: "incluir" }
  | { nome: "raiox" }
  | { nome: "resultado"; id: string }
  | { nome: "corrigir"; id: string }
  | { nome: "foco"; area: Area }
  | { nome: "relatorio"; area: Area | null };

/** Sem rotas no navegador: a tela é um estado. O cookie de sessão decide se há alguém logado. */
export function App() {
  const cliente = useQueryClient();
  const eu = useQuery({ queryKey: ["eu"], queryFn: api.eu });
  const [tela, setTela] = useState<Tela>({ nome: "inicio" });
  const sair = useMutation({
    mutationFn: api.sair,
    onSuccess: () => {
      cliente.clear();
      setTela({ nome: "inicio" });
      void cliente.invalidateQueries({ queryKey: ["eu"] });
    },
  });

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
  const incluir = () => setTela({ nome: "incluir" });
  const resultado = (id: string) => setTela({ nome: "resultado", id });
  return (
    <main className="app">
      <Barra>
        <button type="button" className="link" onClick={() => sair.mutate()}>
          Sair
        </button>
      </Barra>
      {tela.nome === "inicio" && (
        <Inicio
          usuario={eu.data}
          aoIncluir={incluir}
          aoRaioX={() => setTela({ nome: "raiox" })}
          aoAbrir={resultado}
          aoVerFoco={(area) => setTela({ nome: "foco", area })}
          aoVerRelatorio={() => setTela({ nome: "relatorio", area: null })}
        />
      )}
      {tela.nome === "raiox" && (
        <RaioX
          aoVoltar={inicio}
          aoIncluirProva={incluir}
          aoVerDiagnostico={(area) => setTela({ nome: "foco", area })}
        />
      )}
      {tela.nome === "incluir" && <Incluir aoVoltar={inicio} aoGravar={resultado} />}
      {tela.nome === "corrigir" && (
        <Corrigir id={tela.id} aoVoltar={() => resultado(tela.id)} aoSalvar={resultado} />
      )}
      {tela.nome === "foco" && (
        <PerfilPorArea
          area={tela.area}
          aoVoltar={inicio}
          aoVerRelatorio={() => setTela({ nome: "relatorio", area: tela.area })}
        />
      )}
      {tela.nome === "relatorio" && (
        <Relatorio
          area={tela.area}
          aoVoltar={() =>
            setTela(tela.area ? { nome: "foco", area: tela.area } : { nome: "inicio" })
          }
        />
      )}
      {tela.nome === "resultado" && (
        <TelaResultado
          id={tela.id}
          aoVoltar={inicio}
          aoCorrigir={() => setTela({ nome: "corrigir", id: tela.id })}
          aoIncluirOutra={incluir}
        />
      )}
    </main>
  );
}

/** Carrega a prova gravada e abre o formulário já preenchido com ela. */
function Corrigir(props: { id: string; aoVoltar: () => void; aoSalvar: (id: string) => void }) {
  const prova = useQuery({ queryKey: ["prova", props.id], queryFn: () => api.prova(props.id) });
  if (prova.isPending) return <p className="carregando">Carregando…</p>;
  if (prova.isError) return <p className="erro">{prova.error.message}</p>;
  return <Incluir edicao={prova.data} aoVoltar={props.aoVoltar} aoGravar={props.aoSalvar} />;
}
