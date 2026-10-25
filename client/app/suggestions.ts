// Repo suggestion chips (docs/tasks/suggestions.md): a shuffled mix from GET /api/suggestions (curated + live
// "rising" repos from GitHub), each chip with a language dot, compact ★ stars and a "🔥 new" badge for trending ones,
// a "↻ more" chip for a fresh mix, and the description as a tooltip / on long-press. Falls back to /api/fallbacks
// (plain chips) until the server has the endpoint, or when it fails.
import type { RepoSuggestion, SuggestionsResponse } from "../../shared/types";
import { MOCK_REPOS } from "./mock";
import { h } from "./util";

const N = 8;

async function fetchSuggestions(mock: boolean): Promise<RepoSuggestion[]> {
  if (mock) return mockSuggestions();
  try {
    const r = await fetch(`/api/suggestions?n=${N + 1}`); // one spare: the "↻ last repo again" chip may repeat one
    if (r.ok) {
      const j = (await r.json()) as Partial<SuggestionsResponse>;
      if (Array.isArray(j.repos) && j.repos.length) return j.repos.filter((x) => typeof x?.slug === "string");
    }
  } catch {
    /* fall through to the fallback list */
  }
  try {
    const r = await fetch("/api/fallbacks");
    const j: unknown = r.ok ? await r.json() : [];
    const list = Array.isArray(j) ? (j as string[]) : (j as { repos?: string[] })?.repos ?? [];
    return shuffle(list).slice(0, N + 1).map((slug) => ({ slug, language: null, stars: 0, source: "curated" as const, fallback: true }));
  } catch {
    return [];
  }
}

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ?mock: a plausible mix (some trending) so the UI can be exercised without the server
const MOCK_EXTRA: RepoSuggestion[] = [
  { slug: "astral-sh/uv", language: "Rust", stars: 61200, source: "trending", description: "An extremely fast Python package and project manager, written in Rust." },
  { slug: "openai/codex", language: "TypeScript", stars: 31800, source: "trending", description: "Lightweight coding agent that runs in your terminal." },
  { slug: "tinygrad/tinygrad", language: "Python", stars: 28400, source: "curated", description: "You like pytorch? You like micrograd? You love tinygrad!" },
  { slug: "zigtools/zls", language: "Zig", stars: 3400, source: "trending", description: "A Zig language server supporting Zig developers with features like autocomplete and goto definition." },
];
const MOCK_META: Record<string, [string, number, string]> = {
  "facebook/react": ["JavaScript", 236000, "The library for web and native user interfaces."],
  "torvalds/linux": ["C", 196000, "Linux kernel source tree"],
  "pallets/flask": ["Python", 69800, "The Python micro framework for building web applications."],
  "rust-lang/rust": ["Rust", 103000, "Empowering everyone to build reliable and efficient software."],
  "lodash/lodash": ["JavaScript", 60300, "A modern JavaScript utility library delivering modularity, performance, & extras."],
  "django/django": ["Python", 84100, "The Web framework for perfectionists with deadlines."],
  "vuejs/core": ["TypeScript", 50200, "🖖 Vue.js is a progressive, incrementally-adoptable JavaScript framework for building UI on the web."],
  "golang/go": ["Go", 128000, "The Go programming language"],
};
function mockSuggestions(): RepoSuggestion[] {
  const curated = MOCK_REPOS.map((slug) => {
    const [language, stars, description] = MOCK_META[slug] ?? [null, 0, ""];
    return { slug, language, stars, description, source: "curated" as const, fallback: true };
  });
  return shuffle([...shuffle(curated).slice(0, 6), ...shuffle(MOCK_EXTRA).slice(0, 3)]);
}

/** GitHub-ish language colours for the dot (unknown → grey). */
const LANG_COLOR: Record<string, string> = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572a5", Rust: "#dea584", Go: "#00add8", C: "#8a8a8a",
  "C++": "#f34b7d", "C#": "#178600", Java: "#b07219", Kotlin: "#a97bff", Swift: "#f05138", Ruby: "#cc342d",
  PHP: "#4f5d95", Zig: "#ec915c", Haskell: "#5e5086", Elixir: "#6e4a7e", Lua: "#000080", Shell: "#89e051",
  Dart: "#00b4ab", Scala: "#c22d40", "Jupyter Notebook": "#da5b0b", HTML: "#e34c26", CSS: "#563d7c", Vue: "#41b883",
};
/** 950 · 1.2k · 12.3k · 236k · 1.2M */
export const compactStars = (n: number) =>
  n < 1000 ? String(n) : n < 100_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : n < 1_000_000 ? `${Math.round(n / 1000)}k` : `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;

export interface SuggestionChips {
  /** (re)load a fresh mix */
  refresh(): Promise<void>;
}

/**
 * Fills `container` with suggestion chips (+ "↻ more"). `lead` nodes (e.g. "↻ last repo again") stay in front.
 * A tap picks the repo; a long-press (or hover) shows the description without picking.
 */
export function createSuggestionChips(container: HTMLElement, opts: { mock: boolean; onPick(slug: string): void; cls?: string; lead?: () => HTMLElement[]; testid: string }): SuggestionChips {
  container.classList.add("sugg");
  const desc = h("div.chip-desc", { role: "status", hidden: true });
  let descTimer = 0;
  const showDesc = (s: RepoSuggestion) => {
    desc.replaceChildren(h("b", { translate: "no" }, s.slug), s.description ? ` — ${s.description}` : "");
    desc.hidden = false;
    clearTimeout(descTimer);
    descTimer = window.setTimeout(() => (desc.hidden = true), 3500);
  };
  const chip = (s: RepoSuggestion) => {
    let pressTimer = 0, longPressed = false;
    const b = h(
      `button.chip.sugg-chip${opts.cls ?? ""}${s.source === "trending" ? ".trending" : ""}`,
      { type: "button", "data-testid": opts.testid, "data-slug": s.slug, title: s.description ? `${s.slug} — ${s.description}` : s.slug,
        onclick: (e: Event) => {
          if (longPressed) return void e.preventDefault(); // the long-press only showed the description
          opts.onPick(s.slug);
        } },
      h("i.lang-dot", { style: `background:${(s.language && LANG_COLOR[s.language]) || "#6b7a72"}`, title: s.language ?? "", "aria-hidden": "true" }),
      h("span.sugg-slug", { translate: "no" }, s.slug),
      s.stars > 0 ? h("span.sugg-stars", { "aria-label": `${s.stars} stars` }, `★${compactStars(s.stars)}`) : null,
      s.source === "trending" ? h("span.sugg-new", { "data-testid": "suggestion-new" }, "🔥 new") : null,
    );
    // long-press (phones): show the description, don't pick
    b.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      longPressed = false;
      pressTimer = window.setTimeout(() => ((longPressed = true), showDesc(s)), 450);
    });
    const cancel = () => clearTimeout(pressTimer);
    b.addEventListener("pointerup", cancel);
    b.addEventListener("pointercancel", cancel);
    b.addEventListener("pointerleave", cancel);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    return b;
  };
  const more = h("button.chip.sugg-more", { type: "button", "data-testid": `${opts.testid}-more`, title: "show a fresh mix", onclick: () => void api.refresh() }, "↻ more");
  let seq = 0;
  const api: SuggestionChips = {
    async refresh() {
      const mine = ++seq;
      more.disabled = true;
      const list = await fetchSuggestions(opts.mock);
      if (mine !== seq) return;
      more.disabled = false;
      const lead = opts.lead?.() ?? [];
      const leadSlugs = new Set(lead.map((n) => n.dataset.slug));
      container.replaceChildren(...lead, ...list.filter((s) => !leadSlugs.has(s.slug)).slice(0, N).map(chip));
      // "↻ more" and the description sit right after the chips (outside the phone's scrolling rows; the container
      // holds only repo chips, which playtests count), and hide with them in PvP (CSS .chips[hidden] ~ …)
      if (more.previousElementSibling !== container) container.after(more, desc);
    },
  };
  void api.refresh();
  return api;
}
