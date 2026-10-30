import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Em desenvolvimento a API roda em outra porta (uvicorn); o proxy mantém tudo na mesma origem,
// que é o que o cookie de sessão exige.
const API = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      ["/anos", "/cadernos", "/conta", "/provas", "/perfil", "/saude"].map((c) => [c, API]),
    ),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
  },
});
