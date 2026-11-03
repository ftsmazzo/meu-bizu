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
}

/** Raio-X pela nota: o aluno informa as notas por área e vê o que costuma acontecer com quem as tem. */
export function RaioX({ aoVoltar, aoIncluirProva }: Props) {
  const [ano, setAno] = useState<number | null>(null);
  const [textos, setTextos] = useState<Partial<Record<Area, string>>>({});
  const [lingua, setLingua] = useState<number | null>(null);

  const anos = useQuery({ queryKey: ["anos"], queryFn: api.anos });
  const raiox = useMutation({ mutationFn: api.raioX });

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
      });
  }

  if (raiox.data) {
    return (
      <RaioXPainel
        dados={raiox.data}
        aoVoltar={aoVoltar}
        aoRefazer={() => raiox.reset()}
        aoIncluirProva={aoIncluirProva}
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
            onChange={(e) =>
              setAno(e.target.value ? Number(e.target.value) : null)
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
