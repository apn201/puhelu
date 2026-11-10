import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true },
  server: { fs: { allow: [".."] } },
  test: { root: ".", include: ["tests/**/*.test.ts"] },
} as never);
