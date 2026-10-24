import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  // Public tunnel (repokaiju.wilflin.me) and LAN IPs; IPs/localhost are always allowed.
  server: { allowedHosts: [".wilflin.me"] },
  build: { outDir: "dist", target: "es2022" },
});
