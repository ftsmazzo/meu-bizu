import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api } from "../api";
import { Marca } from "../ui/Marca";

/** Entrar ou criar conta. O cadastro declara ter 18 anos ou mais (a API também exige). */
export function Entrada({ aoEntrar, aoExplorar }: { aoEntrar: () => void; aoExplorar?: () => void }) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [maior, setMaior] = useState(false);

  const enviar = useMutation({
    mutationFn: () =>
      criando ? api.cadastrar({ nome, email, senha }) : api.entrar({ email, senha }),
    onSuccess: aoEntrar,
  });

  function submeter(e: FormEvent) {
    e.preventDefault();
    enviar.mutate();
  }

  return (
    <main className="entrada-tela">
      <div className="entrada-cartao">
        <Marca />
        <h1 style={{ marginTop: 18 }}>{criando ? "Comece pela sua conta." : "Sua prova merece uma análise."}</h1>
        <p className="sub">Analise notas e respostas, compare com Brasil, estado e município e conecte o resultado aos cenários por curso e ao seu plano de estudo.</p>
        {!criando && <p className="entrada-integrada">Use sua conta do Meu Bizu. Se ainda não tiver uma, crie abaixo para começar.</p>}
      <form onSubmit={submeter}>
        {criando && (
          <label>
            Como quer ser chamado
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} required />
          </label>
        )}
        <label>
          E-mail
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            autoComplete={criando ? "new-password" : "current-password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={criando ? 8 : undefined}
            required
          />
          {criando && <small>Pelo menos 8 caracteres.</small>}
        </label>
        {criando && (
          <label className="linha">
            <input type="checkbox" checked={maior} onChange={(e) => setMaior(e.target.checked)} />
            Tenho 18 anos ou mais
          </label>
        )}
        {enviar.isError && <p className="erro">{enviar.error.message}</p>}
        <button
          type="submit"
          className="primario"
          disabled={enviar.isPending || (criando && !maior)}
        >
          {enviar.isPending ? "Conectando…" : criando ? "Criar conta" : "Entrar e começar"}
        </button>
      </form>
      <button type="button" className="link" onClick={() => setCriando(!criando)}>
        {criando ? "Já tenho conta" : "Criar uma conta"}
      </button>
      {aoExplorar && <div className="entrada-explorar"><p>Quer apresentar os cálculos antes de entrar?</p><button type="button" onClick={aoExplorar}>Explorar cenários de ingresso →</button><small>Você informa as notas e ofertas. Provas, correção e histórico usam sua conta.</small></div>}
      </div>
    </main>
  );
}


