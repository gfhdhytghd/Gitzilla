// PvP royale (mode "pvp" + PvpState.royale): 2–8 heroes, no respawns, last one standing, "GC sweep" shrinking zone.
// Client-only helpers shared by the HUD, the fight screen (kill feed, spectate banner, zone pointer) and the autopsy.
// Static copy lives in its own text nodes (names/numbers in child spans) so the DOM-wide i18n can translate it.
import type { Autopsy, MatchState, PlayerKit, PlayerState } from "../../shared/types";
import { ARENA_H, ARENA_W } from "../../shared/types";
import { codeSpan } from "./codefmt";
import { fmtTime, h } from "./util";
import { t } from "../i18n";

export type Royale = NonNullable<NonNullable<MatchState["pvp"]>["royale"]>;
export type Zone = NonNullable<Royale["zone"]>;

export const royaleOf = (s: MatchState | null | undefined): Royale | null => (s?.mode === "pvp" && s.pvp?.royale) || null;

/** Logical arena size: PvP sims may size the arena for the player count (ClassroomPvpState.arenaW/H). */
export function worldSize(s: MatchState | null | undefined): { w: number; h: number } {
  const pv = s?.pvp as { arenaW?: number; arenaH?: number } | null | undefined;
  return { w: pv?.arenaW || ARENA_W, h: pv?.arenaH || ARENA_H };
}

export const weaponOf = (p: PlayerState | undefined | null) => p?.kit.code?.weapon?.name ?? p?.kit.weapon ?? null;
export const handle = (name: string) => (name.startsWith("@") ? name : `@${name}`);

/** Zone line for the HUD: "GC sweep in 0:12" → "GC sweeping 0:23" → "GC zone locked". */
export function zoneLine(t: number, z: Zone | null): { text: string; urgent: boolean; phase: "idle" | "pending" | "shrinking" | "locked" } {
  if (!z) return { text: "GC idle", urgent: false, phase: "idle" };
  if (t < z.shrinkStart) return { text: `GC sweep in ${fmtTime(z.shrinkStart - t)}`, urgent: z.shrinkStart - t < 10, phase: "pending" };
  if (t < z.shrinkEnd) return { text: `GC sweeping ${fmtTime(z.shrinkEnd - t)}`, urgent: true, phase: "shrinking" };
  return { text: "GC final sweep", urgent: true, phase: "locked" }; // past shrinkEnd the circle keeps collapsing
}

/** Standing in a royale: survivors first (KOs, damage), then the eliminated by placement. */
export function royaleRank(s: MatchState) {
  const r = royaleOf(s)!;
  const sc = s.pvp?.scores ?? {};
  const alive = new Set(r.alive);
  return s.players
    .map((p) => ({ id: p.id, name: p.name, kos: sc[p.id]?.kos ?? 0, damage: sc[p.id]?.damage ?? 0, roundWins: sc[p.id]?.roundWins ?? 0, downs: sc[p.id]?.downs ?? 0,
      alive: alive.has(p.id) && !p.eliminated, place: r.placements[p.id] ?? null }))
    .sort((a, b) => Number(b.alive) - Number(a.alive) || (a.place ?? 0) - (b.place ?? 0) || b.kos - a.kos || b.damage - a.damage);
}

// ---------------- eliminations (diffed from PlayerState.eliminated, so no event contract is needed) ----------------
export interface Elim { id: string; name: string; by: string | null; byName: string | null; weapon: string | null; t: number; place: number | null; left?: boolean }

export function createElimTracker() {
  const seen = new Set<string>();
  const log: Elim[] = [];
  let primed = false;
  return {
    log,
    reset() {
      seen.clear();
      log.length = 0;
      primed = false;
    },
    /** New eliminations since the last snapshot (none for the first one: reconnecting mid-match doesn't replay the feed). */
    update(s: MatchState): Elim[] {
      const r = royaleOf(s);
      if (!r) return [];
      const fresh: Elim[] = [];
      for (const p of s.players) {
        if (!p.eliminated || seen.has(p.id)) continue;
        seen.add(p.id);
        const k = p.killedBy ? s.players.find((x) => x.id === p.killedBy) : undefined;
        const why = (r as Royale & { eliminations?: { player: string; reason?: string }[] }).eliminations?.find((e) => e.player === p.id)?.reason;
        fresh.push({ id: p.id, name: p.name, by: p.killedBy ?? null, byName: k?.name ?? null, weapon: k ? weaponOf(k) : null, t: s.t, place: r.placements[p.id] ?? null, left: why === "left" });
      }
      log.push(...fresh);
      const out = primed ? fresh : [];
      primed = true;
      return out;
    },
  };
}

// ---------------- kill feed (top-left of the arena) ----------------
export function createKillFeed() {
  const el = h("div.kill-feed", { "data-testid": "kill-feed", "aria-live": "polite" });
  return {
    el,
    push(e: Elim, you: string | null) {
      const me = e.id === you || e.by === you;
      const row = e.left
        ? h("div.kf-row.left", null, h("span.kf-w.gc", null, "⏏"), h("span.kf-v", { translate: "no" }, e.name), h("span.kf-k", null, "left"))
        : h(
        `div.kf-row${me ? ".me" : ""}`,
        null,
        e.by ? h("span.kf-k", { translate: "no" }, e.by === you ? t("you") : e.byName ?? "?") : h("span.kf-k.gc", null, "GC"),
        e.by && e.weapon ? h("span.kf-w", null, codeSpan(e.weapon, 18)) : h("span.kf-w.gc", null, "rm -rf"),
        h("span.kf-x", null, "✗"),
        h("span.kf-v", { translate: "no" }, e.id === you ? t("you") : e.name),
      );
      el.prepend(row);
      while (el.childElementCount > 4) el.lastElementChild!.remove();
      setTimeout(() => row.classList.add("old"), 6000);
      setTimeout(() => row.remove(), 7000);
    },
  };
}

// ---------------- spectate banner (eliminated players keep watching) ----------------
export function createSpectateBanner(cycle: (dir: -1 | 1) => void) {
  const place = h("b.sp-place");
  const title = h("div.sp-title");
  const killer = h("div.sp-killer");
  const who = h("b.sp-who", { translate: "no" });
  const left = h("div.sp-left");
  const el = h(
    "div.spectate",
    { "data-testid": "spectate", hidden: true },
    title,
    killer,
    h(
      "div.sp-watch",
      null,
      h("button.btn.btn-tiny", { "data-testid": "spectate-prev", "aria-label": "previous player", onclick: (e: Event) => (e.stopPropagation(), cycle(-1)) }, "<"),
      h("span.sp-lbl", null, "watching"),
      who,
      h("button.btn.btn-tiny", { "data-testid": "spectate-next", "aria-label": "next player", onclick: (e: Event) => (e.stopPropagation(), cycle(1)) }, ">"),
    ),
    left,
  );
  let sig = "";
  return {
    el,
    /** me = null while watching without a hero (host without an eligible repo). */
    update(s: MatchState, me: PlayerState | null, watchId: string | null, watching = !!me?.eliminated) {
      const r = royaleOf(s);
      const show = !!r && watching && s.status === "fighting";
      el.hidden = !show;
      if (!show || !r) return;
      if (!me) {
        const next = ["watch", watchId, r.alive.join(",")].join("|");
        if (next === sig) return;
        sig = next;
        title.replaceChildren(h("span.sp-seg.watch", null, "👁 spectating"), " ", h("span", null, "· no hero in this match"));
        killer.replaceChildren();
        const watched = s.players.find((p) => p.id === watchId);
        who.textContent = watched ? watched.name : "—";
        const names = r.alive.map((id) => s.players.find((p) => p.id === id)?.name ?? id);
        left.replaceChildren(h("b", null, String(names.length)), " ", h("span", null, "left:"), " ", h("span", { translate: "no" }, names.join(" · ")));
        return;
      }
      const k = me.killedBy ? s.players.find((p) => p.id === me.killedBy) : undefined;
      const watched = s.players.find((p) => p.id === watchId);
      const next = [r.placements[me.id], s.players.length, k?.id, watched?.id, r.alive.join(",")].join("|");
      if (next === sig) return;
      sig = next;
      title.replaceChildren(h("span.sp-seg", null, "segfault"), " — ", h("span", null, "you placed"), " ", place);
      place.textContent = `#${r.placements[me.id] ?? r.alive.length + 1} / ${s.players.length}`;
      const w = weaponOf(k);
      killer.replaceChildren(
        ...(k
          ? [h("span", null, "killed by"), " ", h("b", { translate: "no" }, handle(k.name), ...(w ? [h("span.sp-pos", null, "'s")] : [])), " ", ...(w ? [codeSpan(w, 22)] : [])]
          : [h("span", null, "swept by the garbage collector")]),
      );
      who.textContent = watched ? watched.name : "—";
      const names = r.alive.map((id) => s.players.find((p) => p.id === id)?.name ?? id);
      left.replaceChildren(h("b", null, String(names.length)), " ", h("span", null, "left:"), " ", h("span", { translate: "no" }, names.join(" · ")));
    },
  };
}

// ---------------- autopsy data: sim/server rows (place/killedBy, royale.eliminations) or the client's own log ----------------
export interface RoyaleRow { id: string; name: string; repo: string; kos: number; damage: number; place: number; killedBy: string | null; left?: boolean }
// sim/pvp.ts RoyaleRankingRow { placement, killedBy, left } and RoyaleReport.eliminations { player, by, at, placement, reason }
type RoyaleAutopsyLike = Autopsy & {
  ranking?: (NonNullable<Autopsy["ranking"]>[number] & { placement?: number; place?: number; killedBy?: string | null; left?: boolean })[];
  royale?: { placements?: Record<string, number>; winner?: string | null;
    eliminations?: { player?: string; id?: string; by?: string | null; at?: number; t?: number; placement?: number; reason?: string; weapon?: string }[] };
};

export function royaleAutopsy(a0: Autopsy, log: Elim[] | undefined) {
  const a = a0 as RoyaleAutopsyLike;
  const placements = a.royale?.placements ?? {};
  const fromLog = new Map((log ?? []).map((e) => [e.id, e]));
  const base = a.ranking?.length
    ? a.ranking
    : a.players.map((p) => ({ id: p.id, name: p.name, repo: p.repo, kos: 0, damage: p.stats.damage, roundWins: 0, quality: [] }));
  const rows: RoyaleRow[] = base.map((r, i) => {
    const rr = r as (typeof base)[number] & { placement?: number; place?: number; killedBy?: string | null; left?: boolean };
    const reason = a.royale?.eliminations?.find((e) => (e.player ?? e.id) === r.id)?.reason;
    return {
      id: r.id, name: r.name, repo: r.repo, kos: r.kos, damage: r.damage, left: rr.left || reason === "left",
      place: rr.placement ?? rr.place ?? placements[r.id] ?? fromLog.get(r.id)?.place ?? (r.id === a.mvp ? 1 : i + 1),
      killedBy: rr.killedBy !== undefined ? rr.killedBy : fromLog.get(r.id)?.by ?? null,
    };
  });
  rows.sort((x, y) => x.place - y.place || y.kos - x.kos);
  const winner = a.royale?.winner ?? a.mvp ?? rows[0]?.id ?? null;
  const nameOf = (id: string | null | undefined) => rows.find((r) => r.id === id)?.name ?? null;
  const elims = (a.royale?.eliminations?.length
    ? a.royale.eliminations.map((e) => {
        const id = e.player ?? e.id ?? "";
        const by = e.by ?? null;
        return { id, name: nameOf(id) ?? id, by, byName: nameOf(by), weapon: e.weapon ?? fromLog.get(id)?.weapon ?? null, t: e.at ?? e.t ?? fromLog.get(id)?.t ?? 0,
          place: e.placement ?? rows.find((r) => r.id === id)?.place ?? null, left: e.reason === "left" };
      })
    : log?.length
      ? log
      : rows.filter((r) => r.id !== winner).map((r) => ({ id: r.id, name: r.name, by: r.killedBy, byName: nameOf(r.killedBy), weapon: null, t: 0, place: r.place })).sort((x, y) => (y.place ?? 0) - (x.place ?? 0))
  ) as Elim[];
  return { rows, winner, elims };
}

// ---------------- repo power (kit.pvpPower: 0–100 from code quality + stars/contributors/size) ----------------
export type PvpPower = NonNullable<PlayerKit["pvpPower"]>;
export const powerOf = (kit: PlayerKit | null | undefined): PvpPower | null => kit?.pvpPower ?? null;
export const powerScore = (p: PvpPower) => Math.round(p.score);
/** The parts that add the most to the score (value × weight). */
export const topParts = (p: PvpPower, n = 3) => [...p.parts].sort((a, b) => b.value * b.weight - a.value * a.weight).slice(0, n);
/** Ids holding the room's highest power (ties share the crown); empty unless at least two heroes have a power. */
export function strongestIds(players: { id: string; kit?: PlayerKit | null }[]): Set<string> {
  const rated = players.filter((p) => p.kit?.pvpPower);
  if (rated.length < 2) return new Set();
  const best = Math.max(...rated.map((p) => powerScore(p.kit!.pvpPower!)));
  return new Set(rated.filter((p) => powerScore(p.kit!.pvpPower!) === best).map((p) => p.id));
}

/** "POWER 78" + bar; tap → the top 3 contributing parts (label · value). `open` keeps the state across re-renders. */
export function powerBadge(p: PvpPower, opts: { open?: boolean; onToggle?(open: boolean): void; compact?: boolean } = {}): HTMLElement {
  const score = powerScore(p);
  const parts = h(
    "div.pw-parts",
    { hidden: !opts.open, "data-testid": "pvp-power-parts" },
    ...topParts(p).map((x) => h("div.pw-part", null, h("span.pw-part-l", null, x.label), h("b.pw-part-v", null, String(Math.round(x.value))))),
  );
  const head = h(
    "button.pw-head",
    { type: "button", "aria-expanded": String(!!opts.open), title: "repo power: code quality + stars, contributors and size · tap for what counts most",
      onclick: (e: Event) => {
        e.stopPropagation();
        parts.hidden = !parts.hidden;
        head.setAttribute("aria-expanded", String(!parts.hidden));
        opts.onToggle?.(!parts.hidden);
      } },
    h("span.pw-lbl", null, "POWER"),
    h("b.pw-num", null, String(score)),
    h("span.pw-bar", null, h("i", { style: `width:${Math.max(0, Math.min(100, score))}%` })),
    opts.compact ? null : h("span.pw-more", null, "▾"),
  );
  return h(`div.pw${score >= 70 ? ".hi" : score < 40 ? ".lo" : ""}`, { "data-testid": "pvp-power" }, head, parts);
}
