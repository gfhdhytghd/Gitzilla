import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Anchor ignores to this checkout: **/data/** also matches /home/wilf/data/,
// which otherwise prevents every application module from being invalidated.
const ignored = ["data", ".cache", "docs", "qa", "dist"].map(dir =>
  fileURLToPath(new URL(`./${dir}/`, import.meta.url)).replaceAll("\\", "/") + "**");

export default defineConfig({
  root: ".",
  server: {
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.cache/**', '**/*.seed', '**/*.sqlite*', ...(process.env.SOLANA_ATTESTOR_KEY_FILE ? [process.env.SOLANA_ATTESTOR_KEY_FILE] : [])] },
    // Public tunnel (gitzilla.wilflin.me) and LAN IPs; IPs/localhost are always allowed.
    allowedHosts: [".wilflin.me"],
    // Agents rewrite data/docs/qa artifacts constantly; don't full-reload every client for them.
    watch: { ignored },
  },
  build: { outDir: "dist", target: "es2022", rollupOptions: { input: { main: "index.html", receipt: "receipt.html" } } },
});
