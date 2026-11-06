import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Estrategia } from "./Estrategia";
import { App } from "../App";
import catalogo from "../../public/catalogo-sisu.json";

beforeEach(()=>{
  localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(){this.setAttribute("open","");}});
  vi.stubGlobal("scrollTo",vi.fn());
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
    if(url==="/catalogo-sisu.json")return new Response(JSON.stringify(catalogo));
    if(url==="/conta/eu")return new Response(JSON.stringify({id:"usuario-teste",nome:"Pessoa de teste",email:"teste@example.invalid"}));
    if(url==="/anos")return new Response(JSON.stringify([2024,2025]));
    if(url==="/provas")return new Response("[]");
    if(url==="/perfil")return new Response(JSON.stringify({areas:[],provas:[],habilidades:[{area:"MT",habilidade:16,n:10,acertos:3,taxa:.3,esperado:.7,lacuna:-.4,z:-2,selo:"firme",armadilhas:0,descricao:"Proporções e grandezas"}]}));
    if(url==="/raio-x/salvos")return new Response(JSON.stringify([{ano:2025,notas:{LC:640,CH:680,CN:610,MT:670},lingua:0,uf:null,municipio:null,atualizado_em:"2026-11-05T10:00:00Z"}]));
    return new Response("{}",{status:404});
  }));
});
function montar(secao:"ingresso"|"plano"|"habilidades"="ingresso"){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  return render(<QueryClientProvider client={client}><Estrategia secao={secao} usuarioId="usuario-teste" aoAnalisar={vi.fn()} aoDiagnostico={vi.fn()} aoRaioX={vi.fn()} /></QueryClientProvider>);
}

it("restaura os módulos sem remover a análise e as provas reais da navegação",async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  const nav=await screen.findByRole("navigation",{name:"Navegação principal"});
  for(const name of ["Visão geral","Nova análise","Incluir prova","Raio-X pela nota","Mapa de habilidades","Cenários Sisu","Plano da semana","Base e método"])expect(within(nav).getByRole("button",{name:new RegExp(name)})).toBeInTheDocument();
});

it("aproveita as quatro notas salvas e oferece opções reais sem inventar Redação",async()=>{
  montar();
  expect(await screen.findByLabelText("Matemática de 2025")).toHaveValue(670);
  expect(screen.getByLabelText("Redação de 2025")).toHaveValue(null);
  expect(screen.queryByText("Nenhuma oferta cadastrada.")).not.toBeInTheDocument();
  expect(screen.getByRole("option",{name:/MEDICINA.*UFMG/})).toBeInTheDocument();
  expect(screen.queryByText("Campus Horizonte")).not.toBeInTheDocument();
});

it("busca por curso sem acento e adiciona uma modalidade preenchida sem alterar notas",async()=>{
  const user=userEvent.setup();montar();
  await screen.findByText(/204 ofertas encontradas/);
  await user.type(screen.getByLabelText("Buscar no catálogo"),"medicina");
  await user.selectOptions(screen.getByLabelText("Instituição do catálogo"),"UFMG");
  await user.selectOptions(screen.getByLabelText("Modalidade do catálogo"),"LI_EP");
  await user.click(screen.getByRole("button",{name:"Adicionar MEDICINA · UFMG · Campus Saúde · Integral (Matutino/Vespertino) · LI_EP"}));
  expect(screen.getByRole("combobox",{name:"Curso de referência da estratégia"})).toHaveValue("ufmg-2026-12970-integral-li_ep");
  expect(screen.getByLabelText("Matemática de 2025")).toHaveValue(670);
  expect(screen.getByLabelText("Redação de 2025")).toHaveValue(null);
  expect(screen.getAllByRole("link",{name:/Termo de adesão 2026/}).length).toBeGreaterThan(0);
  const salvo=JSON.parse(localStorage.getItem("bizu:estrategia:usuario-teste")!);
  expect(salvo.ofertas.find((o:{id:string})=>o.id==="ufmg-2026-12970-integral-li_ep").catalogo.modalidadeCodigo).toBe("LI_EP");
});

it("permite operar oferta, simulação e meta com as notas do Raio-X",async()=>{
  const user=userEvent.setup();montar();
  await user.type(await screen.findByLabelText("Redação de 2025"),"800");
  await user.click(screen.getAllByRole("button",{name:/Adicionar oferta/})[0]);
  const dialog=screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Nome do curso"),"Curso informado");
  await user.type(within(dialog).getByLabelText("Instituição"),"Instituição informada");
  await user.type(within(dialog).getByLabelText("Nota de referência (opcional)"),"700");
  await user.click(within(dialog).getByRole("button",{name:"Salvar oferta"}));
  expect(await screen.findByText("770,0 em Matemática")).toBeInTheDocument();
  const slider=screen.getByRole("slider",{name:"Pontos adicionais em Matemática"});
  fireEvent.change(slider,{target:{value:"200"}});
  expect(screen.getAllByText("720,0").length).toBeGreaterThan(0);
});

it("gera o plano das habilidades da conta e persiste a conclusão por usuário",async()=>{
  const user=userEvent.setup();montar("plano");
  const check=await screen.findByRole("checkbox",{name:"Concluir Revisar · MT H16"});
  await user.click(check);
  await waitFor(()=>expect(JSON.parse(localStorage.getItem("bizu:estrategia:usuario-teste")!).concluidas["MT-H16-Revisar"]).toBe(true));
  expect(screen.getAllByText("Proporções e grandezas").length).toBeGreaterThan(0);
});

it("permite explorar os cálculos sem consultar diagnósticos nem notas privadas",async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  client.setQueryData(["perfil"],{habilidades:[{area:"MT",habilidade:16,n:10,descricao:"Habilidade privada"}]});
  client.setQueryData(["raiox-salvos"],[{ano:2025,notas:{MT:999}}]);
  render(<QueryClientProvider client={client}><Estrategia secao="ingresso" usuarioId="visitante" modoLivre aoAnalisar={vi.fn()} aoRaioX={vi.fn()} aoDiagnostico={vi.fn()} /></QueryClientProvider>);
  await screen.findByRole("option",{name:"2025"});
  expect(screen.queryByLabelText("Matemática de 2025")).not.toBeInTheDocument();
  const chamadas=vi.mocked(fetch).mock.calls.map(c=>c[0]);
  expect(chamadas).not.toContain("/perfil");
  expect(chamadas).not.toContain("/raio-x/salvos");
  expect(localStorage.getItem("bizu:estrategia:visitante")).toBeNull();
});
