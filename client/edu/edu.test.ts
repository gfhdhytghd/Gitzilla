import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MatchState, PerkOffer, PlayerState, QualityStat, RepoProfile } from "../../shared/types.ts";
import { ATTACK_FLAVOR } from "../../sim/flavor.ts";
import { bossKitFromProfile, playerKitFromProfile } from "../../sim/kits.ts";
import { buildGenesisLocal } from "../genesis/local.ts";
import { ALL_CONCEPTS, CONCEPTS, conceptForAttack, factLine, fill } from "./concepts.ts";
import { LessonEngine } from "./engine.ts";
import { EDU_STAGE_ORDER, eduGenesisNotes } from "./genesis.ts";
import { classHighlights, gpa, gpaGrade, weakest } from "./quality.ts";
import { padLetters, quizView } from "./quiz.ts";
import { architectureSummary, helpWanted } from "./summary.ts";

const profile = (slug: string) => JSON.parse(readFileSync(new URL(`../../data/fallback/${slug.replace("/", "__")}.json`, import.meta.url), "utf8")) as RepoProfile;

const Q = (stat: QualityStat["stat"], grade: QualityStat["grade"], signal = `${stat} signal`, tip = `${stat} tip`): QualityStat => ({ stat, value: 1, grade, signal, tip });
const ana = { id: "p1", name: "ana", repo: "ana/parser", quality: [Q("armor", "A", "tests: 31% of files"), Q("speed", "B"), Q("damage", "A", "avg function 14 lines"), Q("weakness", "D", "2 circular dependencies", "Break the cycle api <-> db")] };
const ben = { id: "p2", name: "ben", repo: "ben/game", quality: [Q("armor", "F", "tests: 0% of files", "add tests for utils.py"), Q("speed", "C"), Q("damage", "B"), Q("weakness", "B")] };

function state(t: number, extra: Partial<MatchState> = {}): MatchState {
  return { t, status: "fighting", mode: "edu", players: [], boss: null, heroScale: 2, pvp: null, bullets: [], hazards: [], minions: [], events: [], obstacles: [], pickups: [], perkOffer: null, ...extra };
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z`"@])/).filter(Boolean).length;

describe("concept library", () => {
  it("has a title, glyph and short plain explanation for every concept", () => {
    for (const c of ALL_CONCEPTS) {
      const info = CONCEPTS[c];
      expect(info.title, c).toBeTruthy();
      expect(info.glyph.length, c).toBeLessThanOrEqual(4);
      expect(sentences(info.text), `${c}: ${info.text}`).toBeLessThanOrEqual(2);
      expect(info.text.length, c).toBeLessThan(200);
    }
  });

  it("fills templates only when every fact is present", () => {
    expect(fill("`{component}` is imported by {fanIn} components.", { component: "crates/printer", fanIn: 3 })).toBe("`crates/printer` is imported by 3 components.");
    expect(fill("{a} and {b}", { a: 1 })).toBeNull();
    expect(factLine("circular-dependency", { members: "api → db → api" })).toBe("api → db → api import each other in a loop.");
    expect(factLine("circular-dependency", {})).toBeNull();
    expect(factLine("tech-debt", { repo: "x/y", todos: 1234 })).toContain("1,234");
  });

  it("maps every boss attack flavor to a concept", () => {
    for (const [kind, name] of Object.entries(ATTACK_FLAVOR)) expect(conceptForAttack({ kind, name }), name).toBeTruthy();
    expect(conceptForAttack({ kind: "slam", name: "parse Stack Overflow" })).toBe("stack-overflow");
    expect(conceptForAttack({ kind: "charge", name: "git push --force" })).toBe("force-push");
    expect(conceptForAttack({ kind: "summon", name: "npm install Swarm" })).toBe("dependency-hell");
  });
});

describe("lesson engine", () => {
  const ctx = { mode: "edu" as const, you: "p1", spectator: false, players: [ana, ben] };

  it("turns sim lesson events into cards with real facts, rate limited, new concepts first", () => {
    const e = new LessonEngine(ctx);
    const out1 = e.ingest(state(1, { events: [{ type: "lesson", concept: "circular-dependency", facts: { members: "api → db → api" } }] }));
    expect(out1).toHaveLength(1);
    expect(out1[0].fact).toBe("api → db → api import each other in a loop.");
    // within the gap: queued, not shown
    expect(e.ingest(state(3, { events: [{ type: "lesson", concept: "fan-in", ref: "src/core", facts: { fanIn: 5 } }] }))).toHaveLength(0);
    const later = e.ingest(state(9));
    expect(later[0].concept).toBe("fan-in");
    expect(later[0].fact).toBe("`src/core` is imported by 5 components.");
    expect([...e.seen.keys()]).toEqual(["circular-dependency", "fan-in"]);
  });

  it("enriches player facts with names and report-card grades", () => {
    const e = new LessonEngine(ctx);
    const [l] = e.ingest(state(1, { events: [{ type: "lesson", concept: "test-coverage", facts: { player: "p1", stat: "armor" } }] }));
    expect(l.fact).toBe("`@ana` has armor A: tests: 31% of files.");
    expect(l.about).toBe("p1");
    expect(l.audience).toBe("you");
  });

  it("derives quality lessons when the sim is quiet: start, getting hit, going down", () => {
    const e = new LessonEngine(ctx);
    const [start] = e.ingest(state(0.5));
    expect(start.concept).toBe("code-quality");
    expect(start.fact).toContain("@ana");
    expect(e.ingest(state(8, { events: [{ type: "downed", player: "p1" }] }))[0].fact).toBe("`@ana` tech-debt penalty D: 2 circular dependencies. Tip: Break the cycle api <-> db");
    const e2 = new LessonEngine({ ...ctx, you: "p2" });
    e2.ingest(state(0.5));
    const [hit] = e2.ingest(state(9, { events: [{ type: "hit", target: "p2", source: "p1", amount: 18, x: 0, y: 0 }] }));
    expect(hit.concept).toBe("cohesion");
    expect(hit.fact).toBe("`@ana` damage A: avg function 14 lines.");
  });

  it("does not derive when the sim already teaches, and never in battle", () => {
    const e = new LessonEngine({ ...ctx, mode: "battle" });
    expect(e.ingest(state(1, { events: [{ type: "downed", player: "p1" }] }))).toHaveLength(0);
  });

  it("projector spotlights a class highlight between rounds", () => {
    const e = new LessonEngine({ ...ctx, you: null, spectator: true });
    const pvp = (round: number) => ({ round, rounds: 3, roundEndsAt: 75 * round, scores: {}, leader: null });
    e.ingest(state(0.5, { pvp: pvp(1) }));
    const [l] = e.ingest(state(80, { pvp: pvp(2) }));
    expect(l.audience).toBe("class");
    expect(l.fact).toMatch(/@ana|@ben/);
  });

  it("keeps quiz scores from perk events", () => {
    const e = new LessonEngine(ctx);
    e.ingest(state(1, { events: [{ type: "perk", player: "p1", perk: "x", correct: true }, { type: "perk", player: "p2", perk: "y", correct: false }] }));
    expect(e.quiz.get("p1")).toEqual({ right: 1, total: 1 });
    expect(e.quiz.get("p2")).toEqual({ right: 0, total: 1 });
  });
});

describe("quiz view", () => {
  const pads = [
    { id: "c", name: "C", desc: "", x: 400, y: 140, r: 14, answer: "@ben" },
    { id: "a", name: "A", desc: "", x: 80, y: 140, r: 14, answer: "@ana" },
    { id: "b", name: "B", desc: "", x: 240, y: 140, r: 14, answer: "@cy" },
  ];
  const offer: PerkOffer = { endsAt: 20, pads, picked: { p1: "a", p2: "c" }, quiz: { question: "Whose project has a circular dependency?", explain: "ana: api ↔ db", concept: "circular-dependency" } };
  const players = [{ id: "p1", name: "ana", x: 82, y: 140 }, { id: "p2", name: "ben", x: 398, y: 141 }] as PlayerState[];

  it("letters pads left to right and shows who stands where", () => {
    expect([...padLetters(pads).entries()].map(([id, v]) => id + v.letter)).toEqual(["aA", "bB", "cC"]);
    const v = quizView(offer, players, "p1", 12)!;
    expect(v.answers.map((a) => a.text)).toEqual(["@ana", "@cy", "@ben"]);
    expect(v.answers[0].by).toEqual(["ana"]);
    expect(v.answers[0].mine).toBe(true);
    expect(v.revealed).toBe(false);
    expect(v.endsIn).toBe(8);
  });

  it("reveals from pad.correct or from perk-event truth", () => {
    const v = quizView({ ...offer, pads: pads.map((p) => ({ ...p, correct: p.id === "a" })) }, players, "p1", 21)!;
    expect(v.revealed).toBe(true);
    expect(v.answers.map((a) => a.correct)).toEqual([true, false, false]);
    const v2 = quizView(offer, players, "p2", 21, new Map([["c", false], ["a", true]]))!;
    expect(v2.answers.map((a) => a.correct)).toEqual([true, false, false]);
  });
});

describe("report-card math", () => {
  it("computes GPA, weakest subject and class highlights", () => {
    expect(gpa(ana.quality)).toBeCloseTo((4 + 3 + 4 + 1) / 4);
    expect(gpaGrade(gpa(ana.quality))).toBe("B");
    expect(weakest(ben.quality)!.tip).toBe("add tests for utils.py");
    const hl = classHighlights([ana, ben]);
    expect(hl.find((x) => x.stat === "armor")!.who.name).toBe("ana");
    expect(hl.find((x) => x.stat === "weakness")!.who.name).toBe("ben");
  });
});

describe("genesis narration + architecture summary (real fallback repos)", () => {
  for (const slug of ["burntsushi/ripgrep", "pallets/flask", "facebook/react", "django/django"]) {
    it(`narrates ${slug} with real numbers and no holes`, () => {
      const p = profile(slug);
      const hero = buildGenesisLocal(p, playerKitFromProfile(p));
      const notes = eduGenesisNotes(hero, "hero", ana.quality);
      for (const st of EDU_STAGE_ORDER) {
        const n = notes[st];
        expect(n.text, st).toBeTruthy();
        expect(sentences(n.text), `${st}: ${n.text}`).toBeLessThanOrEqual(2);
        expect(`${n.text} ${n.fact}`, st).not.toMatch(/undefined|NaN|null/);
      }
      expect(notes.clone.fact).toContain(p.totalFiles.toLocaleString("en-US"));
      const kit = bossKitFromProfile(p, 4);
      const lines = architectureSummary(buildGenesisLocal(p, kit), kit);
      expect(lines.length).toBeGreaterThanOrEqual(4);
      for (const l of lines) expect(l.text, l.concept).not.toMatch(/undefined|NaN/);
      expect(lines.some((l) => l.concept === "refactor")).toBe(true);
    });
  }

  it("lists fragile organs first, with their real issues", () => {
    const help = helpWanted({
      repo: "x/y", heart: "a", limbs: [
        { component: "big", broken: true, damageTaken: 1, maintainers: 6 },
        { component: "tiny", broken: true, damageTaken: 1, fragile: true, maintainers: 1, issues: [{ number: 7, title: "Fix docs", url: "https://github.com/x/y/issues/7", labels: ["good first issue"] }] },
      ],
    });
    expect(help.map((x) => x.component)).toEqual(["tiny"]);
    expect(help[0].issues[0].number).toBe(7);
  });
});
