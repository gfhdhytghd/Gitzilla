// Lesson engine: turns match snapshots into a calm stream of lesson cards (rate-limited, new concepts first),
// remembers which concepts the class met (glossary) and keeps quiz scores. Pure (no DOM), driven by match time.
//
// Source of truth is the sim's `lesson` events. When the sim emits none (or for personal touches it can't know,
// like "@ben hit YOU"), the engine derives lessons from ordinary events + the players' real QualityStats.
import type { BossKit, GameEvent, GameMode, MatchState, PerkOffer, QualityStat } from "../../shared/types.ts";
import { type EduConcept, type Facts, STAT_CONCEPT, STAT_LABEL, conceptForAttack, conceptInfo, factLine } from "./concepts.ts";
import { GRADE_POINTS, type Student, classHighlights, strongest, weakest } from "./quality.ts";

export interface Lesson {
  id: number;
  concept: EduConcept;
  title: string;
  text: string;
  more: string;
  /** One concrete sentence with real data from this match/repo (null if the facts couldn't fill a template). */
  fact: string | null;
  /** Player id this lesson is about (their hero / repo), if any. */
  about?: string;
  /** "you": personal (phone/desktop feed); "class": for everyone (projector). */
  audience: "you" | "class";
  t: number;
  derived: boolean;
  color: string;
  glyph: string;
}

export interface EduContext {
  mode: GameMode;
  you: string | null;
  spectator: boolean;
  /** Students in the match: name/repo/quality (PlayerKit.quality). Bots are fine. */
  players: Student[];
  boss?: BossKit | null;
}

export interface QuizScore { right: number; total: number }

const GAP = 7;            // s between two cards
const REPEAT_GAP = 22;    // s before a concept already shown 2x may appear again
const SIM_QUIET = 25;     // s without sim lessons before the engine derives its own

export class LessonEngine {
  ctx: EduContext;
  /** concept → times met + the first real fact line (glossary). */
  readonly seen = new Map<EduConcept, { count: number; fact: string | null }>();
  readonly quiz = new Map<string, QuizScore>();
  readonly quizzes: { question: string; concept: string; explain: string }[] = [];
  /** pad id → correct, inferred from perk events (when the sim reveals correctness only through them). */
  readonly padTruth = new Map<string, boolean>();

  private nextId = 1;
  private lastShown = -Infinity;
  private lastSim = -Infinity;
  private queue: Lesson[] = [];
  private shownFacts = new Set<string>();
  private started = false;
  private round = 0;
  private lastOffer: PerkOffer | null = null;
  private spot = 0;

  constructor(ctx: EduContext) {
    this.ctx = ctx;
  }

  setContext(ctx: Partial<EduContext>) {
    this.ctx = { ...this.ctx, ...ctx };
  }

  name(id: string | undefined | null): string {
    if (!id) return "";
    const p = this.ctx.players.find((x) => x.id === id);
    return p ? `@${p.name}` : id;
  }

  private student(id: string | undefined | null): Student | undefined {
    return id ? this.ctx.players.find((x) => x.id === id) : undefined;
  }

  /** Build a lesson (not yet queued). Facts are enriched with names/repos from the context. */
  make(concept: EduConcept | string, facts: Facts = {}, opts: { about?: string; audience?: "you" | "class"; derived?: boolean; t?: number; ref?: string } = {}): Lesson {
    const info = conceptInfo(concept);
    const f: Facts = { ...facts };
    const about = opts.about ?? (typeof f.player === "string" && this.student(f.player as string) ? (f.player as string) : undefined);
    if (about) {
      const s = this.student(about);
      if (s) {
        if (!f.player || f.player === about) f.player = `@${s.name}`;
        if (!f.repo) f.repo = s.repo;
        // a stat named in the facts → pull its real grade/signal/tip from the report card
        const stat = (f.stat as QualityStat["stat"]) ?? undefined;
        const q = stat ? s.quality?.find((x) => x.stat === stat) : undefined;
        if (q) {
          f.grade ??= q.grade;
          f.signal ??= q.signal;
          f.tip ??= q.tip;
          f.stat = STAT_LABEL[q.stat].plain;
        }
      }
    }
    if (!f.repo && this.ctx.boss) f.repo = this.ctx.boss.repo;
    if (opts.ref && !f.component && !f.file) f[/\.\w+$/.test(opts.ref) ? "file" : "component"] = opts.ref;
    return {
      id: this.nextId++,
      concept: concept as EduConcept,
      title: info.title,
      text: info.text,
      more: info.more,
      fact: factLine(concept, f),
      about,
      audience: opts.audience ?? (about && about === this.ctx.you ? "you" : "class"),
      t: opts.t ?? 0,
      derived: opts.derived ?? false,
      color: info.color,
      glyph: info.glyph,
    };
  }

  /** Queue a lesson; unseen concepts jump the queue. */
  offer(l: Lesson) {
    const key = `${l.concept}|${l.fact ?? ""}`;
    if (this.shownFacts.has(key)) return;
    if (this.queue.some((q) => `${q.concept}|${q.fact ?? ""}` === key)) return;
    const fresh = !this.seen.has(l.concept);
    if (fresh) this.queue.unshift(l);
    else this.queue.push(l);
    if (this.queue.length > 4) this.queue.length = 4;
  }

  /** Feed one snapshot; returns lessons to show now (0 or 1). */
  ingest(s: MatchState): Lesson[] {
    const t = s.t;
    if (s.status === "fighting" && !this.started) {
      this.started = true;
      this.onStart(t);
    }
    if (s.pvp && s.pvp.round > this.round) {
      if (this.round > 0) this.onRound(t);
      this.round = s.pvp.round;
    }
    this.trackQuiz(s);
    for (const e of s.events) this.onEvent(e, t);
    return this.tick(t);
  }

  tick(t: number): Lesson[] {
    if (!this.queue.length || t - this.lastShown < GAP) return [];
    const i = this.queue.findIndex((l) => (this.seen.get(l.concept)?.count ?? 0) < 2 || t - this.lastShown >= REPEAT_GAP);
    if (i < 0) return [];
    const [l] = this.queue.splice(i, 1);
    l.t = t;
    this.lastShown = t;
    this.shownFacts.add(`${l.concept}|${l.fact ?? ""}`);
    const prev = this.seen.get(l.concept);
    this.seen.set(l.concept, { count: (prev?.count ?? 0) + 1, fact: prev?.fact ?? l.fact });
    return [l];
  }

  private deriving(t: number) {
    return this.ctx.mode === "edu" && t - this.lastSim > SIM_QUIET;
  }

  private onStart(t: number) {
    if (this.ctx.mode !== "edu") return;
    const me = this.student(this.ctx.you);
    if (me?.quality?.length) {
      const best = strongest(me.quality)!;
      this.offer(this.make("code-quality", { stat: best.stat }, { about: me.id, audience: "you", derived: true, t }));
    } else if (this.ctx.players.some((p) => p.quality?.length)) {
      const h = classHighlights(this.ctx.players)[0];
      if (h) this.offer(this.make("code-quality", { stat: h.stat }, { about: h.who.id, audience: "class", derived: true, t }));
    }
  }

  /** Between rounds: personal → your weakest grade + tip; projector → spotlight a student's standout stat. */
  private onRound(t: number) {
    if (!this.deriving(t)) return;
    const me = this.student(this.ctx.you);
    if (me && !this.ctx.spectator) {
      const w = weakest(me.quality);
      if (w) this.offer(this.make(STAT_CONCEPT[w.stat], { stat: w.stat }, { about: me.id, audience: "you", derived: true, t }));
      return;
    }
    const hl = classHighlights(this.ctx.players);
    if (!hl.length) return;
    const h = hl[this.spot++ % hl.length];
    this.offer(this.make(STAT_CONCEPT[h.stat], { stat: h.stat }, { about: h.who.id, audience: "class", derived: true, t }));
  }

  private onEvent(e: GameEvent, t: number) {
    switch (e.type) {
      case "lesson": {
        this.lastSim = t;
        const facts = { ...(e.facts ?? {}) };
        const about = typeof facts.player === "string" && this.student(facts.player as string) ? (facts.player as string) : undefined;
        this.offer(this.make(e.concept, facts, { ref: e.ref, about, t }));
        return;
      }
      case "perk":
        if (e.correct === undefined) return;
        {
          const q = this.quiz.get(e.player) ?? { right: 0, total: 0 };
          q.total++;
          if (e.correct) q.right++;
          this.quiz.set(e.player, q);
          const padId = this.lastOffer?.picked[e.player];
          if (padId) this.padTruth.set(padId, e.correct);
        }
        return;
    }
    if (!this.deriving(t)) return;
    const you = this.ctx.you;
    switch (e.type) {
      case "hit": {
        // "@ben hit you for 18: damage A, avg function 14 lines" (only when the sim names the attacker)
        if (!you || e.target !== you || !e.source || e.source === you) return;
        const atk = this.student(e.source);
        if (!atk?.quality) return;
        const dmg = atk.quality.find((q) => q.stat === "damage");
        if (!dmg || GRADE_POINTS[dmg.grade] < 3) return;
        this.offer(this.make("cohesion", { stat: "damage" }, { about: atk.id, audience: "you", derived: true, t }));
        return;
      }
      case "downed": {
        if (e.player !== you || this.ctx.spectator) return;
        const me = this.student(you);
        const w = me && (me.quality?.find((q) => q.stat === "weakness" && GRADE_POINTS[q.grade] <= 2) ?? weakest(me.quality));
        if (w) this.offer(this.make(STAT_CONCEPT[w.stat], { stat: w.stat }, { about: me!.id, audience: "you", derived: true, t }));
        return;
      }
      case "telegraph": {
        const atk = this.ctx.boss?.attacks.find((a) => a.id === e.attackId);
        const c = conceptForAttack({ kind: atk?.kind, name: e.name });
        if (c) this.offer(this.make(c, { attack: e.name }, { derived: true, t, audience: "class" }));
        return;
      }
      case "limbBroken": {
        const limb = this.ctx.boss?.limbs.find((l) => l.id === e.limb);
        if (limb) this.offer(this.make(limb.fragile ? "good-first-issue" : "cascade", { component: limb.component }, { derived: true, t, audience: "class" }));
        return;
      }
      case "obstacleBroken":
        this.offer(this.make("dead-code", { file: e.label }, { derived: true, t, audience: "class" }));
        return;
    }
  }

  private trackQuiz(s: MatchState) {
    const o = s.perkOffer;
    if (o?.quiz && !this.quizzes.some((q) => q.question === o.quiz!.question)) {
      this.quizzes.push({ ...o.quiz });
      this.padTruth.clear();
    }
    if (o) this.lastOffer = o;
  }

  /** Glossary rows: met concepts first (in order met), then the rest of a curated list. */
  glossary(extra: EduConcept[] = []): { concept: EduConcept; met: boolean; count: number; fact: string | null }[] {
    const met = [...this.seen.entries()].map(([concept, v]) => ({ concept, met: true, count: v.count, fact: v.fact }));
    const rest = extra.filter((c) => !this.seen.has(c)).map((concept) => ({ concept, met: false, count: 0, fact: null }));
    return [...met, ...rest];
  }
}
