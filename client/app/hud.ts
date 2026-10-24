// Terminal-style HUD overlay (DOM). Updated every frame but only touches the DOM when a value changes.
import type { BossKit, GameEvent, MatchState, PlayerState } from "../../shared/types";
import { fmtTime, h, shortRepo } from "./util";

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

export function limbName(kit: BossKit, id: string | undefined): string {
  if (!id) return "core";
  if (id === "heart") return kit.heart || "heart";
  return kit.design?.limbNames?.[id] ?? kit.limbs.find((l) => l.id === id)?.component ?? id;
}
const shortComp = (c: string) => {
  const parts = c.split("/");
  return parts[parts.length - 1] || c;
};

export interface Hud {
  el: HTMLElement;
  update(s: MatchState, you: string | null, inputMode: "keyboard" | "motion" | "touch" | null): void;
  event(e: GameEvent, s: MatchState, you: string | null): void;
  /** Boss speech line in the terminal log. */
  say(text: string): void;
}

export function createHud(spectator: boolean): Hud {
  // --- self panel ---
  const selfName = h("div.hs-name");
  const hpBar = h("div.seg-bar.hp");
  const arBar = h("div.seg-bar.ar");
  const enFill = h("div.fill");
  const hpNum = h("span.num"), arNum = h("span.num"), enNum = h("span.num");
  const perkRow = h("div.hs-perks");
  const selfPanel = h(
    "div.hud-self.term",
    null,
    selfName,
    perkRow,
    h("div.hs-row", null, h("span.lbl.red", null, "HP "), hpBar, hpNum),
    h("div.hs-row", null, h("span.lbl.grey", null, "ARM"), arBar, arNum),
    h("div.hs-row", null, h("span.lbl.cyan", null, "NRG"), h("div.en-bar", null, enFill), enNum),
  );

  // --- boss panel ---
  const bossName = h("div.hb-name");
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
  let limbKitSig = "";

  // --- telegraph ---
  const tgMain = h("div.tg-main");
  const tgTrace = h("div.tg-trace");
  const tgTarget = h("div.tg-target");
  const telegraph = h("div.hud-telegraph", null, tgMain, tgTrace, tgTarget);

  // --- misc ---
  const timer = h("div.hud-timer.term");
  const team = h("div.hud-team.term");
  const teamRows = new Map<string, { row: HTMLElement; name: HTMLElement; bar: HTMLElement; st: HTMLElement }>();
  const skillBox = h("div.hud-skill");
  const skillKey = h("span.key"), skillName = h("span.sk-name"), skillState = h("span.sk-state"), skillFill = h("div.sk-fill");
  const dashKey = h("span.key"), dashState = h("span.sk-state"), dashFill = h("div.sk-fill");
  const skillEl = h("div.sk", null, skillFill, skillKey, skillName, skillState);
  const dashEl = h("div.sk.dash", null, dashFill, dashKey, h("span.sk-name", null, "dash"), dashState);
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
    h("span.dn-sub", null, "you're down · stand-by for teammate revive"),
    h("div.dn-bar"),
    dnPct,
  );
  const dnBar = downed.querySelector(".dn-bar") as HTMLElement;

  const el = h("div.hud" + (spectator ? ".spectator" : ""), null, bossPanel, telegraph, review, timer, spectator ? null : selfPanel, team, spectator ? null : skillBox, combo, log, spectator ? null : downed, toasts);

  let skillMax = new Map<string, number>();
  let lastTelegraphName = "";
  let comboUntil = 0;
  let bossHpLag = 1;

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
    update(s, you, inputMode) {
      const boss = s.boss;
      const kit = boss.kit;
      const me = s.players.find((p) => p.id === you) ?? null;
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
        setText(enNum, `${Math.round(me.energy)}`);
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
        toggle(downed, "show", !me.alive && s.status === "fighting");
        if (!me.alive) {
          setStyle(dnBar, "--p", String(me.reviveProgress));
          setText(dnPct, `${Math.round(me.reviveProgress * 100)}%`);
        }
      }

      // boss
      setText(bossName, kit.name);
      const pct = Math.max(0, boss.hp / boss.maxHp);
      bossHpLag = Math.max(pct, bossHpLag - 0.004);
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
          const e = h(`div.limb${l.weakPoint ? ".weak" : ""}`, { title: l.component }, fill, h("span", null, kit.design?.limbNames?.[l.id] ?? shortComp(l.component)));
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

      // team
      const others = s.players.filter((p) => spectator || p.id !== you);
      const seen = new Set<string>();
      for (const p of others) {
        seen.add(p.id);
        let r = teamRows.get(p.id);
        if (!r) {
          const name = h("span.tm-name"), bar = h("div.tm-bar", null, h("i")), st = h("span.tm-st");
          r = { row: h("div.tm-row", null, name, bar, st), name, bar, st };
          teamRows.set(p.id, r);
          team.append(r.row);
        }
        setText(r.name, `${p.name}`);
        r.name.title = shortRepo(p.kit.repo);
        setStyle(r.bar.firstElementChild as HTMLElement, "width", `${Math.max(0, (p.hp / p.kit.maxHp) * 100).toFixed(0)}%`);
        setStyle(r.row, "--c", p.kit.palette[0] ?? "#39ff88");
        toggle(r.row, "down", !p.alive);
        setText(r.st, p.alive ? `${Math.ceil(p.hp)}♥` : p.reviveProgress > 0 ? `REVIVE ${Math.round(p.reviveProgress * 100)}%` : "404");
      }
      for (const [id, r] of teamRows) if (!seen.has(id)) (r.row.remove(), teamRows.delete(id));

      toggle(combo, "show", performance.now() < comboUntil);

      // code review
      const offer = s.perkOffer;
      toggle(review, "show", !!offer);
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
                null,
                h("div.rv-pr", null, `PR #${(s.boss.kit.seed % 900) + 100 + i}`),
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
      const kit = s.boss.kit;
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
          if (e.player === you) toastAt(e.kind === "heart" ? "+1 ♥" : e.kind === "armor" ? "+1 ◆" : "+energy", `pk-${e.kind}`);
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
