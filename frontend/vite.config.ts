import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const ROTAS = [
  "/anos",
  "/cadernos",
  "/conta",
  "/provas",
  "/perfil",
  "/saude",
  "/relatorio",
  "/raio-x",
];

// Em desenvolvimento a API roda em outra porta (uvicorn); o proxy mantém tudo na mesma origem,
// que é o que o cookie de sessão exige. `API_URL` troca o endereço da API (porta ocupada, etc.).
export default defineConfig(({ mode }) => {
  const api = loadEnv(mode, ".", "API_URL").API_URL || "http://127.0.0.1:8000";
  return {
    plugins: [react()],
    server: { proxy: Object.fromEntries(ROTAS.map((rota) => [rota, api])) },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/setupTests.ts"],
    },
  };
});
