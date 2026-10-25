// "⛓ verified on Solana": the PvP leaderboard whose Merkle root the server anchors on Solana devnet.
// Each row can be checked in the browser: fetch its proof, recompute leaf → root with WebCrypto, compare
// with the snapshot root. Membership only; the Explorer link is how anyone checks the root on-chain.
import type { ChainBoardEntry, ChainBoardProof, ChainBoardResponse, ChainBoardSnapshot } from "../../shared/types";
import { verifyChainProof } from "../../shared/chain-board";
import { canonical } from "../../shared/receipt";
import { locale } from "../i18n";
import { h, shortRepo } from "./util";

type Kind = ChainBoardEntry["kind"];

const shortRoot = (root: string) => `${root.slice(0, 8)}…${root.slice(-4)}`;
const when = (at: number) => new Date(at).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });
const txUrl = (res: ChainBoardResponse, tx?: string) =>
  tx && /^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(tx) && /^https:\/\//.test(res.explorer) ? res.explorer.replace("{tx}", encodeURIComponent(tx)) : null;
const explorerLink = (url: string, label: string) => h("a.cb-ext", { href: url, target: "_blank", rel: "noopener noreferrer" }, label);

/** Display order (same as the server): wins, then average placement (lower is better), then key. */
function ranked(entries: ChainBoardEntry[], kind: Kind): ChainBoardEntry[] {
  return entries.filter((e) => e.kind === kind)
    .sort((a, b) => b.wins - a.wins || a.avgPlacement - b.avgPlacement || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// ---- mock (?mock=1): a real tree over sample entries, so the browser verifier runs for real ----
const MOCK_ENTRIES: ChainBoardEntry[] = [
  { kind: "player", key: "github:583231", name: "ada", repo: "ada/borrowck-bot", wins: 4, matches: 6, bestPlacement: 1, avgPlacement: 1.83, anchoredReceipts: 3 },
  { kind: "player", key: "github:1024", name: "grace", repo: "grace/cobol-revival", wins: 1, matches: 5, bestPlacement: 1, avgPlacement: 2.6, anchoredReceipts: 0 },
  { kind: "player", key: "github:1240", name: "linus", repo: "linus/subsurface-lite", wins: 2, matches: 6, bestPlacement: 1, avgPlacement: 2.17, anchoredReceipts: 1 },
  { kind: "player", key: "github:583232", name: "octocat", repo: "octocat/hello-world", wins: 0, matches: 4, bestPlacement: 2, avgPlacement: 3.25, anchoredReceipts: 0 },
  { kind: "player", key: "github:90210", name: "wilf", repo: "wilf/gitzilla", wins: 1, matches: 3, bestPlacement: 1, avgPlacement: 2.33, anchoredReceipts: 1 },
  { kind: "project", key: "ada/borrowck-bot", name: "ada/borrowck-bot", wins: 4, matches: 6, bestPlacement: 1, avgPlacement: 1.83, anchoredReceipts: 3 },
  { kind: "project", key: "grace/cobol-revival", name: "grace/cobol-revival", wins: 1, matches: 5, bestPlacement: 1, avgPlacement: 2.6, anchoredReceipts: 0 },
  { kind: "project", key: "linus/subsurface-lite", name: "linus/subsurface-lite", wins: 2, matches: 6, bestPlacement: 1, avgPlacement: 2.17, anchoredReceipts: 1 },
  { kind: "project", key: "octocat/hello-world", name: "octocat/hello-world", wins: 0, matches: 4, bestPlacement: 2, avgPlacement: 3.25, anchoredReceipts: 0 },
  { kind: "project", key: "wilf/gitzilla", name: "wilf/gitzilla", wins: 1, matches: 3, bestPlacement: 1, avgPlacement: 2.33, anchoredReceipts: 1 },
];
const MOCK_TX = "5VfydnLu4XwV2H2dLHPv22JxhLbYJruaM9YTaGY3oTZjd4re2yxFGyPUSaEmyQKYF8fghdBnJxyCvZxxM8tpcWwQ";
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>));
let mockTree: Promise<{ res: ChainBoardResponse; levels: Uint8Array[][] }> | null = null;
function buildMock() {
  return (mockTree ??= (async () => {
    const entries = [...MOCK_ENTRIES].sort((a, b) => (a.kind + "\0" + a.key < b.kind + "\0" + b.key ? -1 : 1));
    const levels: Uint8Array[][] = [await Promise.all(entries.map((e) => sha(new TextEncoder().encode(canonical(e)))))];
    while (levels.at(-1)!.length > 1) {
      const prev = levels.at(-1)!, next: Uint8Array[] = [];
      for (let i = 0; i < prev.length; i += 2) {
        if (i + 1 === prev.length) { next.push(prev[i]); continue; }
        const pair = new Uint8Array(64); pair.set(prev[i]); pair.set(prev[i + 1], 32);
        next.push(await sha(pair));
      }
      levels.push(next);
    }
    const at = Date.now() - 4 * 60_000;
    const latest: ChainBoardSnapshot = { id: "cb-mock-3", at, root: hex(levels.at(-1)![0]), entries, status: "finalized", tx: MOCK_TX, slot: 418_552_907 };
    const history = [
      { id: latest.id, at, root: latest.root, status: latest.status, tx: MOCK_TX },
      { id: "cb-mock-2", at: at - 41 * 60_000, root: "7c1e9a04d2b85f36e0a1c4d79b2e58f31a6c0d94e7b2f5a8c3d16e09b4a7f2c5", status: "finalized" as const, tx: MOCK_TX },
      { id: "cb-mock-1", at: at - 95 * 60_000, root: "e2f04b91c6a3d8570f1e29b4c7a6d3e81f05b92c4e7a1d6b39f0c8e25a4d71b6", status: "finalized" as const, tx: MOCK_TX },
    ];
    return { res: { latest, history, explorer: "https://explorer.solana.com/tx/{tx}?cluster=devnet" }, levels };
  })());
}
async function mockProof(entry: ChainBoardEntry): Promise<ChainBoardProof> {
  const { res, levels } = await buildMock();
  const snap = res.latest!;
  let i = snap.entries.findIndex((e) => e.kind === entry.kind && e.key === entry.key);
  const leaf = hex(levels[0][i]), path: ChainBoardProof["path"] = [];
  for (const level of levels.slice(0, -1)) {
    const sib = i ^ 1;
    if (sib < level.length) path.push({ hash: hex(level[sib]), side: sib < i ? "left" : "right" });
    i >>= 1;
  }
  return { snapshot: snap.id, root: snap.root, leaf, entry: snap.entries.find((e) => e.kind === entry.kind && e.key === entry.key)!, path, tx: snap.tx, status: snap.status };
}

async function fetchChainBoard(mock: boolean): Promise<ChainBoardResponse | null> {
  if (mock) return (await buildMock()).res;
  try {
    const r = await fetch("/api/chain-board");
    return r.ok ? ((await r.json()) as ChainBoardResponse) : null;
  } catch {
    return null;
  }
}
async function fetchProof(mock: boolean, snap: ChainBoardSnapshot, e: ChainBoardEntry): Promise<ChainBoardProof | null> {
  if (mock) return mockProof(e);
  try {
    const q = new URLSearchParams({ snapshot: snap.id, kind: e.kind, key: e.key });
    const r = await fetch(`/api/chain-board/proof?${q}`);
    return r.ok ? ((await r.json()) as ChainBoardProof) : null;
  } catch {
    return null;
  }
}

/** The proof must be for this exact row and this snapshot's root; then the path must hash up to it. */
async function checkRow(proof: ChainBoardProof | null, snap: ChainBoardSnapshot, e: ChainBoardEntry): Promise<"ok" | "bad" | "fetch"> {
  if (!proof) return "fetch";
  if (proof.snapshot !== snap.id || proof.root !== snap.root || canonical(proof.entry) !== canonical(e)) return "bad";
  return (await verifyChainProof(proof)) ? "ok" : "bad";
}

function header(res: ChainBoardResponse, snap: ChainBoardSnapshot): HTMLElement {
  const url = txUrl(res, snap.tx);
  if (snap.status === "finalized")
    return h("div.cb-anchor", { "data-testid": "chain-anchor", "data-status": "finalized" },
      h("span.green", null, "Last anchored:"), " ",
      snap.slot != null ? h("span", { translate: "no" }, `slot ${snap.slot}`) : null, snap.slot != null ? " · " : null,
      h("span", { translate: "no" }, when(snap.at)),
      url ? " · " : null, url ? explorerLink(url, "Explorer ↗") : null);
  if (snap.status === "pending")
    return h("div.cb-anchor", { "data-testid": "chain-anchor", "data-status": "pending" },
      h("span.cb-amber", null, "anchoring on Solana devnet…"), " ",
      h("span.dim", null, "waiting for confirmation"), url ? " · " : null, url ? explorerLink(url, "Explorer ↗") : null);
  return h("div.cb-anchor", { "data-testid": "chain-anchor", "data-status": "unavailable" },
    h("span.red", null, "not anchored:"), " ", h("span.dim", null, "Solana anchoring is unavailable on this server."));
}

function rowsFor(mock: boolean, res: ChainBoardResponse, snap: ChainBoardSnapshot, kind: Kind, hi: Set<string>, cap: number): HTMLElement {
  const list = ranked(snap.entries, kind).slice(0, cap);
  if (!list.length) return h("div.dim", null, "—");
  const grid = h("div.cb-list", { role: "table" },
    h("div.cb-row.cb-head", { role: "row" },
      h("span", { role: "columnheader" }, "#"),
      h("span", { role: "columnheader" }, kind === "player" ? "player" : "repo"),
      h("span.cb-n", { role: "columnheader", title: "wins" }, "wins"),
      h("span.cb-n", { role: "columnheader", title: "played" }, "played"),
      h("span.cb-n.cb-best", { role: "columnheader", title: "best" }, "best"),
      h("span.cb-n", { role: "columnheader", title: "avg" }, "avg"),
      h("span", { role: "columnheader", "aria-label": "anchored receipts" }),
      h("span", { role: "columnheader" }),
    ),
  );
  list.forEach((e, i) => {
    const out = h("div.cb-result", { role: "status", hidden: true });
    const btn = h("button.cb-verify", { "data-testid": "chain-verify", "aria-label": `verify ${e.name}` }, "verify") as HTMLButtonElement;
    btn.onclick = async () => {
      btn.disabled = true;
      out.hidden = false;
      out.className = "cb-result dim";
      out.replaceChildren("checking proof in your browser…");
      const proof = await fetchProof(mock, snap, e);
      const verdict = await checkRow(proof, snap, e);
      btn.disabled = false;
      const root = shortRoot(snap.root), url = txUrl(res, proof?.tx ?? snap.tx);
      out.dataset.verdict = verdict;
      if (verdict === "ok") {
        out.className = "cb-result ok";
        out.title = snap.root;
        const msg = snap.status === "finalized" ? `✓ this row is in snapshot ${root} anchored on Solana devnet`
          : snap.status === "pending" ? `✓ this row is in snapshot ${root}; anchoring is pending`
            : `✓ this row is in snapshot ${root}, which is not anchored`;
        out.replaceChildren(msg, url ? " · " : "", url ? explorerLink(url, "tx ↗") : "");
      } else {
        out.className = "cb-result bad";
        out.replaceChildren(verdict === "fetch" ? "✗ couldn't fetch the proof" : `✗ proof failed: this row doesn't match snapshot ${root}`);
      }
    };
    const who = e.name;
    grid.append(
      h(`div.cb-row${hi.has(e.name) ? ".hi" : ""}`, { role: "row", "data-testid": "chain-row" },
        h("span.hr-rank", null, `${i + 1}.`),
        h("span.cb-who", { translate: "no", title: e.repo ?? e.name },
          h("span.cb-name", null, who),
          kind === "player" && e.repo ? h("span.cb-repo", null, shortRepo(e.repo)) : null),
        h("span.cb-n.cb-wins", null, String(e.wins)),
        h("span.cb-n", null, String(e.matches)),
        h("span.cb-n.cb-best", null, `#${e.bestPlacement}`),
        h("span.cb-n", null, e.avgPlacement.toFixed(2)),
        e.anchoredReceipts > 0
          ? h("span.cb-badge", { title: `${e.anchoredReceipts} results with a wallet-anchored receipt`, "aria-label": `${e.anchoredReceipts} results with a wallet-anchored receipt` }, "◆")
          : h("span"),
        btn,
      ),
      out,
    );
  });
  return grid;
}

function historyList(res: ChainBoardResponse, latestId: string): HTMLElement | null {
  const older = res.history.filter((s) => s.id !== latestId).slice(0, 20);
  if (!older.length) return null;
  return h("details.cb-history", null,
    h("summary", null, `${older.length} earlier roots`),
    ...older.map((s) => {
      const url = txUrl(res, s.tx);
      return h("div.cb-hist-row", null,
        h("span", { translate: "no" }, when(s.at)),
        h("span.cb-root", { translate: "no", title: s.root }, shortRoot(s.root)),
        h(`span.${s.status === "finalized" ? "green" : s.status === "pending" ? "cb-amber" : "dim"}`, null,
          s.status === "finalized" ? "finalized" : s.status === "pending" ? "pending" : "unavailable"),
        url ? explorerLink(url, "tx ↗") : h("span"));
    }));
}

export function createChainBoard(mock: boolean, opts: { rows?: number; highlight?: string[] } = {}): HTMLElement {
  const cap = Math.max(10, (opts.rows ?? 5) * 2);
  const hi = new Set(opts.highlight ?? []);
  const body = h("div.cb-body", null, h("div.dim", null, "loading chain board…"));
  const el = h("div.chain-board", { "data-testid": "chain-board" },
    body,
    h("p.cb-note", null, "Tamper-evident history: we can't rewrite it after anchoring. Results are attested by the game server."));
  fetchChainBoard(mock).then((res) => {
    const snap = res?.latest;
    if (!res) return body.replaceChildren(h("div.dim", null, "chain board offline."));
    if (!snap || !snap.entries.length)
      return body.replaceChildren(h("div.dim", null, "no qualifying PvP matches yet: play a royale with 2+ humans and public repos."));
    let kind: Kind = "player";
    const table = h("div.cb-table");
    const tabs = (["player", "project"] as const).map((k) =>
      h("button.cb-tab", { role: "tab", "data-kind": k, "aria-selected": String(k === kind), onclick: () => show(k) }, k === "player" ? "players" : "projects"));
    const show = (k: Kind) => {
      kind = k;
      for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.kind === k));
      table.replaceChildren(rowsFor(mock, res, snap, k, hi, cap));
    };
    show(kind);
    body.replaceChildren(
      header(res, snap),
      h("div.cb-tabs", { role: "tablist" }, ...tabs),
      table,
      h("div.cb-meta.dim", null, h("span", null, "root"), " ", h("span.cb-root", { translate: "no", title: snap.root }, shortRoot(snap.root)), " · ",
        h("span", null, `${snap.entries.length} entries`)),
      ...[historyList(res, snap.id)].filter((x): x is HTMLElement => !!x),
    );
  });
  return el;
}
