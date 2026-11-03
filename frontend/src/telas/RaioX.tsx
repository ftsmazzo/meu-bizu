import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api, type Area } from "../api";
import { AREAS, estiloArea } from "../rotulos";
import { RaioXPainel } from "./RaioXPainel";

const INEP = "https://enem.inep.gov.br/participante/";

/** Converte o texto digitado ("612,5") em número; vazio é "não informou"; inválido é NaN. */
function lerNota(texto: string): number | null {
  if (texto.trim() === "") return null;
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

interface Props {
  aoVoltar: () => void;
  aoIncluirProva: () => void;
  aoVerDiagnostico: (area: Area) => void;
}

const nota1 = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

/** Raio-X pela nota: o aluno informa as notas por área e vê o que costuma acontecer com quem as tem. */
export function RaioX({ aoVoltar, aoIncluirProva, aoVerDiagnostico }: Props) {
  const [ano, setAno] = useState<number | null>(null);
  const [textos, setTextos] = useState<Partial<Record<Area, string>>>({});
  const [lingua, setLingua] = useState<number | null>(null);
  const [uf, setUf] = useState("");
  const [municipio, setMunicipio] = useState("");

  const anos = useQuery({ queryKey: ["anos"], queryFn: api.anos });
  const ufs = useQuery({
    queryKey: ["ufs", ano],
    queryFn: () => api.ufs(ano as number),
    enabled: ano !== null,
  });
  const municipios = useQuery({
    queryKey: ["municipios", ano, uf],
    queryFn: () => api.municipios(ano as number, uf),
    enabled: ano !== null && uf !== "",
  });
  const raiox = useMutation({ mutationFn: api.raioX });
  const provas = useQuery({ queryKey: ["provas"], queryFn: api.provas });

  // A prova mais recente de cada área no ano escolhido (a lista vem em ordem de data).
  const doAno = new Map<Area, NonNullable<typeof provas.data>[number]>();
  for (const p of provas.data ?? []) if (p.ano === ano) doAno.set(p.area, p);

  function usarMinhasProvas() {
    const novos: Partial<Record<Area, string>> = {};
    for (const [area, p] of doAno) {
      const valor = p.nota ?? p.nota_estimada;
      if (valor !== null) novos[area] = nota1(valor);
    }
    setTextos(novos);
    const lc = doAno.get("LC");
    if (lc && lc.lingua !== null) setLingua(lc.lingua);
  }

  const notas = Object.fromEntries(
    AREAS.map((a) => [a.valor, lerNota(textos[a.valor] ?? "")]).filter(
      ([, n]) => n !== null,
    ),
  ) as Partial<Record<Area, number>>;
  const invalida = Object.values(notas).some((n) => !(n >= 0 && n <= 1000));
  const precisaLingua = notas.LC !== undefined && lingua === null;
  const pronto =
    ano !== null &&
    Object.keys(notas).length > 0 &&
    !invalida &&
    !precisaLingua;

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (pronto)
      raiox.mutate({
        ano,
        notas,
        lingua: notas.LC !== undefined ? lingua : null,
        uf: uf || null,
        municipio: municipio || null,
      });
  }

  if (raiox.data) {
    return (
      <RaioXPainel
        dados={raiox.data}
        aoVoltar={aoVoltar}
        aoRefazer={() => raiox.reset()}
        aoIncluirProva={aoIncluirProva}
        areasComProva={[...doAno.keys()]}
        aoVerDiagnostico={aoVerDiagnostico}
      />
    );
  }

  return (
    <>
      <button type="button" className="link" onClick={aoVoltar}>
        ← Voltar
      </button>
      <section className="hero">
        <h1>Raio-X pela nota</h1>
        <p>
          Informe as notas que você tirou no Enem e veja o que costuma acontecer
          com quem tem a sua nota: onde você está, o que esperar da prova e onde
          focar para subir um degrau.
        </p>
      </section>

      <form onSubmit={enviar} className="card" style={{ marginTop: 14 }}>
        <label>
          Ano do Enem
          <select
            value={ano ?? ""}
            onChange={(e) => {
              setAno(e.target.value ? Number(e.target.value) : null);
              setUf("");
              setMunicipio("");
            }}
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

        {ufs.data && ufs.data.length > 0 && (
          <div className="campos-nota">
            <label>
              Estado onde você fez a prova (opcional)
              <select
                value={uf}
                onChange={(e) => {
                  setUf(e.target.value);
                  setMunicipio("");
                }}
              >
                <option value="">Não informar</option>
                {ufs.data.map((u) => (
                  <option key={u.uf} value={u.uf}>
                    {u.uf}
                  </option>
                ))}
              </select>
            </label>
            {uf !== "" && (
              <label>
                Município da prova (opcional)
                <select
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                  disabled={!municipios.data}
                >
                  <option value="">Não informar</option>
                  {municipios.data?.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {ufs.data && ufs.data.length > 0 && (
          <small>
            Usamos o local onde você fez a prova, que é o que o INEP divulga, e
            não o de onde você mora.
          </small>
        )}

        {doAno.size > 0 && (
          <div className="acoes">
            <button type="button" onClick={usarMinhasProvas}>
              Preencher com as minhas provas de {ano}
            </button>
            <small>
              Usa a nota que você informou na prova ou, sem ela, a estimada pelos seus
              acertos.
            </small>
          </div>
        )}

        <div className="campos-nota">
          {AREAS.map((a) => (
            <label
              key={a.valor}
              className="campo-area"
              style={estiloArea(a.valor)}
            >
              {a.nome}
              <input
                inputMode="decimal"
                placeholder="Ex.: 560,5"
                value={textos[a.valor] ?? ""}
                onChange={(e) =>
                  setTextos({ ...textos, [a.valor]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <small>Preencha só as áreas de que você lembra. Uma já basta.</small>
        {invalida && <p className="erro">Cada nota vai de 0 a 1000.</p>}

        {notas.LC !== undefined && (
          <label>
            Língua estrangeira que você escolheu
            <select
              value={lingua ?? ""}
              onChange={(e) =>
                setLingua(e.target.value === "" ? null : Number(e.target.value))
              }
            >
              <option value="">Escolha…</option>
              <option value="0">Inglês</option>
              <option value="1">Espanhol</option>
            </select>
          </label>
        )}

        <p className="mudo" style={{ margin: 0 }}>
          Não lembra a nota?{" "}
          <a href={INEP} target="_blank" rel="noopener noreferrer">
            Consulte no site do INEP
          </a>
          . Entre com a sua conta gov.br, abra o seu resultado e volte aqui. O
          Meu Bizu nunca pede a sua senha do gov.br.
        </p>

        {raiox.isError && <p className="erro">{raiox.error.message}</p>}
        <button
          type="submit"
          className="primario grande"
          disabled={!pronto || raiox.isPending}
        >
          {raiox.isPending ? "Montando o seu Raio-X…" : "Ver meu Raio-X"}
        </button>
      </form>
    </>
  );
}
