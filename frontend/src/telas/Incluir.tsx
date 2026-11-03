import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, type Area, type Resultado, type Tipo } from "../api";
import {
  avisos,
  folhaDeTexto,
  folhaEmTexto,
  lerColagem,
  resumo,
  type Folha,
  type Marca,
} from "../folha";
import { prepararFoto } from "../foto";
import { AREAS } from "../rotulos";
import { Grade } from "./Grade";

const CHAVE = "bizu:rascunho";

interface Rascunho {
  ano: number | null;
  area: Area | null;
  lingua: number | null;
  coProva: number | null;
  tipo: Tipo;
  feitaEm: string;
  nota: string;
  folha: Folha;
}

const VAZIO: Rascunho = {
  ano: null,
  area: null,
  lingua: null,
  coProva: null,
  tipo: "enem",
  feitaEm: "",
  nota: "",
  folha: [],
};

// O rascunho só vive no navegador; storage bloqueado não pode quebrar a tela.
function lerRascunho(): Rascunho {
  try {
    const texto = localStorage.getItem(CHAVE);
    if (texto) return { ...VAZIO, ...JSON.parse(texto) };
  } catch {
    /* sem rascunho */
  }
  return VAZIO;
}

function guardarRascunho(r: Rascunho | null) {
  try {
    if (r) localStorage.setItem(CHAVE, JSON.stringify(r));
    else localStorage.removeItem(CHAVE);
  } catch {
    /* segue sem rascunho */
  }
}

/** Abre uma prova já gravada no mesmo formulário, para o aluno corrigir. */
function deResultado(p: Resultado): Rascunho {
  return {
    ano: p.ano,
    area: p.area,
    lingua: p.lingua,
    coProva: p.co_prova,
    tipo: p.tipo,
    feitaEm: p.feita_em ?? "",
    nota: p.nota === null ? "" : String(p.nota).replace(".", ","),
    folha: folhaDeTexto(p.folha),
  };
}

function hoje(): string {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

const PASSOS = ["Prova", "Respostas", "Conferir"];

interface Props {
  aoVoltar: () => void;
  aoGravar: (id: string) => void;
  /** Quando vem, o formulário corrige esta prova em vez de criar outra (e não mexe no rascunho). */
  edicao?: Resultado;
}

export function Incluir(props: Props) {
  const { edicao } = props;
  const cliente = useQueryClient();
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [r, setR] = useState<Rascunho>(() => (edicao ? deResultado(edicao) : lerRascunho()));
  const mudar = (parte: Partial<Rascunho>) => setR((a) => ({ ...a, ...parte }));
  const [colado, setColado] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [codigoColado, setCodigoColado] = useState<number | null>(null);
  const [daColagem, setDaColagem] = useState(false);
  // Trocar qualquer coisa que defina a prova invalida as respostas já marcadas.
  const trocarProva = (parte: Partial<Rascunho>) => {
    setDaColagem(false);
    mudar({ ...parte, folha: [] });
  };

  function preencherPelaColagem() {
    const c = lerColagem(colado);
    if (c.folha.length === 0) {
      setAviso("Não achei a sequência de respostas no texto colado.");
      return;
    }
    const ano = c.ano ?? r.ano;
    const area = c.area ?? r.area;
    const mudouProva = c.codigo !== null || c.ano !== null || c.area !== null;
    setAviso(null);
    setDaColagem(true);
    setCodigoColado(c.codigo !== null && ano !== null && area !== null ? c.codigo : null);
    setR((a) => ({
      ...a,
      ano,
      area,
      lingua: c.lingua ?? (c.area !== null && c.area !== "LC" ? null : a.lingua),
      coProva: mudouProva ? null : a.coProva,
      folha: c.folha,
    }));
    setColado("");
  }

  useEffect(() => {
    if (!edicao) guardarRascunho(r);
  }, [r, edicao]);

  const anos = useQuery({ queryKey: ["anos"], queryFn: api.anos });
  const cadernos = useQuery({
    queryKey: ["cadernos", r.ano, r.area],
    queryFn: () => api.cadernos(r.ano as number, r.area as Area),
    enabled: r.ano !== null && r.area !== null,
  });
  const linguaPendente = r.area === "LC" && r.lingua === null;
  const questoes = useQuery({
    queryKey: ["questoes", r.coProva, r.ano, r.area, r.lingua],
    queryFn: () => api.questoes(r.coProva as number, r.ano as number, r.area as Area, r.lingua),
    enabled: passo >= 2 && r.coProva !== null && !linguaPendente,
    staleTime: Infinity,
  });

  const total = questoes.data?.length;
  useEffect(() => {
    if (total === undefined || r.folha.length === total) return;
    if (r.folha.length > 0) {
      setAviso(
        `A sequência colada tem ${r.folha.length} respostas, mas esta prova tem ${total} questões. ` +
          "Confira o ano, a área, a língua e o caderno.",
      );
    }
    mudar({ folha: Array(total).fill(null) });
  }, [total, r.folha.length]);

  const notaNum = r.nota.trim() === "" ? null : Number(r.nota.replace(",", "."));
  const notaOk = notaNum === null || (Number.isFinite(notaNum) && notaNum >= 0 && notaNum <= 1000);
  const dataOk = r.tipo === "enem" || (r.feitaEm !== "" && r.feitaEm <= hoje());
  const passo1Ok = r.coProva !== null && !linguaPendente && dataOk && notaOk;

  // O código do caderno colado só vale se existir naquele ano e área: é o que pega o ano errado.
  useEffect(() => {
    if (codigoColado === null || !cadernos.data) return;
    setCodigoColado(null);
    const achado = cadernos.data.find((c) => c.co_prova === codigoColado);
    if (achado?.selecionavel) {
      mudar({ coProva: achado.co_prova });
      if (!linguaPendente && dataOk && notaOk) setPasso(2);
    } else {
      setAviso(
        `O caderno ${codigoColado} não existe em ${r.ano} para esta área. ` +
          "Confira o ano e escolha o caderno na lista (o código está na capa da prova).",
      );
    }
  }, [codigoColado, cadernos.data]);

  const gravar = useMutation({
    mutationFn: () => {
      const prova = {
        ano: r.ano as number,
        area: r.area as Area,
        co_prova: r.coProva as number,
        lingua: r.area === "LC" ? r.lingua : null,
        tipo: r.tipo,
        feita_em: r.tipo === "simulado" ? r.feitaEm : null,
        nota: notaNum,
        folha: folhaEmTexto(r.folha),
      };
      return edicao ? api.editarProva(edicao.id, prova) : api.gravarProva(prova);
    },
    onSuccess: (resultado) => {
      cliente.setQueryData(["prova", resultado.id], resultado);
      void cliente.invalidateQueries({ queryKey: ["provas"] });
      void cliente.invalidateQueries({ queryKey: ["perfil"] });
      if (!edicao) guardarRascunho(null);
      props.aoGravar(resultado.id);
    },
  });

  // A foto só preenche o que ainda está sem resposta: nada do que o aluno marcou é sobrescrito.
  const foto = useMutation({
    mutationFn: async (arquivo: File) => {
      const preparada = await prepararFoto(arquivo);
      return api.lerFoto({ ...preparada, questoes: r.folha.length });
    },
    onSuccess: ({ respostas }) => {
      const lida = folhaDeTexto(respostas);
      setR((a) => ({ ...a, folha: a.folha.map((m, i) => m ?? lida[i] ?? null) }));
      const ilegiveis = lida.filter((m) => m === null).length;
      setAviso(
        "Li a foto. Confira cada resposta com a sua folha na mão antes de gravar." +
          (ilegiveis > 0
            ? ` ${ilegiveis} ${ilegiveis === 1 ? "questão não deu" : "questões não deram"} para ler e ficaram sem resposta.`
            : ""),
      );
    },
  });

  function marcar(indice: number, marca: Marca | null) {
    setR((a) => ({ ...a, folha: a.folha.map((m, j) => (j === indice ? marca : m)) }));
  }

  const conta = resumo(r.folha);

  return (
    <>
      <button type="button" className="link" onClick={props.aoVoltar}>
        ← Voltar
      </button>
      <h1>{edicao ? "Corrigir prova" : "Incluir resultado"}</h1>
      <ol className="passos">
        {PASSOS.map((nome, i) => (
          <li key={nome} aria-current={passo === i + 1 ? "step" : undefined}>
            {i + 1}. {nome}
          </li>
        ))}
      </ol>

      {aviso && <p className="aviso">{aviso}</p>}

      {passo === 1 && !edicao && (
        <section className="card colagem">
          <label>
            Tem as respostas em texto? Cole aqui
            <textarea
              rows={3}
              value={colado}
              onChange={(e) => setColado(e.target.value)}
              placeholder="Ex.: 2023 · LC · Inglês · AZUL 1201 · B.AADCAAAEDCC…"
            />
            <small>
              Com ano, área, caderno e respostas no texto, preenchemos tudo e você só confere. Só com
              as respostas, preenchemos só elas.
            </small>
          </label>
          <button type="button" onClick={preencherPelaColagem} disabled={colado.trim() === ""}>
            Preencher com o texto
          </button>
        </section>
      )}

      {passo === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (passo1Ok) setPasso(2);
          }}
        >
          <label>
            Ano da prova
            <select
              value={r.ano ?? ""}
              onChange={(e) =>
                trocarProva({ ano: e.target.value ? Number(e.target.value) : null, coProva: null })
              }
            >
              <option value="">Escolha…</option>
              {[...(anos.data ?? [])]
                .sort((a, b) => b - a)
                .map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Área
            <select
              value={r.area ?? ""}
              onChange={(e) =>
                trocarProva({ area: (e.target.value || null) as Area | null, coProva: null })
              }
            >
              <option value="">Escolha…</option>
              {AREAS.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>

          {r.area === "LC" && (
            <label>
              Língua estrangeira
              <select
                value={r.lingua ?? ""}
                onChange={(e) =>
                  trocarProva({ lingua: e.target.value === "" ? null : Number(e.target.value) })
                }
              >
                <option value="">Escolha…</option>
                <option value="0">Inglês</option>
                <option value="1">Espanhol</option>
              </select>
            </label>
          )}

          <label>
            Caderno (a cor e o código estão na capa da prova)
            <select
              value={r.coProva ?? ""}
              disabled={!cadernos.data}
              onChange={(e) => {
                const coProva = e.target.value ? Number(e.target.value) : null;
                // Respostas coladas continuam valendo quando só o caderno é escolhido à mão.
                if (daColagem) mudar({ coProva });
                else trocarProva({ coProva });
              }}
            >
              <option value="">Escolha…</option>
              {cadernos.data?.map((c) => (
                <option key={c.co_prova} value={c.co_prova} disabled={!c.selecionavel}>
                  {c.rotulo}
                  {c.selecionavel ? "" : ` — ${c.motivo}`}
                </option>
              ))}
            </select>
          </label>
          {cadernos.isError && <p className="erro">{cadernos.error.message}</p>}

          <fieldset>
            <legend>Como você fez</legend>
            <label className="linha">
              <input
                type="radio"
                name="tipo"
                checked={r.tipo === "enem"}
                onChange={() => mudar({ tipo: "enem" })}
              />
              Fiz no Enem
            </label>
            <label className="linha">
              <input
                type="radio"
                name="tipo"
                checked={r.tipo === "simulado"}
                onChange={() => mudar({ tipo: "simulado" })}
              />
              Refiz como simulado
            </label>
          </fieldset>

          {r.tipo === "simulado" && (
            <label>
              Data em que você fez
              <input
                type="date"
                max={hoje()}
                value={r.feitaEm}
                onChange={(e) => mudar({ feitaEm: e.target.value })}
              />
            </label>
          )}

          <label>
            Nota (opcional)
            <input
              inputMode="decimal"
              value={r.nota}
              onChange={(e) => mudar({ nota: e.target.value })}
              placeholder="Ex.: 612,5"
            />
            <small>Com a nota a comparação melhora. Sem ela, estimamos pelos seus acertos.</small>
          </label>
          {!notaOk && <p className="erro">A nota vai de 0 a 1000.</p>}

          <button type="submit" className="primario" disabled={!passo1Ok}>
            Continuar
          </button>
        </form>
      )}

      {passo === 2 && (
        <>
          {questoes.isPending && <p className="carregando">Carregando as questões…</p>}
          {questoes.isError && <p className="erro">{questoes.error.message}</p>}
          {questoes.data && r.folha.length === questoes.data.length && (
            <>
              <p className="mudo">
                No computador: teclas A a E marcam e avançam, ponto deixa em branco, asterisco é
                dupla marcação, setas navegam. No celular, toque na alternativa.
              </p>
              <p className="mudo">
                Respondidas: {r.folha.length - conta.faltam} de {r.folha.length}
              </p>
              <section className="card colagem">
                <label>
                  Ler de uma foto da minha folha
                  <input
                    type="file"
                    accept="image/*"
                    disabled={foto.isPending}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = ""; // permite escolher a mesma foto de novo
                      if (arquivo) foto.mutate(arquivo);
                    }}
                  />
                  <small>
                    Fotografe a folha inteira, reta e bem iluminada. A IA lê as marcações, preenche só
                    o que está sem resposta e você confere. A foto não fica guardada. Se tiver nome ou
                    CPF na folha, cubra ou recorte.
                  </small>
                </label>
                {foto.isPending && <p className="carregando">Lendo a foto…</p>}
                {foto.isError && <p className="erro">{foto.error.message}</p>}
              </section>
              <Grade questoes={questoes.data} folha={r.folha} aoMarcar={marcar} />
            </>
          )}
          <div className="acoes">
            <button type="button" onClick={() => setPasso(1)}>
              Voltar
            </button>
            <button
              type="button"
              className="primario"
              disabled={!questoes.data}
              onClick={() => setPasso(3)}
            >
              Conferir
            </button>
          </div>
        </>
      )}

      {passo === 3 && (
        <>
          <p>
            Marcadas: {conta.marcadas} · Em branco: {conta.brancos} · Dupla marcação: {conta.duplas}
            {conta.faltam > 0 && ` · Sem resposta: ${conta.faltam}`}
          </p>
          {avisos(r.folha).map((a) => (
            <p key={a} className="aviso">
              {a}
            </p>
          ))}
          {conta.faltam > 0 && (
            <button type="button" onClick={() => mudar({ folha: r.folha.map((m) => m ?? ".") })}>
              Marcar o que falta como em branco
            </button>
          )}
          {gravar.isError && <p className="erro">{gravar.error.message}</p>}
          <div className="acoes">
            <button type="button" onClick={() => setPasso(2)}>
              Voltar
            </button>
            <button
              type="button"
              className="primario"
              disabled={conta.faltam > 0 || gravar.isPending}
              onClick={() => gravar.mutate()}
            >
              {edicao ? "Salvar correção" : "Gravar resultado"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
