// Edu demo page: a fake classroom PvP match built from data/fallback repos, a scripted event stream (lessons, hits,
// KOs, round change, pop quiz + reveal) and every edu component in phone / desktop / projector layouts.
// Report cards use the sim's real edu grading (playerKitFromProfile(p, { mode: "edu" })).
// ?view=desktop|phone|screen|report|report-screen|arch|genesis|gallery  &t=<seconds to fast-forward>
import type { Autopsy, GameEvent, MatchState, PerkOffer, PlayerKit, PlayerState, RepoProfile } from "../../shared/types.ts";
import { bossKitFromProfile, playerKitFromProfile } from "../../sim/kits.ts";
import { h } from "../app/util.ts";
import { buildGenesisLocal } from "../genesis/local.ts";
import { drawArenaBackground } from "../render/arena/index.ts";
import { drawPlayer } from "../render/player/index.ts";
import { ALL_CONCEPTS, conceptInfo } from "./concepts.ts";
import { diagramCanvas, glyphBadge } from "./diagrams.ts";
import { type EduVariant, createLessonFeed } from "./feed.ts";
import { EDU_STAGE_ORDER, eduGenesisNotes } from "./genesis.ts";
import { createQuizOverlay, padLetters } from "./quiz.ts";
import { createArchitectureReport, createClassReport, createReportCard } from "./report.ts";

const files = import.meta.glob("../../data/fallback/*.json", { eager: true, import: "default" }) as Record<string, RepoProfile>;
const profiles = new Map(Object.values(files).map((p) => [p.slug, p]));
const P = (slug: string) => profiles.get(slug)!;

// ---------- the class ----------
const CLASS: [string, string][] = [
  ["ana", "pallets/flask"], ["ben", "rust-lang/rustlings"], ["cy", "expressjs/express"], ["dee", "karpathy/nanogpt"],
  ["eli", "gin-gonic/gin"], ["fay", "jquery/jquery"], ["gus", "golang/example"], ["hal", "spring-projects/spring-petclinic"],
];
const students = CLASS.map(([name, slug], i) => {
  const p = P(slug);
  // the sim's real edu grading (sim/quality.ts), same as in a classroom match
  const kit: PlayerKit = playerKitFromProfile(p, { mode: "edu" });
  const quality = kit.quality!;
  return { id: `p${i + 1}`, name, repo: slug, quality, kit, profile: p };
});
const YOU = "p2";

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "index";
const jump = Number(params.get("t") ?? 0);

// ---------- scripted match ----------
const AW = 480, AH = 288;
function players(t: number): PlayerState[] {
  return students.map((s, i) => {
    const a = t * 0.4 + i * 0.8;
    const x = 60 + ((i * 53) % 360) + Math.cos(a) * 18, y = 60 + ((i * 37) % 170) + Math.sin(a * 1.3) * 14;
    return {
      id: s.id, name: s.name, x, y, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, facing: [Math.cos(a), Math.sin(a)], hp: 5, armor: 3, energy: 150,
      alive: !(s.id === YOU && t > 14 && t < 18), downedFor: 0, reviveProgress: 0, skillCd: 0, dashCd: 0, invuln: 0, buffs: [], kit: s.kit,
      stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false }, perks: [],
    };
  });
}
const QUIZ_AT = 24, QUIZ_LEN = 15;
const pads = [
  { id: "q1", name: "pad", desc: "", x: 110, y: 150, r: 16, answer: "@ana (pallets/flask)" },
  { id: "q2", name: "pad", desc: "", x: 240, y: 150, r: 16, answer: "@ben (rust-lang/rustlings)" },
  { id: "q3", name: "pad", desc: "", x: 370, y: 150, r: 16, answer: "@cy (expressjs/express)" },
];
function quizOffer(t: number): PerkOffer | null {
  if (t < QUIZ_AT || t > QUIZ_AT + QUIZ_LEN) return null;
  const k = t - QUIZ_AT;
  const picked: Record<string, string> = {};
  students.forEach((s, i) => { if (k > 2 + i * 0.9) picked[s.id] = pads[i % 3 === 0 ? 1 : i % 3 === 1 ? 0 : 1].id; });
  if (k > 6) picked[YOU] = "q2";
  const rustCycles = P("rust-lang/rustlings").cycles[0] ?? ["?", "?"];
  return {
    endsAt: QUIZ_AT + QUIZ_LEN, pads: k > QUIZ_LEN - 0.5 ? pads.map((p) => ({ ...p, correct: p.id === "q2" })) : pads, picked,
    quiz: { question: "Whose project has a circular dependency?", explain: `@ben's rustlings: \`${rustCycles.join("` ↔ `")}\` import each other. That loop gives his hero a weakness.`, concept: "circular-dependency" },
  };
}
const flask = P("pallets/flask");
const script: [number, GameEvent][] = [
  [3, { type: "lesson", concept: "test-coverage", facts: { player: "p1", stat: "armor" } }],
  [9, { type: "hit", target: YOU, source: "p4", amount: 18, x: 0, y: 0 }],
  [10, { type: "lesson", concept: "circular-dependency", ref: "p2", facts: { members: (P("rust-lang/rustlings").cycles[0] ?? []).join(" → ") + " → " + (P("rust-lang/rustlings").cycles[0]?.[0] ?? ""), player: "p2" } }],
  [14, { type: "downed", player: YOU }],
  [18, { type: "lesson", concept: "heart-module", facts: { player: "p1", repo: flask.slug, file: flask.heart, fanIn: flask.heartFanIn } }],
  [22, { type: "lesson", concept: "tech-debt", facts: { player: "p2", repo: "rust-lang/rustlings", todos: 150 } }],
  [QUIZ_AT + QUIZ_LEN + 0.2, { type: "perk", player: YOU, perk: "quiz-right", correct: true }],
  [QUIZ_AT + QUIZ_LEN + 0.2, { type: "perk", player: "p1", perk: "quiz-wrong", correct: false }],
  [QUIZ_AT + QUIZ_LEN + 0.2, { type: "perk", player: "p3", perk: "quiz-right", correct: true }],
  [46, { type: "lesson", concept: "coupling", facts: { player: "p5", stat: "speed" } }],
];
function stateAt(t: number, prevT: number): MatchState {
  return {
    t, status: "fighting", mode: "edu", players: players(t), boss: null, heroScale: 2,
    pvp: { round: t < 40 ? 1 : 2, rounds: 3, roundEndsAt: t < 40 ? 40 : 115, scores: {}, leader: "p3" },
    bullets: [], hazards: [], minions: [], obstacles: [], pickups: [],
    events: script.filter(([at]) => at > prevT && at <= t).map(([, e]) => e),
    perkOffer: quizOffer(t),
  };
}

// ---------- arena painter ----------
function arenaCanvas(): { c: HTMLCanvasElement; paint(s: MatchState, time: number): void } {
  const c = h("canvas.demo-arena", { width: AW, height: AH });
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  return {
    c,
    paint(s, time) {
      try { drawArenaBackground(g, "notebook", 7, time, "classroom"); } catch { g.fillStyle = "#101820"; g.fillRect(0, 0, AW, AH); }
      if (s.perkOffer) {
        const L = padLetters(s.perkOffer.pads);
        for (const p of s.perkOffer.pads) {
          const l = L.get(p.id)!;
          g.fillStyle = l.color;
          g.globalAlpha = 0.35 + 0.2 * Math.sin(time * 5);
          g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
          g.globalAlpha = 1;
          g.font = "16px 'Press Start 2P', monospace";
          g.fillStyle = "#05070a";
          g.fillText(l.letter, p.x - 7, p.y + 8);
        }
      }
      for (const p of s.players) try { drawPlayer(g, p, time, p.id === YOU); } catch { g.fillStyle = "#fff"; g.fillRect(p.x - 4, p.y - 6, 8, 12); }
    },
  };
}

// ---------- views ----------
const app = document.getElementById("app")!;
const ctxFor = (variant: EduVariant) => ({ mode: "edu" as const, you: variant === "screen" ? null : YOU, spectator: variant === "screen", players: students });

function runMatch(parts: { variant: EduVariant; feedHost: HTMLElement; quizHost: HTMLElement; arena?: ReturnType<typeof arenaCanvas> }[]) {
  const feeds = parts.map((p) => {
    const feed = createLessonFeed({ variant: p.variant, ctx: ctxFor(p.variant) });
    const quiz = createQuizOverlay({ variant: p.variant, engine: feed.engine });
    p.feedHost.append(feed.el);
    p.quizHost.append(quiz.el);
    return { ...p, feed, quiz };
  });
  let t = 0;
  const step = (to: number) => {
    while (t < to) {
      const prev = t;
      t = Math.min(to, t + 0.1);
      const s = stateAt(t, prev);
      for (const f of feeds) {
        f.feed.update(s);
        f.quiz.update(s, f.variant === "screen" ? null : YOU);
      }
    }
  };
  step(jump);
  const start = performance.now() - jump * 1000;
  const loop = () => {
    const now = (performance.now() - start) / 1000;
    const tt = params.has("freeze") ? jump : now % 70;
    if (tt < t) t = 0; // loop the script
    step(tt);
    const s = stateAt(t, t);
    for (const f of feeds) f.arena?.paint(s, performance.now() / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return feeds;
}

function viewDesktop() {
  const arena = arenaCanvas();
  const feedHost = h("div.demo-gutter");
  const quizHost = h("div.demo-quiz-top");
  app.append(h("div.demo-desktop", null, h("div.demo-stage", null, arena.c, quizHost), feedHost));
  runMatch([{ variant: "desktop", feedHost, quizHost, arena }]);
}

function viewPhone() {
  const arena = arenaCanvas();
  const feedHost = h("div.demo-deck-feed");
  const quizHost = h("div.demo-deck-quiz");
  app.append(
    h("div.demo-phone", null,
      h("div.demo-phone-top", null, h("span", null, "$ kill -9 @cy"), h("span", null, "R1 · 0:38")),
      h("div.demo-phone-view", null, arena.c),
      h("div.demo-deck", null, h("div.demo-deck-row", null, "hp ■■■■□  try{} ■■■  RAM ▮▮▮▮▮▯"), quizHost, feedHost, h("div.demo-deck-btns", null, h("span", null, "DASH"), h("span", null, "SKILL"))),
    ),
  );
  runMatch([{ variant: "phone", feedHost, quizHost, arena }]);
}

function viewScreen() {
  const arena = arenaCanvas();
  const feedHost = h("div.demo-screen-feed");
  const quizHost = h("div.demo-screen-quiz");
  app.append(h("div.demo-screen", null, arena.c, quizHost, feedHost));
  runMatch([{ variant: "screen", feedHost, quizHost, arena }]);
}

function fakeAutopsy(): Autopsy {
  const order = ["p3", "p1", "p5", "p2", "p8", "p6", "p7", "p4"];
  return {
    mode: "edu", victory: false, duration: 231, boss: null, mvp: "p3",
    ranking: order.map((id, i) => {
      const s = students.find((x) => x.id === id)!;
      return { id, name: s.name, repo: s.repo, kos: 9 - i, damage: 1400 - i * 130, roundWins: i === 0 ? 2 : i === 1 ? 1 : 0, quality: s.quality };
    }),
    players: students.map((s) => ({ id: s.id, name: s.name, repo: s.repo, stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false } })),
  };
}

function viewReport(variant: EduVariant) {
  // play the script to the end so the glossary + quiz scores are filled
  const feed = createLessonFeed({ variant, ctx: ctxFor(variant) });
  for (let t = 0, prev = 0; t < 60; prev = t, t += 0.1) feed.engine.ingest(stateAt(t, prev));
  app.append(h(`div.demo-report.v-${variant}`, null, createClassReport({ autopsy: fakeAutopsy(), students, engine: feed.engine, you: variant === "screen" ? null : YOU, variant })));
}

function viewArch() {
  const p = P("burntsushi/ripgrep");
  const kit = bossKitFromProfile(p, 4);
  const autopsy: Autopsy = {
    mode: "battle", victory: true, duration: 190, mvp: null, players: [],
    // DEMO maintainers/issues (fallback data has none yet): shows the "Adopt an organ" layout only
    boss: { repo: p.slug, heart: p.heart, busFactor: 1, limbs: kit.limbs.map((l, i) => ({ component: l.component, broken: true, damageTaken: 100, maintainers: i === 2 ? 1 : 4 + i, fragile: i === 2, issues: i === 2 ? [{ number: 0, title: "(demo) example good first issue", url: `https://github.com/${p.slug}/contribute`, labels: ["good first issue"] }] : [] })) },
  };
  const heroes = [{ label: "you: flask", genesis: buildGenesisLocal(P("pallets/flask"), playerKitFromProfile(P("pallets/flask"))), you: true }, { label: "rustlings", genesis: buildGenesisLocal(P("rust-lang/rustlings"), playerKitFromProfile(P("rust-lang/rustlings"))) }];
  app.append(h("div.demo-report", null, createArchitectureReport({ genesis: buildGenesisLocal(p, kit), kit, autopsy, heroes, variant: "desktop" })));
}

function viewGenesis() {
  const wrap = h("div.demo-report");
  for (const s of students.slice(0, 3)) {
    const g = buildGenesisLocal(s.profile, s.kit);
    const notes = eduGenesisNotes(g, "hero", s.quality);
    wrap.append(h("section.edu-sec", null, h("h3", null, `$ eduGenesisNotes(${s.repo})`), ...EDU_STAGE_ORDER.map((st) => h("div.demo-note", null, h("b", null, notes[st].title), " ", notes[st].text, h("br"), h("span.edu-prompt", null, "→ "), notes[st].fact))));
  }
  app.append(wrap);
}

function viewGallery() {
  app.append(
    h("div.demo-gallery", null, ...ALL_CONCEPTS.map((c) => {
      const info = conceptInfo(c);
      return h("div.demo-tile", { style: `--c:${info.color}` }, h("div.edu-head", null, glyphBadge(info.glyph, info.color), h("span.edu-title", null, info.title)), diagramCanvas(c), h("p", null, info.text));
    })),
    h("div.demo-cards", null, ...students.slice(0, 4).map((s, i) => createReportCard(s, { size: i === 1 ? "lg" : "md", you: s.id === YOU }))),
  );
}

function viewIndex() {
  const links = ["desktop", "phone", "screen", "report", "report-screen", "arch", "genesis", "gallery"];
  app.append(h("div.demo-index", null, h("h1", null, "GITZILLA // EDU LAB"), h("p", null, "Classroom PvP lessons, quiz, report cards. Report cards use the sim's real edu grading of each fallback repo."), ...links.map((l) => h("a.btn", { href: `?view=${l}${["desktop", "phone", "screen"].includes(l) ? "&t=12" : ""}` }, l))));
}

document.body.dataset.view = view;
const views: Record<string, () => void> = { desktop: viewDesktop, phone: viewPhone, screen: viewScreen, report: () => viewReport("desktop"), "report-screen": () => viewReport("screen"), arch: viewArch, genesis: viewGenesis, gallery: viewGallery };
(views[view] ?? viewIndex)();
