// QuizOverlay: the between-rounds question ("Whose project has a circular dependency?") with the 3 answers that
// match the floor pads (A/B/C, left→right), a mini-map of where they stand, who is standing where, and the reveal
// with the explanation. Players answer by walking onto a pad (the sim decides); this overlay only explains.
import type { MatchState, PerkOffer, PerkPad, PlayerState } from "../../shared/types.ts";
import { h } from "../app/util.ts";
import { conceptInfo } from "./concepts.ts";
import { glyphBadge } from "./diagrams.ts";
import type { LessonEngine } from "./engine.ts";
import type { EduVariant } from "./feed.ts";
import { richText } from "./feed.ts";
import "./edu.css";

export const PAD_COLORS = ["#3de8ff", "#ffd23d", "#ff3d7f", "#39ff88", "#b48cff"];

/** A/B/C by x (left→right, then top→bottom). Renderers can use this to letter the floor pads the same way. */
export function padLetters(pads: PerkPad[]): Map<string, { letter: string; color: string; index: number }> {
  const sorted = [...pads].sort((a, b) => a.x - b.x || a.y - b.y);
  return new Map(sorted.map((p, i) => [p.id, { letter: "ABCDE"[i] ?? "?", color: PAD_COLORS[i % PAD_COLORS.length], index: i }]));
}

export interface QuizView {
  question: string;
  explain: string;
  concept: string;
  endsIn: number;
  revealed: boolean;
  answers: { id: string; letter: string; color: string; text: string; correct: boolean | null; by: string[]; mine: boolean; x: number; y: number }[];
  you: { x: number; y: number } | null;
  bounds: { w: number; h: number };
}

/** Pure: build what the overlay shows. `truth` = pad correctness inferred from perk events (engine.padTruth). */
export function quizView(offer: PerkOffer, players: PlayerState[], you: string | null, t: number, truth?: Map<string, boolean>, ended = false): QuizView | null {
  if (!offer.quiz) return null;
  const L = padLetters(offer.pads);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const anyKnown = offer.pads.some((p) => p.correct !== undefined) || offer.pads.some((p) => truth?.has(p.id));
  // one pad known correct → the rest are wrong
  const knownRight = offer.pads.find((p) => p.correct === true || truth?.get(p.id) === true);
  const answers = [...offer.pads]
    .sort((a, b) => L.get(a.id)!.index - L.get(b.id)!.index)
    .map((p) => {
      const correct = p.correct ?? truth?.get(p.id) ?? (knownRight ? p.id === knownRight.id : null);
      return {
        id: p.id,
        letter: L.get(p.id)!.letter,
        color: L.get(p.id)!.color,
        text: p.answer ?? p.name,
        correct,
        by: Object.entries(offer.picked).filter(([, pad]) => pad === p.id).map(([pid]) => names.get(pid) ?? pid),
        mine: !!you && offer.picked[you] === p.id,
        x: p.x,
        y: p.y,
      };
    });
  const me = you ? players.find((p) => p.id === you) : undefined;
  const xs = [...offer.pads.map((p) => p.x + p.r), ...players.map((p) => p.x)];
  const ys = [...offer.pads.map((p) => p.y + p.r), ...players.map((p) => p.y)];
  return {
    question: offer.quiz.question,
    explain: offer.quiz.explain,
    concept: offer.quiz.concept,
    endsIn: Math.max(0, offer.endsAt - t),
    revealed: ended || anyKnown,
    answers,
    you: me ? { x: me.x, y: me.y } : null,
    bounds: { w: Math.max(480, ...xs), h: Math.max(288, ...ys) },
  };
}

export interface QuizOverlay {
  el: HTMLElement;
  /** Call every snapshot; shows while a quiz offer is open and for a few seconds after (the reveal). */
  update(s: MatchState, you: string | null): void;
  dispose(): void;
}

const REVEAL_HOLD = 6; // s the reveal stays after the offer closes

export function createQuizOverlay(opts: { variant: EduVariant; engine?: LessonEngine }): QuizOverlay {
  const el = h(`div.edu-quiz.v-${opts.variant}`, { "aria-live": "polite" });
  let last: { offer: PerkOffer; players: PlayerState[]; closedAt: number | null } | null = null;
  let sig = "";

  const render = (v: QuizView) => {
    const info = conceptInfo(v.concept);
    const total = Math.max(1, v.answers.reduce((s, a) => s + a.by.length, 0));
    const mine = v.answers.find((a) => a.mine);
    const verdict = v.revealed && mine ? (mine.correct ? "✓ correct! buff next round" : mine.correct === false ? "✗ not quite: small buff anyway" : "") : "";
    // mini-map: where to walk
    const W = 96, H = Math.round((96 * v.bounds.h) / v.bounds.w);
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="#05070a" stroke="#1d3b2b"/>
      ${v.answers.map((a) => `<rect x="${Math.round((a.x / v.bounds.w) * W) - 5}" y="${Math.round((a.y / v.bounds.h) * H) - 5}" width="10" height="10" fill="${a.color}" opacity="${v.revealed && a.correct === false ? 0.3 : 1}"/><text x="${Math.round((a.x / v.bounds.w) * W)}" y="${Math.round((a.y / v.bounds.h) * H) + 3}" font-size="8" text-anchor="middle" fill="#05070a" font-family="monospace" font-weight="bold">${a.letter}</text>`).join("")}
      ${v.you ? `<rect x="${Math.round((v.you.x / v.bounds.w) * W) - 2}" y="${Math.round((v.you.y / v.bounds.h) * H) - 2}" width="4" height="4" fill="#fff"/>` : ""}
    </svg>`;
    el.replaceChildren(
      h(
        "div.qz-head",
        null,
        glyphBadge(info.glyph, info.color),
        h("span.qz-kicker", null, "POP QUIZ"),
        h("span.qz-timer", null, v.revealed ? "answer" : `${v.endsIn.toFixed(0)}s`),
      ),
      h("div.qz-q", null, ...richText(v.question)),
      h(
        "div.qz-main",
        null,
        h(
          "div.qz-answers",
          null,
          ...v.answers.map((a) =>
            h(
              `div.qz-a${a.mine ? ".mine" : ""}${v.revealed ? (a.correct ? ".right" : a.correct === false ? ".wrong" : "") : ""}`,
              { style: `--c:${a.color};--share:${(a.by.length / total) * 100}%` },
              h("span.qz-letter", null, a.letter),
              h("span.qz-text", null, ...richText(a.text)),
              h("span.qz-by", null, opts.variant !== "desktop" ? (a.by.length ? `${a.by.length}` : "") : a.by.slice(0, 3).map((n) => `@${n}`).join(" ") + (a.by.length > 3 ? ` +${a.by.length - 3}` : "")),
              v.revealed && a.correct ? h("span.qz-mark", null, "✓") : null,
            ),
          ),
        ),
        opts.variant === "screen" ? null : h("div.qz-map", { html: svg, title: "walk onto your answer's pad" }),
      ),
      v.revealed
        ? h("div.qz-explain", null, verdict ? h("b", null, verdict + " · ") : null, ...richText(v.explain))
        : h("div.qz-hint", null, opts.variant === "screen" ? "Walk onto the pad with your answer!" : mine ? `standing on ${mine.letter}: stay to lock it in` : "walk onto the pad with your answer"),
      ...(v.revealed ? [] : [h("div.qz-bar", { style: `--p:${Math.min(1, v.endsIn / 15)}` })]),
    );
  };

  return {
    el,
    update(s, you) {
      const o = s.perkOffer;
      if (o?.quiz) {
        last = { offer: o, players: s.players, closedAt: null };
      } else if (last && last.closedAt === null) last.closedAt = s.t;
      if (!last || (last.closedAt !== null && s.t - last.closedAt > REVEAL_HOLD)) {
        if (el.classList.contains("show")) {
          el.classList.remove("show");
          sig = "";
        }
        if (last && last.closedAt !== null) last = null;
        return;
      }
      const v = quizView(last.offer, last.players, you, s.t, opts.engine?.padTruth, last.closedAt !== null);
      if (!v) return;
      const next = JSON.stringify([v.revealed, Math.ceil(v.endsIn), v.answers.map((a) => [a.by, a.correct, a.mine]), v.you && [Math.round(v.you.x / 12), Math.round(v.you.y / 12)]]);
      if (next !== sig) {
        sig = next;
        render(v);
      }
      el.classList.add("show");
    },
    dispose() {
      el.remove();
    },
  };
}
