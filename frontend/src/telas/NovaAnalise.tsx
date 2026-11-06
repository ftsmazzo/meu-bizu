import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, type Area, type Resultado } from "../api";
import { executarAnalise, lerSequencia, type EntradaAnalise } from "../fluxo";
import { folhaEmTexto, resumo, type Folha } from "../folha";
import { AREAS, nomeDaArea } from "../rotulos";
import { Grade } from "./Grade";
import { RaioXPainel } from "./RaioXPainel";

interface FolhaArea {
  ativa: boolean;
  coProva: number | null;
  total: number;
  folha: Folha;
}
const vazia = (): FolhaArea => ({ ativa: false, coProva: null, total: 0, folha: [] });
const vazias = (): Record<Area, FolhaArea> => ({ LC: vazia(), CH: vazia(), CN: vazia(), MT: vazia() });
const passos = ["Notas e localização", "Respostas do aluno", "Conferir e gerar", "Seu Raio-X"];
const lerNota = (s: string) => s.trim() === "" ? null : Number(s.replace(",", "."));

interface Props {
  aoVoltar: () => void;
  aoIncluirProva: () => void;
  aoVerDiagnostico: (area: Area) => void;
  aoCenarios?: () => void;
  aoPlano?: () => void;
}

/** Fluxo real, autenticado, sem notas ou folhas pré-preenchidas. */
export function NovaAnalise({ aoVoltar, aoIncluirProva, aoVerDiagnostico, aoCenarios, aoPlano }: Props) {
  const cliente = useQueryClient();
  const [passo, setPasso] = useState(1);
  const [ano, setAno] = useState<number | null>(null);
  const [notas, setNotas] = useState<Partial<Record<Area, string>>>({});
  const [lingua, setLingua] = useState<number | null>(null);
  const [uf, setUf] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [folhas, setFolhas] = useState(vazias);
  const [mensagem, setMensagem] = useState("");
  const salvas = useRef(new Map<string, Resultado>());
  const anos = useQuery({ queryKey: ["anos"], queryFn: api.anos });
  const ufs = useQuery({ queryKey: ["ufs", ano], queryFn: () => api.ufs(ano!), enabled: ano !== null });
  const municipios = useQuery({ queryKey: ["municipios", ano, uf], queryFn: () => api.municipios(ano!, uf), enabled: ano !== null && uf !== "" });
  const provas = useQuery({ queryKey: ["provas"], queryFn: api.provas });
  const numericas = Object.fromEntries(AREAS.map(a => [a.valor, lerNota(notas[a.valor] ?? "")]).filter(([, n]) => n !== null)) as Partial<Record<Area, number>>;
  const notaInvalida = Object.values(numericas).some(n => !Number.isFinite(n) || n < 0 || n > 1000);
  const selecionadas = AREAS.filter(a => folhas[a.valor].ativa);
  const precisaLingua = numericas.LC !== undefined || folhas.LC.ativa;
  const faltando = selecionadas.some(a => {
    const f = folhas[a.valor];
    return !f.coProva || !f.total || f.folha.length !== f.total || resumo(f.folha).faltam > 0;
  });
  const contextoOk = ano !== null && !notaInvalida && (numericas.LC === undefined || lingua !== null);
  const pronto = contextoOk && (!precisaLingua || lingua !== null) && !faltando && (Object.keys(numericas).length > 0 || selecionadas.length > 0);

  const gerar = useMutation({
    mutationFn: () => {
      if (!pronto) throw new Error("Confira as notas, o caderno e as respostas antes de gerar.");
      const entrada: EntradaAnalise = {
        ano: ano!, notas: numericas, lingua: precisaLingua ? lingua : null, uf: uf || null, municipio: municipio || null,
        provas: selecionadas.map(a => ({ area: a.valor, co_prova: folhas[a.valor].coProva!, total: folhas[a.valor].total, folha: folhaEmTexto(folhas[a.valor].folha) })),
      };
      return executarAnalise(entrada, api, salvas.current, setMensagem);
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ["provas"] });
      void cliente.invalidateQueries({ queryKey: ["perfil"] });
      void cliente.invalidateQueries({ queryKey: ["raiox-salvos"] });
      setPasso(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  function ir(p: number) { setPasso(p); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function alterarFolha(area: Area, parte: Partial<FolhaArea>) { setFolhas(atual => ({ ...atual, [area]: { ...atual[area], ...parte } })); }
  function nova() { gerar.reset(); salvas.current.clear(); setAno(null); setNotas({}); setLingua(null); setUf(""); setMunicipio(""); setFolhas(vazias()); setMensagem(""); ir(1); }

  const resultado = gerar.data;
  const areasComProva = [...new Set([...(provas.data ?? []).filter(p => p.ano === ano).map(p => p.area), ...(resultado?.provas ?? []).map(p => p.area)])];
  return <div className="analise-guiada">
    <div className="titulo-pagina"><div><span className="sobretitulo">DA SUA PROVA À SUA PRÓXIMA DECISÃO</span><h1>Faça uma análise do seu Enem.</h1><p>Informe seus dados, registre as respostas e gere comparativos com a referência do INEP.</p></div><button className="link" type="button" onClick={aoVoltar}>← Início</button></div>
    <ol className="trilha-analise" aria-label="Etapas da análise">{passos.map((p, i) => <li key={p} className={passo === i + 1 ? "atual" : passo > i + 1 ? "feito" : ""} aria-current={passo === i + 1 ? "step" : undefined}><span>{passo > i + 1 ? "✓" : i + 1}</span><div>{p}</div></li>)}</ol>

    {passo === 1 && <form className="card passo-card" onSubmit={e => { e.preventDefault(); if (contextoOk) ir(2); }}>
      <div className="cabecalho-passo"><span className="numero-passo">01</span><div><h2>Qual edição você quer analisar?</h2><p>Use as notas da mesma edição. As respostas serão corrigidas pelo caderno que você selecionar.</p></div></div>
      <label>Ano do Enem<select value={ano ?? ""} onChange={e => { setAno(e.target.value ? Number(e.target.value) : null); setFolhas(vazias()); setNotas({}); setUf(""); setMunicipio(""); salvas.current.clear(); }} required><option value="">Selecione o ano…</option>{[...(anos.data ?? [])].sort((a,b) => b-a).map(a => <option key={a} value={a}>{a}</option>)}</select></label>
      {anos.isPending && <p className="carregando">Consultando as edições disponíveis na base…</p>}
      {anos.isError && <p className="erro">{anos.error.message}</p>}
      <h3 className="secao-form">Suas notas nas áreas objetivas</h3><div className="notas-guiadas">{AREAS.map(a => <label key={a.valor}>{a.nome}<input aria-label={`Nota de ${a.nome}`} inputMode="decimal" placeholder="Informe sua nota" value={notas[a.valor] ?? ""} onChange={e => setNotas({ ...notas, [a.valor]: e.target.value })} /></label>)}</div>
      <p className="mudo pequeno">Você pode informar só as áreas que conhece. Sem nota, as respostas podem permitir uma estimativa, sempre identificada no resultado.</p>
      {notaInvalida && <p className="erro">Cada nota deve estar entre 0 e 1000.</p>}
      <label>Língua estrangeira de Linguagens<select value={lingua ?? ""} onChange={e => { setLingua(e.target.value === "" ? null : Number(e.target.value)); alterarFolha("LC", { coProva: null, total: 0, folha: [] }); }}><option value="">Selecione se for analisar Linguagens…</option><option value="0">Inglês</option><option value="1">Espanhol</option></select></label>
      <h3 className="secao-form">Onde você fez a prova?</h3><div className="campos-lado"><label>Estado da prova<select disabled={!ano || ufs.isPending} value={uf} onChange={e => { setUf(e.target.value); setMunicipio(""); }}><option value="">Comparar apenas com o Brasil</option>{ufs.data?.map(u => <option key={u.uf} value={u.uf}>{u.uf}</option>)}</select></label><label>Município da prova<select disabled={!uf || municipios.isPending} value={municipio} onChange={e => setMunicipio(e.target.value)}><option value="">Não informar município</option>{municipios.data?.map(m => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}</select></label></div>
      {(ufs.isError || municipios.isError) && <p className="erro">Não foi possível carregar a referência geográfica. Você pode continuar com o Brasil ou tentar novamente.</p>}
      <p className="aviso-suave">O local é o de aplicação da prova. Só aparecem estados e municípios com referência disponível; ausência de dado não será mostrada como zero.</p>
      <div className="rodape-passo"><span>Próximo: incluir as respostas, se você tiver a folha do aluno.</span><button className="primario" disabled={!contextoOk}>Continuar para respostas →</button></div>
    </form>}

    {passo === 2 && <section className="card passo-card"><div className="cabecalho-passo"><span className="numero-passo">02</span><div><h2>O que o aluno marcou na prova?</h2><p>Adicione as áreas que deseja corrigir. As notas sozinhas geram o comparativo; as respostas permitem analisar os erros individuais.</p></div></div>
      {AREAS.map(a => <div className="folha-area" key={a.valor}><label className="habilitar-area"><input type="checkbox" checked={folhas[a.valor].ativa} onChange={e => alterarFolha(a.valor, { ativa: e.target.checked })} /><span><strong>Adicionar respostas de {a.nome}</strong><small>{notas[a.valor] ? `Nota informada: ${notas[a.valor]}` : "Nota não informada"}</small></span><span aria-hidden="true">{folhas[a.valor].ativa ? "−" : "+"}</span></label>
        {folhas[a.valor].ativa && <EntradaFolha area={a.valor} ano={ano!} lingua={lingua} aoLingua={setLingua} valor={folhas[a.valor]} aoMudar={parte => alterarFolha(a.valor, parte)} />}</div>)}
      {!selecionadas.length && <p className="aviso-suave">Você está seguindo só com as notas. O resultado não vai afirmar quais questões o aluno acertou ou errou.</p>}
      {selecionadas.length > 0 && faltando && <p className="mudo pequeno">Escolha os cadernos e complete as respostas das áreas selecionadas para continuar.</p>}
      <div className="rodape-passo"><button type="button" onClick={() => ir(1)}>← Notas e localização</button><button className="primario" type="button" disabled={!pronto} onClick={() => ir(3)}>Conferir análise →</button></div>
    </section>}

    {passo === 3 && <section className="card passo-card"><div className="cabecalho-passo"><span className="numero-passo">03</span><div><h2>Confira antes de gerar.</h2><p>As respostas serão gravadas na sua conta, corrigidas no servidor e cruzadas com o Raio-X.</p></div></div>
      <div className="resumo-contexto"><div><small>Edição</small><strong>Enem {ano}</strong></div><div><small>Comparativos solicitados</small><strong>{["Brasil", uf, municipios.data?.find(m => m.codigo === municipio)?.nome].filter(Boolean).join(" · ")}</strong></div><div><small>Respostas incluídas</small><strong>{selecionadas.length} {selecionadas.length === 1 ? "área" : "áreas"}</strong></div></div>
      <div className="resumo-areas">{AREAS.filter(a => numericas[a.valor] !== undefined || folhas[a.valor].ativa).map(a => <div className="resumo-area" key={a.valor}><strong>{a.nome}</strong><span>{numericas[a.valor] !== undefined ? `Nota: ${numericas[a.valor]}` : "Nota a estimar pelos acertos"}</span><small>{folhas[a.valor].ativa ? `${folhas[a.valor].total} respostas · caderno ${folhas[a.valor].coProva} · ${resumo(folhas[a.valor].folha).brancos} em branco` : "Somente nota · sem correção individual"}</small></div>)}</div>
      {gerar.isPending && <p className="carregando" role="status">{mensagem}</p>}
      {gerar.isError && <p className="erro" role="alert">{gerar.error.message}{salvas.current.size > 0 && " As provas já corrigidas continuam salvas na sua conta. Ao tentar novamente, elas não serão gravadas outra vez nesta análise."}</p>}
      <div className="rodape-passo"><button type="button" disabled={gerar.isPending} onClick={() => ir(2)}>← Editar respostas</button><button className="primario grande" type="button" disabled={gerar.isPending || !pronto} onClick={() => gerar.mutate()}>{gerar.isPending ? "Gerando análise…" : "Salvar, corrigir e gerar Raio-X →"}</button></div>
    </section>}

    {passo === 4 && resultado && <div className="resultado-guiado"><div className="resultado-pronto"><div><strong>✓ Análise calculada com a referência do INEP</strong><span>{resultado.provas.length ? `${resultado.provas.length} ${resultado.provas.length === 1 ? "prova corrigida e salva" : "provas corrigidas e salvas"} na sua conta.` : "Comparativo calculado a partir das notas informadas."}</span></div><div className="acoes"><button type="button" onClick={() => { gerar.reset(); ir(1); }}>Editar entradas</button><button type="button" className="primario" onClick={nova}>Nova análise</button><button type="button" onClick={() => window.print()}>Imprimir / salvar PDF</button></div></div>
      {resultado.estimadas.length > 0 && <p className="aviso">Notas estimadas pelos acertos em {resultado.estimadas.map(nomeDaArea).join(", ")}. Elas não substituem a nota oficial do INEP.</p>}
      {resultado.dados.areas.map(a => {
        const ausentes = [!a.brasil ? "Brasil" : "", uf && !a.uf ? uf : "", municipio && !a.municipio ? "município selecionado" : ""].filter(Boolean);
        return ausentes.length ? <p className="aviso-suave" key={a.area}>{nomeDaArea(a.area)}: referência não disponível para {ausentes.join(", ")} nesta edição.</p> : null;
      })}
      <RaioXPainel dados={resultado.dados} aoVoltar={aoVoltar} aoRefazer={() => { gerar.reset(); ir(1); }} aoIncluirProva={aoIncluirProva} areasComProva={areasComProva} aoVerDiagnostico={aoVerDiagnostico} />
      <section className="card proximo-estrategia"><div><span className="sobretitulo">CONTINUAR A PARTIR DO SEU RESULTADO</span><h2>Agora, escolha o próximo passo.</h2><p>Leve as notas para os cenários por curso e use suas habilidades para organizar a revisão.</p></div><div className="acoes">{aoCenarios&&<button type="button" className="primario" onClick={aoCenarios}>Comparar cenários Sisu →</button>}{aoPlano&&<button type="button" onClick={aoPlano}>Montar plano da semana →</button>}</div></section>
    </div>}
  </div>;
}

function EntradaFolha({ area, ano, lingua, aoLingua, valor, aoMudar }: { area: Area; ano: number; lingua: number | null; aoLingua: (n: number | null) => void; valor: FolhaArea; aoMudar: (parte: Partial<FolhaArea>) => void }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const cadernos = useQuery({ queryKey: ["cadernos", ano, area], queryFn: () => api.cadernos(ano, area) });
  const questoes = useQuery({ queryKey: ["questoes", valor.coProva, ano, area, lingua], queryFn: () => api.questoes(valor.coProva!, ano, area, area === "LC" ? lingua : null), enabled: valor.coProva !== null && (area !== "LC" || lingua !== null), staleTime: Infinity });
  const total = questoes.data?.length ?? 0;
  useEffect(() => { if (total && (valor.total !== total || valor.folha.length !== total)) aoMudar({ total, folha: Array(total).fill(null) }); }, [total, valor.total, valor.folha.length]);
  const conta = resumo(valor.folha);
  function colar() { try { const folha = lerSequencia(texto, total); aoMudar({ folha }); setErro(""); } catch (e) { setErro((e as Error).message); } }
  return <div className="entrada-folha">
    {area === "LC" && <label>Língua estrangeira desta prova<select value={lingua ?? ""} onChange={e => { aoLingua(e.target.value === "" ? null : Number(e.target.value)); aoMudar({ total: 0, folha: [] }); }}><option value="">Selecione…</option><option value="0">Inglês</option><option value="1">Espanhol</option></select></label>}
    <label>Caderno de {nomeDaArea(area)}<select value={valor.coProva ?? ""} disabled={cadernos.isPending} onChange={e => { aoMudar({ coProva: e.target.value ? Number(e.target.value) : null, total: 0, folha: [] }); setTexto(""); setErro(""); }}><option value="">Escolha a cor e o código da capa…</option>{cadernos.data?.map(c => <option key={c.co_prova} value={c.co_prova} disabled={!c.selecionavel}>{c.rotulo}{!c.selecionavel ? ` — ${c.motivo}` : ""}</option>)}</select></label>
    {cadernos.isError && <p className="erro">{cadernos.error.message}</p>}
    {questoes.isFetching && <p className="carregando">Carregando as questões deste caderno…</p>}
    {questoes.isError && <p className="erro">{questoes.error.message}</p>}
    {total > 0 && <><label>Sequência de respostas de {nomeDaArea(area)}<textarea aria-label={`Sequência de respostas de ${nomeDaArea(area)}`} rows={3} value={texto} onChange={e => setTexto(e.target.value)} placeholder={`Cole as ${total} respostas na ordem do caderno`} /><small>A a E para as alternativas; ponto para em branco; asterisco para dupla marcação. Pode separar por espaço ou quebra de linha.</small></label><div className="acoes"><button type="button" disabled={!texto.trim()} onClick={colar}>Aplicar sequência</button><span className="contador-folha">{valor.folha.length - conta.faltam} de {total} preenchidas</span></div>{erro && <p className="erro" role="alert">{erro}</p>}
      <details className="grade-expansivel"><summary>Marcar ou conferir uma questão por vez</summary>{questoes.data && valor.folha.length === total && <Grade questoes={questoes.data} folha={valor.folha} aoMarcar={(i, marca) => aoMudar({ folha: valor.folha.map((m, j) => i === j ? marca : m) })} />}</details>
      {conta.faltam > 0 && <button className="link" type="button" onClick={() => aoMudar({ folha: valor.folha.map(m => m ?? ".") })}>Marcar as {conta.faltam} restantes como em branco</button>}
      {conta.faltam === 0 && valor.folha.length === total && <p className="folha-completa">✓ Folha completa: {conta.marcadas} alternativas, {conta.brancos} em branco e {conta.duplas} duplas. Confira antes de gerar.</p>}
    </>}
  </div>;
}

