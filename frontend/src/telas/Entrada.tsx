import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api } from "../api";
import { Marca } from "../ui/Marca";

/** Entrar ou criar conta. O cadastro declara ter 18 anos ou mais (a API também exige). */
export function Entrada({ aoEntrar }: { aoEntrar: () => void }) {
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
        <h1 style={{ marginTop: 18 }}>{criando ? "Crie a sua conta" : "Bem-vindo de volta"}</h1>
        <p className="sub">Descubra com dados oficiais onde focar nos estudos para o Enem.</p>
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
          {criando ? "Criar conta" : "Entrar"}
        </button>
      </form>
      <button type="button" className="link" onClick={() => setCriando(!criando)}>
        {criando ? "Já tenho conta" : "Criar uma conta"}
      </button>
      </div>
    </main>
  );
}
