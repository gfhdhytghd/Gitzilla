// LessonFeed: non-blocking lesson cards. Phone = one compact card in the control deck (tap → bottom sheet with the
// animated diagram); desktop = a stack in the side gutter; projector (?screen=1) = a big lower-third, one at a time.
import type { MatchState } from "../../shared/types.ts";
import { h } from "../app/util.ts";
import { diagramCanvas, glyphBadge } from "./diagrams.ts";
import { type EduContext, type Lesson, LessonEngine } from "./engine.ts";
import "./edu.css";

export type EduVariant = "phone" | "desktop" | "screen";

export interface LessonFeed {
  el: HTMLElement;
  engine: LessonEngine;
  /** Call once per snapshot (cheap). */
  update(s: MatchState): void;
  /** Show a lesson right away (demo / tests). */
  show(l: Lesson): void;
  setContext(ctx: Partial<EduContext>): void;
  setVariant(v: EduVariant): void;
  dispose(): void;
}

const LIFE: Record<EduVariant, number> = { phone: 8000, desktop: 11000, screen: 10000 };
const MAX: Record<EduVariant, number> = { phone: 1, desktop: 3, screen: 1 };

/** Render `code` spans from backticks. */
export function richText(s: string): (Node | string)[] {
  return s.split("`").map((part, i) => (i % 2 ? h("code", null, part) : part));
}

export function lessonCard(l: Lesson, variant: EduVariant, name: (id?: string) => string, expanded = false): HTMLElement {
  const who = l.about ? name(l.about) : "";
  const big = variant !== "phone" || expanded;
  const card = h(
    `div.edu-card.v-${variant}.a-${l.audience}${expanded ? ".open" : ""}`,
    { "data-concept": l.concept, role: "status" },
    h(
      "div.edu-head",
      null,
      glyphBadge(l.glyph, l.color),
      h("span.edu-title", null, l.title),
      who ? h("span.edu-who", null, who) : null,
      h("span.edu-tag", null, l.audience === "you" ? "for you" : "lesson"),
    ),
    h(
      "div.edu-body",
      null,
      big ? diagramCanvas(l.concept) : null,
      h(
        "div.edu-words",
        null,
        variant === "phone" && !expanded ? null : h("p.edu-text", null, ...richText(l.text)),
        l.fact ? h("p.edu-fact", null, h("span.edu-prompt", null, "$ "), ...richText(l.fact)) : null,
        expanded && l.more ? h("p.edu-more", null, ...richText(l.more)) : null,
      ),
    ),
    variant === "screen" || expanded ? null : h("div.edu-hint", null, "tap: learn more"),
    h("div.edu-life"),
  );
  card.style.setProperty("--c", l.color);
  return card;
}

export function createLessonFeed(opts: { variant: EduVariant; ctx: EduContext }): LessonFeed {
  let variant = opts.variant;
  const engine = new LessonEngine(opts.ctx);
  const el = h(`div.edu-feed.v-${variant}`, { "aria-live": "polite" });
  const sheetHost = h("div.edu-sheet-host");
  const timers = new Map<HTMLElement, number>();
  const name = (id?: string) => engine.name(id);

  const remove = (card: HTMLElement) => {
    clearTimeout(timers.get(card));
    timers.delete(card);
    card.classList.add("out");
    setTimeout(() => card.remove(), 260);
  };

  const arm = (card: HTMLElement, ms: number) => {
    card.style.setProperty("--life", `${ms}ms`);
    timers.set(card, window.setTimeout(() => remove(card), ms));
  };

  const openSheet = (l: Lesson) => {
    closeSheet();
    const big = lessonCard(l, variant, name, true);
    const sheet = h("div.edu-sheet", { onclick: closeSheet }, big, h("div.edu-hint", null, "tap to close"));
    sheetHost.append(sheet);
    if (!sheetHost.isConnected) document.body.append(sheetHost);
  };
  function closeSheet() {
    sheetHost.replaceChildren();
  }

  const show = (l: Lesson) => {
    const card = lessonCard(l, variant, name);
    card.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (variant === "phone") {
        openSheet(l);
        remove(card);
        return;
      }
      // desktop: expand in place and stop the countdown
      clearTimeout(timers.get(card));
      const open = lessonCard(l, variant, name, true);
      open.addEventListener("click", (e2) => {
        e2.stopPropagation();
        remove(open);
      });
      card.replaceWith(open);
      timers.delete(card);
    });
    el.prepend(card);
    while (el.childElementCount > MAX[variant]) {
      const last = el.lastElementChild as HTMLElement;
      clearTimeout(timers.get(last));
      timers.delete(last);
      last.remove();
    }
    arm(card, LIFE[variant]);
  };

  return {
    el,
    engine,
    update(s) {
      for (const l of engine.ingest(s)) show(l);
    },
    show,
    setContext(ctx) {
      engine.setContext(ctx);
    },
    setVariant(v) {
      if (v === variant) return;
      el.classList.replace(`v-${variant}`, `v-${v}`);
      variant = v;
      el.replaceChildren();
    },
    dispose() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      sheetHost.remove();
      el.remove();
    },
  };
}
