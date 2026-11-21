import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// base "./" para funcionar em mourafelipe.github.io/cercado/ · saída em docs/ (GitHub Pages)
export default defineConfig({ plugins: [react()], base: "./", build: { outDir: "docs", emptyOutDir: true } });
