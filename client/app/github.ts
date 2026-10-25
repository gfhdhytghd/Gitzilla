// "Connect GitHub" (Auth0) + terminal-style repo picker for the lobby. Cookie auth; tokens never reach the client.
import { toast } from "./app";
import { h } from "./util";

export interface GhUser { userId: string; login: string; avatar: string }
interface GhRepo {
  name: string; full_name: string; private: boolean; language: string | null; stars: number; pushed_at: string;
  // PvP eligibility (auth/): your own non-fork repo, or a public repo you maintain/administer
  fork?: boolean; permission?: "admin" | "maintain" | "push" | "read"; pvpEligible?: boolean;
}

const LANG_COL: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572a5", Rust: "#dea584", Go: "#00add8", C: "#8a8a8a", "C++": "#f34b7d",
  Java: "#b07219", Kotlin: "#a97bff", Ruby: "#cc342d", PHP: "#777bb4", Swift: "#f05138", "C#": "#178600", Shell: "#89e051", HTML: "#e34c26",
  CSS: "#563d7c", Lua: "#000080", Dart: "#00b4ab", Haskell: "#5e5086", Elixir: "#6e4a7e", Zig: "#ec915c", "Jupyter Notebook": "#da5b0b",
};

const mockOn = () => new URLSearchParams(location.search).has("mock");
const mockSigned = () => new URLSearchParams(location.search).get("gh") === "1";

let meCache: Promise<{ enabled: boolean; user: GhUser | null }> | null = null;
export function fetchMe(): Promise<{ enabled: boolean; user: GhUser | null }> {
  if (mockOn()) return Promise.resolve({ enabled: true, user: mockSigned() ? { userId: "gh|1", login: "octocat", avatar: "" } : null });
  return (meCache ??= fetch("/api/me", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : { enabled: false, user: null }))
    .catch(() => ({ enabled: false, user: null })));
}

/** pvp: only repos you may fight with (?pvp=1 returns eligible rows only; anything not marked eligible is dropped too). */
async function fetchRepos(pvp = false): Promise<GhRepo[] | 401 | 502> {
  const eligible = (rows: GhRepo[]) => (pvp ? rows.filter((r) => r.pvpEligible === true) : rows); // unknown = not shown
  if (mockOn()) {
    const now = Date.now();
    // dotfiles is a fork, advent-of-code a public repo you can only read: neither is PvP-eligible
    return eligible(["hackpsu-kaiju", "dotfiles", "secret-startup", "advent-of-code", "thesis-latex", "tiny-raytracer"].map((n, i) => ({
      name: n, full_name: `${i === 3 ? "adventofcode" : "octocat"}/${n}`, private: i % 3 === 2, language: ["TypeScript", "Shell", "Rust", "Python", "TeX", "C++"][i], stars: [42, 3, 0, 17, 0, 128][i],
      pushed_at: new Date(now - i * 86400000 * (i + 1) - 3600000).toISOString(),
      fork: i === 1, permission: i === 3 ? "read" as const : "admin" as const, pvpEligible: i !== 1 && i !== 3,
    })));
  }
  try {
    const r = await fetch(pvp ? "/api/me/repos?pvp=1" : "/api/me/repos", { credentials: "same-origin" });
    if (r.status === 401) return 401;
    if (!r.ok) return 502;
    return eligible((await r.json()) as GhRepo[]);
  } catch {
    return 502;
  }
}

const fmtStars = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0));

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.round(s / 86400 / 30)}mo ago`;
  return `${Math.round(s / 86400 / 365)}y ago`;
}

const here = () => encodeURIComponent(location.pathname + location.search);
const login = (sw = false) => location.assign(`/auth/login?${sw ? "switch=1&" : ""}returnTo=${here()}`);
const logout = () => location.assign(`/auth/logout?returnTo=${encodeURIComponent(location.pathname)}`);

/** Shows ?auth_error=… once as a toast and strips it from the URL. */
export function consumeAuthError() {
  const p = new URLSearchParams(location.search);
  const err = p.get("auth_error");
  if (!err) return;
  toast(`github sign-in failed: ${err}`, "err", 6000);
  p.delete("auth_error");
  const q = p.toString();
  history.replaceState(null, "", location.pathname + (q ? `?${q}` : ""));
}

export type GithubPicker = HTMLElement & { /** PvP lists only eligible repos (owner-only rule); re-renders when it flips. */ setPvp(on: boolean): void };

/** Lobby widget: hidden when auth is disabled; Connect button when signed out; picker when signed in. */
export function createGithubPicker(onPick: (fullName: string) => void, opts: { kind?: "hero" | "boss"; pvp?: boolean } = {}): GithubPicker {
  const boss = opts.kind === "boss";
  const tid = (id: string) => (boss ? `boss-${id}` : id); // unique test ids when both pickers are on screen
  const el: GithubPicker = Object.assign(h(`div.gh${boss ? ".gh-boss" : ""}`, { style: "display:none" }), { setPvp: (on: boolean) => setPvp(on) });
  let pvp = !!opts.pvp;
  let user: GhUser | null = null;
  let enabled = false;
  const show = () => {
    if (!enabled) return;
    el.style.display = "";
    if (!user) signedOut();
    else signedIn(user);
  };
  const setPvp = (on: boolean) => {
    if (on === pvp) return;
    pvp = on;
    show();
  };
  fetchMe().then((me) => {
    enabled = me.enabled;
    user = me.user;
    show();
  });

  function signedOut() {
    el.replaceChildren(
      h("button.btn.btn-gh", { "data-testid": tid("github-connect"), onclick: () => login() }, h("span.gh-mark", null, "◉"), " Connect GitHub"),
      h("span.gh-hint.dim", null, boss ? " summon one of your own repos as the boss 🔒" : pvp ? " fight with a repo you own (forks don't count) 🔒" : " pick from your own repos, private too 🔒"),
    );
  }

  function signedIn(user: GhUser) {
    const avatar = user.avatar ? h("img.gh-avatar", { src: user.avatar, alt: "", width: 16, height: 16 }) : h("span.gh-avatar.ph", null, "@");
    const filter = h("input.term-input.gh-filter", { placeholder: "filter repos…", spellcheck: "false", autocomplete: "off", "aria-label": "filter repos" }) as HTMLInputElement;
    const list = h("div.gh-list", { "data-testid": tid("github-repos") }, h("div.dim.blink", null, "$ gh repo list --limit 300 …"));
    el.replaceChildren(
      h(
        "div.gh-who",
        null,
        avatar,
        h("b", null, `@${user.login}`),
        h("button.btn-link", { onclick: () => login(true) }, "switch"),
        h("button.btn-link", { onclick: logout }, "sign out"),
      ),
      h("label.term-line.gh-filter-row", null, h("span.prompt", null, "$ grep "), filter),
      list,
    );
    let repos: GhRepo[] = [];
    const render = () => {
      const q = filter.value.trim().toLowerCase();
      const rows = repos.filter((r) => !q || r.full_name.toLowerCase().includes(q) || (r.language ?? "").toLowerCase().includes(q)).slice(0, 120);
      if (!rows.length) {
        list.replaceChildren(h("div.dim", { "data-testid": tid("github-empty") }, repos.length ? "no match" : pvp ? "no eligible repos — PvP needs a repo you own (forks don't count)" : "no repos found"));
        return;
      }
      list.replaceChildren(
        ...rows.map((r) =>
          h(
            "button.gh-row",
            { title: r.full_name, onclick: () => onPick(r.full_name) },
            h("span.gh-stars", { title: `${r.stars} stars` }, `★ ${fmtStars(r.stars)}`),
            h("span.gh-name", null, r.private ? "🔒 " : "", r.full_name),
            r.language ? h("span.gh-lang", { style: `--lc:${LANG_COL[r.language] ?? "#6f9b85"}` }, r.language) : h("span"),
            h("span.gh-ago", null, ago(r.pushed_at)),
          ),
        ),
      );
    };
    filter.addEventListener("input", render);
    filter.addEventListener("keydown", (e) => {
      if (e.key === "Enter") list.querySelector<HTMLButtonElement>(".gh-row")?.click();
    });
    const wantPvp = pvp;
    const load = async () => {
      const res = await fetchRepos(wantPvp);
      if (wantPvp !== pvp) return; // the mode flipped while loading; setPvp() already reloaded
      if (res === 401) return signedOut();
      if (res === 502) {
        list.replaceChildren(h("div.pcard-err", null, "github said no (502). "), h("button.btn-link", { onclick: load }, "retry"));
        return;
      }
      // most-starred first (the server already sends this order; keep it stable if it ever doesn't)
      repos = [...res].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
      render();
    };
    load();
  }
  return el;
}
