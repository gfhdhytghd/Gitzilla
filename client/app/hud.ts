// Terminal-style HUD overlay (DOM). Updated every frame but only touches the DOM when a value changes.
import type { BossKit, GameEvent, MatchState, PlayerState } from "../../shared/types";
import { fmtTime, h, shortRepo, humanComponent } from "./util";
import { codeSpan } from "./codefmt";
import { ARCH, bossStateHint } from "./archetype";
import { royaleOf, royaleRank, zoneLine } from "./royale";
import { t } from "../i18n";

const setText = (el: HTMLElement, s: string) => {
  if (el.textContent !== s) el.textContent = s;
};
const setStyle = (el: HTMLElement, k: string, v: string) => {
  if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v);
};
const toggle = (el: HTMLElement, cls: string, on: boolean) => {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
};

const SKILL_KEY = { keyboard: "E", motion: "SHAKE", touch: "SKILL" } as const;
const DASH_KEY = { keyboard: "SPACE", motion: "SWING", touch: "DASH" } as const;
const SKILL_CD_GUESS: Record<string, number> = { firewall: 12, fork: 14, hotfix: 12, overclock: 10, rollback: 9 };

export function limbName(kit: BossKit | undefined, id: string | undefined): string {
  if (!id || !kit) return "core";
  if (id === "heart") return kit.heart || "heart";
  return kit.design?.limbNames?.[id] ?? kit.limbs.find((l) => l.id === id)?.component ?? id;
}
const shortComp = (c: string) => {
  const parts = c.split("/");
  return parts[parts.length - 1] || c;
};

/** PvP standings: round wins, then KOs, then damage (royale: survivors first, then by placement). */
export function rankPvp(s: MatchState) {
  if (royaleOf(s)) return royaleRank(s);
  const sc = s.pvp?.scores ?? {};
  return s.players
    .map((p) => ({ id: p.id, name: p.name, kos: sc[p.id]?.kos ?? 0, damage: sc[p.id]?.damage ?? 0, roundWins: sc[p.id]?.roundWins ?? 0, downs: sc[p.id]?.downs ?? 0 }))
    .sort((a, b) => b.roundWins - a.roundWins || b.kos - a.kos || b.damage - a.damage);
}

export interface Hud {
  el: HTMLElement;
  update(s: MatchState, you: string | null, inputMode: "keyboard" | "motion" | "touch" | null): void;
  event(e: GameEvent, s: MatchState, you: string | null): void;
  /** Boss speech line in the terminal log. */
  say(text: string): void;
  /** Individual panels, so the portrait phone layout can re-home them into the control deck. */
  parts: { self: HTMLElement; team: HTMLElement; combo: HTMLElement; log: HTMLElement; review: HTMLElement; toasts: HTMLElement; skill: HTMLElement; timer: HTMLElement };
}

export function createHud(spectator: boolean): Hud {
  // --- self panel ---
  const selfName = h("div.hs-name", { translate: "no" });
  const hpBar = h("div.seg-bar.hp");
  const arBar = h("div.seg-bar.ar");
  const enFill = h("div.fill");
  const hpNum = h("span.num"), arNum = h("span.num"), enNum = h("span.num");
  const perkRow = h("div.hs-perks");
  const weaponLine = h("div.hs-weapon", { title: "your weapon" });
  const selfPanel = h(
    "div.hud-self.term",
    null,
    selfName,
    perkRow,
    weaponLine,
    // code vocabulary with the plain meaning as a tooltip / tiny hint
    h("div.hs-row", { title: "health: hit points (hearts)" }, h("span.lbl.red", null, "♥ hp"), hpBar, hpNum),
    h("div.hs-row", { title: "armor: a shield that regenerates" }, h("span.lbl.grey", null, "◆ armor"), arBar, arNum),
    h("div.hs-row", { title: "energy: ammo for your weapon" }, h("span.lbl.cyan", null, "⚡ energy"), h("div.en-bar", null, enFill), enNum),
  );

  // --- boss panel ---
  const bossName = h("div.hb-name", { translate: "no" });
  const bossPhase = h("span.hb-phase");
  const bossFill = h("div.fill");
  const bossLag = h("div.lag");
  const bossPct = h("span.hb-pct");
  const limbsRow = h("div.hb-limbs");
  const bossPanel = h(
    "div.hud-boss.term",
    null,
    h("div.hb-top", null, h("span.prompt.red", null, "$ kill -9 "), bossName, bossPhase),
    h("div.hb-bar", null, bossLag, bossFill, bossPct),
    limbsRow,
  );
  let limbEls: { id: string; el: HTMLElement; fill: HTMLElement }[] = [];

  // --- PvP scoreboard (replaces the boss bar when there is no boss): edu rounds, or the royale's alive count + GC zone ---
  const pvRound = h("span.pv-round"), pvClock = h("span.pv-clock"), pvLeader = h("div.pv-leader"), pvYou = h("div.pv-you");
  const pvPrompt = h("span.prompt", null, "$ ./brawl ");
  const pvpPanel = h(
    "div.hud-boss.hud-pvp.term.hidden",
    null,
    h("div.hb-top", null, pvPrompt, pvRound, h("span.hb-phase", null, pvClock)),
    pvLeader,
    pvYou,
  );
  const updateRoyale = (s: MatchState, you: string | null) => {
    const r = royaleOf(s)!;
    setText(pvPrompt, "$ ./royale ");
    setText(pvRound, `${r.alive.length}/${s.players.length} alive`);
    pvRound.dataset.testid = "royale-alive";
    const me = s.players.find((p) => p.id === you);
    const z = r.zone;
    const zl = zoneLine(s.t, z);
    const out = !!me && !me.eliminated && !!z && Math.hypot(me.x - z.cx, me.y - z.cy) > z.r;
    setText(pvClock, out ? (z!.dps > 0 ? `⚠ outside the GC zone · -${z!.dps}♥/s` : "⚠ outside the GC zone") : zl.text);
    pvClock.dataset.testid = "royale-zone";
    toggle(pvClock, "urgent", out || zl.urgent);
    toggle(pvpPanel, "out-zone", out);
    const ranked = royaleRank(s);
    const lead = ranked.filter((x) => x.alive).sort((a, b) => b.kos - a.kos || b.damage - a.damage)[0];
    // "you" is localized before it goes into the {0} pattern (names stay as they are)
    setText(pvLeader, r.winner ? (r.winner === you ? "★ you survived the merge" : `★ ${s.players.find((p) => p.id === r.winner)?.name ?? "—"} survived the merge`) : lead ? `★ most KOs: ${lead.id === you ? t("you") : lead.name} · ${lead.kos} KO` : "");
    const mine = ranked.find((x) => x.id === you);
    if (mine) setText(pvYou, mine.alive ? `you: alive · ${mine.kos} KO · ${Math.round(mine.damage)} dmg` : `you: #${mine.place ?? "?"} · ${mine.kos} KO · spectating`);
    toggle(pvYou, "hidden", !mine);
  };
  const updatePvp = (s: MatchState, you: string | null) => {
    const pv = s.pvp;
    if (!pv) return;
    if (pv.royale && s.mode === "pvp") return updateRoyale(s, you);
    setText(pvRound, `round ${pv.round}/${pv.rounds}`);
    const left = Math.max(0, pv.roundEndsAt - s.t);
    setText(pvClock, `${fmtTime(left)} left`);
    toggle(pvClock, "urgent", left < 10);
    const ranked = rankPvp(s);
    const lead = ranked[0];
    const leadName = lead ? (lead.id === you ? "you" : lead.name) : "—";
    setText(pvLeader, lead ? `★ leader: ${leadName} · ${lead.kos} KO · ${lead.roundWins} round${lead.roundWins === 1 ? "" : "s"}` : "");
    const i = ranked.findIndex((r) => r.id === you);
    if (i >= 0) setText(pvYou, `you: #${i + 1} of ${ranked.length} · ${ranked[i].kos} KO · ${Math.round(ranked[i].damage)} dmg`);
    toggle(pvYou, "hidden", i < 0);
  };
  let limbKitSig = "";

  // --- telegraph ---
  const tgMain = h("div.tg-main");
  const tgTrace = h("div.tg-trace");
  const tgTarget = h("div.tg-target");
  const bossHint = h("div.boss-hint", { "data-testid": "boss-state-hint" });
  const telegraph = h("div.hud-telegraph", null, tgMain, tgTrace, tgTarget);

  // --- misc ---
  const timer = h("div.hud-timer.term");
  const team = h("div.hud-team.term");
  const teamRows = new Map<string, { row: HTMLElement; name: HTMLElement; bar: HTMLElement; st: HTMLElement }>();
  const skillBox = h("div.hud-skill");
  const skillKey = h("span.key"), skillName = h("span.sk-name"), skillState = h("span.sk-state"), skillFill = h("div.sk-fill");
  const dashKey = h("span.key"), dashState = h("span.sk-state"), dashFill = h("div.sk-fill");
  const skillEl = h("div.sk", null, skillFill, skillKey, skillName, skillState);
  const dashEl = h("div.sk.dash", { title: "dash: quick dodge, briefly invulnerable" }, dashFill, dashKey, h("span.sk-name", null, "--force"), dashState);
  skillBox.append(dashEl, skillEl);
  const combo = h("div.hud-combo");
  // code review (phase-2 perk pick): banner with the 3 PR cards + who picked what
  const reviewTimer = h("span.rv-timer");
  const reviewCards = h("div.rv-cards");
  const review = h("div.hud-review", null, h("div.rv-title", null, "CODE REVIEW ", h("span.dim", null, "· stand on a PR to merge your perk "), reviewTimer), reviewCards);
  let reviewSig = "";
  const perkNames = new Map<string, string>();
  const toasts = h("div.hud-toasts");
  const toastAt = (text: string, cls: string) => {
    const t = h(`div.htoast.${cls}`, null, text);
    toasts.append(t);
    while (toasts.childElementCount > 4) toasts.firstElementChild!.remove();
    setTimeout(() => t.remove(), 1600);
  };
  const log = h("div.hud-log.term");
  const dnPct = h("span.dn-pct");
  const downed = h(
    "div.hud-downed",
    null,
    h("span.dn-title", null, "SEGFAULT"),
    h("span.dn-sub", null, "you're down · a teammate standing next to you runs systemctl restart (revive)"),
    h("div.dn-bar"),
    dnPct,
  );
  const dnBar = downed.querySelector(".dn-bar") as HTMLElement;

  const el = h("div.hud" + (spectator ? ".spectator" : ""), null, bossPanel, pvpPanel, bossHint, telegraph, review, timer, spectator ? null : selfPanel, team, spectator ? null : skillBox, combo, log, spectator ? null : downed, toasts);

  let skillMax = new Map<string, number>();
  let lastTelegraphName = "";
  let comboUntil = 0;
  let bossHpLag = 1;
  let lastUpdate = performance.now();

  const segs = (bar: HTMLElement, n: number, full: number, cls: string) => {
    n = Math.max(0, Math.min(12, Math.round(n)));
    if (bar.childElementCount !== n) {
      bar.replaceChildren(...Array.from({ length: n }, () => h(`i.${cls}`)));
    }
    for (let i = 0; i < n; i++) {
      const c = bar.children[i] as HTMLElement;
      const st = full >= i + 1 ? "on" : full > i ? "half" : "off";
      if (c.dataset.s !== st) c.dataset.s = st;
    }
  };

  const logLine = (text: string, cls = "") => {
    const ln = h(`div.log-line${cls ? "." + cls : ""}`, null, text);
    log.append(ln);
    while (log.childElementCount > 5) log.firstElementChild!.remove();
    setTimeout(() => ln.classList.add("old"), 5000);
  };

  return {
    el,
    parts: { self: selfPanel, team, combo, log, review, toasts, skill: skillBox, timer },
    update(s, you, inputMode) {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastUpdate) / 1000);
      lastUpdate = now;
      const boss = s.boss;
      const me = s.players.find((p) => p.id === you) ?? null;
      toggle(bossPanel, "hidden", !boss);
      toggle(pvpPanel, "hidden", !!boss);
      if (!boss) updatePvp(s, you);
      setText(timer, `T+${fmtTime(s.t)}`);

      // self (players left out of the match because they had no ready repo just watch)
      toggle(selfPanel, "hidden", !me);
      toggle(skillBox, "hidden", !me);
      if (me && !spectator) {
        setText(selfName, `${me.name} · ${me.kit.title}`);
        segs(hpBar, me.kit.maxHp, me.hp, "hp");
        segs(arBar, me.kit.maxArmor, me.armor, "ar");
        setText(hpNum, `${Math.ceil(me.hp)}/${me.kit.maxHp}`);
        setText(arNum, `${Math.floor(me.armor)}/${me.kit.maxArmor}`);
        arNum.title = "armor = try{} — catches hits first, regenerates";
        setText(enNum, `${Math.round(me.energy)}MB`);
        const w = me.kit.code?.weapon;
        const wName = w?.name ?? me.kit.weapon;
        if (weaponLine.dataset.name !== wName) {
          weaponLine.dataset.name = wName;
          weaponLine.replaceChildren("⌐ ", codeSpan(wName), ...(w ? [h("span.hs-proj", null, ` fires ${w.projectiles.slice(0, 2).map((x) => `"${x}"`).join(" ")}`)] : []));
        }
        setStyle(enFill, "width", `${Math.max(0, Math.min(100, (me.energy / me.kit.maxEnergy) * 100)).toFixed(1)}%`);
        toggle(selfPanel, "low", me.hp <= 2 && me.alive);
        const perks = me.perks ?? [];
        const ps = perks.join(",");
        if (perkRow.dataset.sig !== ps) {
          perkRow.dataset.sig = ps;
          perkRow.replaceChildren(...perks.map((id) => h("span.perk-badge", { title: id }, perkNames.get(id) ?? id)));
        }
        // skill + dash
        const mode = inputMode ?? "keyboard";
        setText(skillKey, SKILL_KEY[mode]);
        setText(dashKey, DASH_KEY[mode]);
        setText(skillName, me.kit.skill);
        const prevMax = skillMax.get(me.id) ?? SKILL_CD_GUESS[me.kit.skill] ?? 10;
        if (me.skillCd > prevMax) skillMax.set(me.id, me.skillCd);
        const smax = skillMax.get(me.id) ?? prevMax;
        setText(skillState, me.skillCd > 0 ? `${me.skillCd.toFixed(1)}s` : "READY");
        toggle(skillEl, "ready", me.skillCd <= 0);
        setStyle(skillFill, "height", `${me.skillCd > 0 ? (1 - me.skillCd / smax) * 100 : 100}%`);
        setText(dashState, me.dashCd > 0 ? `${me.dashCd.toFixed(1)}s` : "READY");
        toggle(dashEl, "ready", me.dashCd <= 0);
        setStyle(dashFill, "height", `${me.dashCd > 0 ? Math.max(0, 1 - me.dashCd / 1.2) * 100 : 100}%`);
        toggle(downed, "show", !me.alive && s.status === "fighting" && !royaleOf(s)); // royale: the spectate banner instead
        setText(downed.querySelector(".dn-sub")!, s.pvp ? "Respawning shortly. Get ready for the next exchange." : "you're down · a teammate standing next to you runs systemctl restart (revive)");
        if (!me.alive) {
          setStyle(dnBar, "--p", String(me.reviveProgress));
          setText(dnPct, s.pvp ? "RESTARTING" : `${Math.round(me.reviveProgress * 100)}%`);
        }
      }

      // boss
      if (boss) {
      const kit = boss.kit;
      setText(bossName, kit.archetype && ARCH[kit.archetype] ? `${ARCH[kit.archetype].icon} ${kit.name}` : kit.name);
      const hint = bossStateHint(boss);
      setText(bossHint, hint?.text ?? "");
      toggle(bossHint, "show", !!hint && s.status === "fighting");
      if (hint) bossHint.dataset.kind = hint.kind;
      const pct = Math.max(0, boss.hp / boss.maxHp);
      bossHpLag = Math.max(pct, bossHpLag - 0.24 * dt);
      if (bossHpLag < pct) bossHpLag = pct;
      setStyle(bossFill, "width", `${(pct * 100).toFixed(2)}%`);
      setStyle(bossLag, "width", `${(bossHpLag * 100).toFixed(2)}%`);
      setText(bossPct, `${Math.ceil(pct * 100)}%`);
      setText(bossPhase, boss.phase === 3 ? " PHASE 3 · LAST STAND" : boss.enraged || boss.phase === 2 ? " PHASE 2 · ENRAGED" : " PHASE 1");
      toggle(bossPanel, "enraged", boss.enraged || boss.phase >= 2);
      toggle(bossPanel, "p3", boss.phase === 3);
      const sig = kit.limbs.map((l) => l.id).join(",");
      if (sig !== limbKitSig) {
        limbKitSig = sig;
        limbEls = kit.limbs.map((l) => {
          const fill = h("div.lf");
          const e = h(`div.limb${l.weakPoint ? ".weak" : ""}`, { title: l.component }, fill, h("span", null, kit.design?.limbNames?.[l.id] ?? shortComp(humanComponent(l.component))));
          return { id: l.id, el: e, fill };
        });
        limbsRow.replaceChildren(...limbEls.map((x) => x.el));
      }
      for (const le of limbEls) {
        const st = boss.limbs.find((l) => l.id === le.id);
        if (!st) continue;
        toggle(le.el, "broken", st.broken);
        setStyle(le.fill, "width", `${((st.hp / st.maxHp) * 100).toFixed(1)}%`);
      }

      // telegraph
      const c = boss.casting;
      if (c && s.status === "fighting") {
        const atk = kit.attacks.find((a) => a.id === c.attackId);
        const left = Math.max(0, c.total - c.t);
        const name = atk?.name ?? c.attackId;
        setText(tgMain, `FATAL: ${name} in ${left.toFixed(1)}s`);
        if (lastTelegraphName !== c.attackId) {
          lastTelegraphName = c.attackId;
          const src = atk?.source ?? "core";
          setText(tgTrace, `    at ${src} (${shortComp(src)}.${["ts", "rs", "py", "go", "c"][kit.seed % 5]}:${(c.attackId.length * 37) % 900 + 12})\n    at Kaiju.${atk?.kind ?? "attack"} (${kit.repo})`);
        }
        const targeted = !!you && boss.targetPlayer === you;
        toggle(telegraph, "you", targeted);
        const tName = boss.targetPlayer ? s.players.find((p) => p.id === boss.targetPlayer)?.name : null;
        setText(tgTarget, targeted ? ">>> TARGET: YOU <<< DODGE" : tName ? `target: ${tName}` : "");
        toggle(telegraph, "show", true);
      } else {
        toggle(telegraph, "show", false);
        lastTelegraphName = "";
      }
      } else toggle(telegraph, "show", false);

      // team
      // PvP: a live leaderboard (top N by standing, 30-student classes don't fit a full list)
      const others = s.pvp
        ? rankPvp(s).slice(0, spectator || royaleOf(s) ? 10 : 6).map((r) => s.players.find((p) => p.id === r.id)!).filter(Boolean)
        : s.players.filter((p) => spectator || p.id !== you);
      const seen = new Set<string>();
      for (const p of others) {
        seen.add(p.id);
        let r = teamRows.get(p.id);
        if (!r) {
          const name = h("span.tm-name", { translate: "no" }), bar = h("div.tm-bar", null, h("i")), st = h("span.tm-st");
          r = { row: h("div.tm-row", null, name, bar, st), name, bar, st };
          teamRows.set(p.id, r);
          team.append(r.row);
        }
        const rank = s.pvp ? others.indexOf(p) + 1 : 0;
        setText(r.name, rank ? `${rank}. ${p.name}` : `${p.name}`);
        r.name.title = shortRepo(p.kit.repo);
        setStyle(r.bar.firstElementChild as HTMLElement, "width", `${Math.max(0, (p.hp / p.kit.maxHp) * 100).toFixed(0)}%`);
        setStyle(r.row, "--c", p.kit.palette[0] ?? "#39ff88");
        toggle(r.row, "down", !p.alive);
        if (s.pvp && team.children[rank - 1] !== r.row) team.insertBefore(r.row, team.children[rank - 1] ?? null); // move only when rank changes
        toggle(r.row, "me", p.id === you);
        const sc = s.pvp?.scores[p.id];
        const roy = royaleOf(s);
        toggle(r.row, "out", !!p.eliminated);
        if (roy && p.eliminated) {
          setText(r.st, `#${roy.placements[p.id] ?? "?"} ✗`);
          const k = s.players.find((x) => x.id === p.killedBy);
          r.st.title = k ? `eliminated by ${k.name}` : "eliminated by the GC sweep";
        } else {
          setText(r.st, sc ? `${sc.kos} KO` : p.alive ? `${Math.ceil(p.hp)}♥` : p.reviveProgress > 0 ? `restart ${Math.round(p.reviveProgress * 100)}%` : "segfault");
          r.st.title = p.alive ? "health" : s.pvp ? "Respawning shortly" : "downed: stand next to them to revive (systemctl restart)";
        }
      }
      for (const [id, r] of teamRows) if (!seen.has(id)) (r.row.remove(), teamRows.delete(id));

      toggle(combo, "show", performance.now() < comboUntil);

      // code review
      const offer = s.perkOffer;
      toggle(review, "show", !!offer && !offer.quiz); // edu quizzes have their own overlay (client/edu)
      if (offer) {
        for (const pad of offer.pads) perkNames.set(pad.id, pad.name);
        setText(reviewTimer, `${Math.max(0, offer.endsAt - s.t).toFixed(1)}s`);
        const sig = offer.pads.map((p) => p.id).join(",") + "|" + Object.entries(offer.picked).map(([k, v]) => k + v).join(",");
        if (sig !== reviewSig) {
          reviewSig = sig;
          const nameOf = (id: string) => (id === you ? "you" : s.players.find((p) => p.id === id)?.name ?? id);
          reviewCards.replaceChildren(
            ...offer.pads.map((pad, i) => {
              const by = Object.entries(offer.picked).filter(([, padId]) => padId === pad.id).map(([pid]) => nameOf(pid));
              const mine = !!you && offer.picked[you] === pad.id;
              return h(
                `div.rv-card${mine ? ".mine" : ""}`,
                { onclick: () => toastAt(`walk onto the ${pad.name} pad`, "pk-perk") },
                h("div.rv-pr", null, `PR #${((s.boss?.kit.seed ?? 7) % 900) + 100 + i}`),
                h("div.rv-name", null, pad.name),
                h("div.rv-desc", null, pad.desc),
                h("div.rv-by", null, by.length ? `✓ approved by ${by.join(", ")}` : "awaiting review…"),
              );
            }),
          );
        }
      } else reviewSig = "";
    },
    say(text) {
      logLine(`boss> ${text}`, "boss");
    },
    event(e, s, you) {
      const name = (id: string) => (id === you ? "you" : s.players.find((p) => p.id === id)?.name ?? id);
      const kit = s.boss?.kit;
      switch (e.type) {
        case "hit":
          if (e.combo && e.combo >= 2) {
            combo.replaceChildren(h("span.cx", null, `x${e.combo}`), h("span.cl", null, "SYNC COMBO"));
            combo.classList.remove("pop");
            void combo.offsetWidth;
            combo.classList.add("pop");
            comboUntil = performance.now() + 1400;
          }
          break;
        case "pickup":
          if (e.player === you) toastAt(e.kind === "heart" ? "+1 commit ♥ (heal)" : e.kind === "armor" ? "test passed ✓ (+armor)" : "☕ +RAM (energy)", `pk-${e.kind}`);
          break;
        case "obstacleBroken":
          logLine(`[${fmtTime(s.t)}] rm ${e.label}`, "good");
          break;
        case "perk": {
          const pn = perkNames.get(e.perk) ?? e.perk;
          logLine(`[${fmtTime(s.t)}] ${name(e.player)} merged ${pn}`, "good");
          if (e.player === you) toastAt(`merged ${pn}`, "pk-perk");
          break;
        }
        case "limbBroken":
          logLine(`[${fmtTime(s.t)}] ${name(e.by)} rm -rf ${limbName(kit, e.limb)}  ✗`, "good");
          break;
        case "downed":
          logLine(`[${fmtTime(s.t)}] ${name(e.player)}: segfault (downed)`, "bad");
          break;
        case "revived":
          logLine(`[${fmtTime(s.t)}] ${name(e.by)} restarted ${name(e.player)}`, "good");
          break;
        case "skill":
          logLine(`[${fmtTime(s.t)}] ${name(e.player)} $ ${e.skill}`, "");
          break;
        case "phase":
          logLine(`[${fmtTime(s.t)}] WARN boss entered phase ${e.phase}`, "bad");
          break;
        case "telegraph":
          if (e.targetPlayer && e.targetPlayer === you) logLine(`[${fmtTime(s.t)}] incoming: ${e.name}`, "bad");
          break;
      }
    },
  };
}
