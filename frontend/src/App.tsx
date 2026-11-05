import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, type Area } from "./api";
import { Entrada } from "./telas/Entrada";
import { Incluir } from "./telas/Incluir";
import { Inicio } from "./telas/Inicio";
import { Estrategia, type SecaoEstrategia } from "./telas/Estrategia";
import { NovaAnalise } from "./telas/NovaAnalise";
import { PerfilPorArea } from "./telas/PerfilPorArea";
import { RaioX } from "./telas/RaioX";
import { Relatorio } from "./telas/Relatorio";
import { TelaResultado } from "./telas/TelaResultado";
import { Marca } from "./ui/Marca";

type Tela =
  | { nome: "inicio" }
  | { nome: "analise" }
  | { nome: SecaoEstrategia }
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
  const nomes: Record<Tela["nome"], string> = { inicio: "Visão geral", analise: "Nova análise", incluir: "Incluir prova", raiox: "Raio-X pela nota", resultado: "Resultado da prova", corrigir: "Corrigir prova", foco: "Onde focar", relatorio: "Relatório", ingresso: "Cenários Sisu", habilidades: "Mapa de habilidades", plano: "Plano da semana", metodo: "Base e método" };
  return (
    <div className="bizu-shell">
      <aside className="bizu-sidebar"><a href="#inicio" onClick={e => { e.preventDefault(); inicio(); }} aria-label="Meu Bizu, início"><Marca /></a><p className="bizu-slogan">DA PROVA AO PRÓXIMO PASSO.</p><span className="bizu-nav-label">SEU ENEM</span><nav aria-label="Navegação principal">
        <button className={tela.nome === "inicio" ? "ativo" : ""} onClick={inicio}><span>◫</span> Visão geral</button>
        <button className={tela.nome === "analise" ? "ativo" : ""} onClick={() => setTela({ nome: "analise" })}><span>＋</span> Nova análise</button>
        <button className={tela.nome === "incluir" ? "ativo" : ""} onClick={incluir}><span>▤</span> Incluir prova</button>
        <button className={tela.nome === "raiox" ? "ativo" : ""} onClick={() => setTela({ nome: "raiox" })}><span>◎</span> Raio-X pela nota</button>
        <button className={tela.nome === "habilidades" ? "ativo" : ""} onClick={() => setTela({ nome: "habilidades" })}><span>⌁</span> Mapa de habilidades</button>
        <button className={tela.nome === "ingresso" ? "ativo" : ""} onClick={() => setTela({ nome: "ingresso" })}><span>◇</span> Cenários Sisu</button>
        <button className={tela.nome === "plano" ? "ativo" : ""} onClick={() => setTela({ nome: "plano" })}><span>☑</span> Plano da semana</button>
        <button className={tela.nome === "metodo" ? "ativo" : ""} onClick={() => setTela({ nome: "metodo" })}><span>▥</span> Base e método</button>
      </nav><div className="bizu-sidebar-base"><strong>Referência do INEP</strong><p>Notas, questões e comparativos calculados com a base do Enem.</p><div className="bizu-usuario"><span>{eu.data.nome.slice(0, 1).toUpperCase()}</span><div><strong>{eu.data.nome}</strong><button type="button" onClick={() => sair.mutate()}>Sair da conta</button></div></div></div></aside>
      <div className="bizu-body"><header className="bizu-topbar"><span>Meu caminho <b>/</b> <strong>{nomes[tela.nome]}</strong></span><span className="bizu-live">● Conectado à base do Enem</span></header>
      <main className="app bizu-content">
      {tela.nome === "inicio" && (
        <Inicio
          usuario={eu.data}
          aoIncluir={incluir}
          aoRaioX={() => setTela({ nome: "raiox" })}
          aoNovaAnalise={() => setTela({ nome: "analise" })}
          aoCenarios={() => setTela({ nome: "ingresso" })}
          aoPlano={() => setTela({ nome: "plano" })}
          aoMapa={() => setTela({ nome: "habilidades" })}
          aoAbrir={resultado}
          aoVerFoco={(area) => setTela({ nome: "foco", area })}
          aoVerRelatorio={() => setTela({ nome: "relatorio", area: null })}
        />
      )}
      {tela.nome === "analise" && <NovaAnalise aoVoltar={inicio} aoIncluirProva={incluir} aoVerDiagnostico={area => setTela({ nome: "foco", area })} aoCenarios={() => setTela({ nome: "ingresso" })} aoPlano={() => setTela({ nome: "plano" })} />}
      {["ingresso", "habilidades", "plano", "metodo"].includes(tela.nome) && <Estrategia secao={tela.nome as SecaoEstrategia} usuarioId={eu.data.id} aoAnalisar={() => setTela({ nome: "analise" })} aoRaioX={() => setTela({ nome: "raiox" })} aoDiagnostico={area => setTela({ nome: "foco", area })} />}
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
      </main><footer className="bizu-footer">Meu Bizu <span>Suas respostas. Sua análise. Seu próximo passo.</span></footer></div>
    </div>
  );
}

/** Carrega a prova gravada e abre o formulário já preenchido com ela. */
function Corrigir(props: { id: string; aoVoltar: () => void; aoSalvar: (id: string) => void }) {
  const prova = useQuery({ queryKey: ["prova", props.id], queryFn: () => api.prova(props.id) });
  if (prova.isPending) return <p className="carregando">Carregando…</p>;
  if (prova.isError) return <p className="erro">{prova.error.message}</p>;
  return <Incluir edicao={prova.data} aoVoltar={props.aoVoltar} aoGravar={props.aoSalvar} />;
}


