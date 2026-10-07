import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5188 },
  test: { environment: "node", include: process.env.SNAP ? [`scripts/${process.env.SNAP === "1" ? "snap" : process.env.SNAP}.test.ts`] : ["tests/**/*.test.ts"] },
});
