// Mounting glue for claude-genesis' code→character cinematic (client/genesis, public API only).
// One mount per surface: it creates/replaces the cinematic when the repo (or mode) changes, streams live analyzer
// progress while analyzing, and hands over the finished genesis + kit when ready.
import type { BossKit, Genesis, GenesisProgress, PlayerKit } from "../../shared/types";
import { type GenesisHandle, playGenesis } from "../genesis";
import { h } from "./util";

export interface GenesisSource {
  repo: string | null;
  status: "empty" | "analyzing" | "ready" | "error";
  progress?: GenesisProgress;
  genesis?: Genesis;
  kit: PlayerKit | BossKit | null;
}

export interface GenesisMount {
  host: HTMLElement;
  /** Returns true while a cinematic is mounted for this source. */
  sync(src: GenesisSource, mode: "battle" | "edu"): boolean;
  readonly done: boolean;
  dispose(): void;
}

export function createGenesisMount(kind: "hero" | "boss", opts: { compact?: boolean; className?: string; onDone?(): void; onStart?(): void } = {}): GenesisMount {
  const host = h(`div.genesis-host.${kind}${opts.className ? "." + opts.className : ""}`, { "data-testid": `genesis-${kind}` });
  host.hidden = true;
  let g: GenesisHandle | null = null;
  let key = "";
  let lastProgress: unknown, lastGenesis: unknown, lastKit: unknown;
  const stop = () => {
    g?.dispose();
    g = null;
    key = "";
    host.hidden = true;
  };
  return {
    host,
    get done() {
      return !!g?.done;
    },
    sync(src, mode) {
      if (!src.repo || src.status === "empty" || src.status === "error") {
        stop();
        return false;
      }
      const k = `${src.repo}|${mode}`;
      if (k !== key || !g) {
        stop();
        try {
          host.hidden = false;
          g = playGenesis(host, {
            kind, mode, slug: src.repo, compact: opts.compact,
            progress: src.progress, genesis: src.status === "ready" ? src.genesis : undefined, kit: src.status === "ready" ? src.kit : undefined,
            onDone: () => opts.onDone?.(),
          });
          key = k;
          lastProgress = src.progress;
          lastGenesis = src.genesis;
          lastKit = src.kit;
          opts.onStart?.();
        } catch (e) {
          console.warn("[kaiju] genesis failed to mount", e);
          stop();
          return false;
        }
        return true;
      }
      try {
        if (src.status === "analyzing" && src.progress && src.progress !== lastProgress) g.update({ progress: src.progress });
        if (src.status === "ready" && (src.genesis !== lastGenesis || src.kit !== lastKit)) g.update({ genesis: src.genesis, kit: src.kit });
      } catch (e) {
        console.warn("[kaiju] genesis update failed", e);
      }
      lastProgress = src.progress;
      lastGenesis = src.genesis;
      lastKit = src.kit;
      return true;
    },
    dispose: stop,
  };
}
