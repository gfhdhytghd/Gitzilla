// The class attack, staged: every submission's score becomes damage on the shared boss (real boss renderer, classroom
// arena variant). Used by the "three ways" card and the classroom slide. Anonymous by design: projectors show no names.
import { h } from "../../app/util.ts";
import { R } from "../../app/renderers.ts";
import type { BossState } from "../../../shared/types.ts";
import type { Life } from "../core.ts";
import { bossKit } from "../data.ts";
import { stagedBoss } from "../sims.ts";

// No names and no scores on rows: this is what a projector may show.
export interface Hit { label: string; dmg: number }
export interface ClassAttack { el: HTMLElement; frame(t: number, dt: number): void; restart(): void }

export function createClassAttack(slug: string, hits: Hit[], life: Life, o: { scale?: number; period?: number; onHit?(i: number): void } = {}): ClassAttack {
  const k = o.scale ?? 2, period = o.period ?? 9;
  const canvas = h("canvas.ca-canvas", { width: 480 * k, height: 288 * k }) as HTMLCanvasElement;
  const g = canvas.getContext("2d")!;
  const hpFill = h("i"), hpTxt = h("span");
  const rows = h("div.ca-rows");
  const el = h("div.ca", null, canvas, h("div.ca-hp", null, h("b", null, "CLASS BOSS"), h("div.ca-hp-bar", null, hpFill), hpTxt), rows);
  const kit = bossKit(slug, 4), total = hits.reduce((s, x) => s + x.dmg, 0), maxHp = Math.round(total * 1.6);
  let clock = 0, shown = 0, boss: BossState = stagedBoss(kit, 260, 140, 0);
  const pops: { x: number; y: number; t: number; text: string }[] = [];
  const restart = () => { clock = 0; shown = 0; rows.replaceChildren(); pops.length = 0; };
  const hitAt = (i: number) => 1.2 + i * ((period - 4) / hits.length);
  return {
    el, restart,
    frame(t, dt) {
      clock += dt;
      if (clock > period) restart();
      while (shown < hits.length && clock >= hitAt(shown)) {
        const x = hits[shown];
        rows.append(h("div.ca-row", null, h("span.ca-l", null, x.label), h("b.ca-d", null, `−${x.dmg} HP`)));
        const heart = boss.regions.find((r) => r.id === "heart") ?? { x: 260, y: 140 };
        pops.push({ x: heart.x + (Math.random() - 0.5) * 70, y: heart.y - 10, t: 0, text: `-${x.dmg}` });
        o.onHit?.(shown);
        shown++;
      }
      const dealt = hits.slice(0, shown).reduce((s, x) => s + x.dmg, 0), hp = Math.max(0, maxHp - dealt);
      hpFill.style.width = `${(hp / maxHp) * 100}%`;
      hpTxt.textContent = `${hp}/${maxHp}`;
      const lastHit = shown ? clock - hitAt(shown - 1) : 99;
      boss = stagedBoss(kit, 260, 140, t, { hp: hp / maxHp, pose: lastHit < 0.5 ? "stagger" : "idle" });
      boss.pose.t = lastHit < 0.5 ? lastHit : t % 2;
      boss.pose.total = lastHit < 0.5 ? 0.5 : 2;
      g.setTransform(k, 0, 0, k, 0, 0);
      g.imageSmoothingEnabled = false;
      R.drawArenaBackground(g, kit.theme, kit.seed, t, "classroom");
      R.drawBoss(g, boss, t);
      g.font = '12px "Press Start 2P", monospace';
      g.textAlign = "center";
      for (const p of pops) {
        p.t += dt;
        const a = Math.max(0, 1 - p.t / 1.3);
        g.fillStyle = `rgba(0,0,0,${a})`;
        g.fillText(p.text, p.x + 1, p.y - p.t * 30 + 1);
        g.fillStyle = `rgba(255,210,61,${a})`;
        g.fillText(p.text, p.x, p.y - p.t * 30);
      }
      if (pops.length > 30) pops.splice(0, pops.length - 30);
    },
  };
}
