import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    // Public tunnel (gitzilla.wilflin.me) and LAN IPs; IPs/localhost are always allowed.
    allowedHosts: [".wilflin.me"],
    // Agents rewrite data/docs/qa artifacts constantly; don't full-reload every client for them.
    watch: { ignored: ["**/data/**", "**/.cache/**", "**/docs/**", "**/qa/**", "**/dist/**"] },
  },
  build: { outDir: "dist", target: "es2022" },
});
