// 10 · Close: the boss takes its last hits and dissolves into drifting pixel shards (a smooth fade, never a flash),
// the wordmark returns, and the end card says "Scan to start playing" with the homepage QR.
import { h } from "../../app/util.ts";
import { R } from "../../app/renderers.ts";
import { createMarkAnim } from "../../app/logo.ts";
import { wordmark } from "../../app/wordmark.ts";
import type { Scene } from "../core.ts";
import { FEATURED, bossKit } from "../data.ts";
import { stagedBoss } from "../sims.ts";
import { HOME_URL, clearOverQr, homeQr } from "./fx.ts";

export const close: Scene = {
  id: "close", title: "Thanks", tracks: ["grand"],
  mount(el, life, ctx) {
    const kit = bossKit(FEATURED[ctx.repo], 4);
    const canvas = h("canvas.close-boss", { width: 960, height: 576 }) as HTMLCanvasElement;
    const g = canvas.getContext("2d")!;
    const blast = h("div.close-blast");
    const end = h("div.close-end");
    el.append(canvas, blast, end);
    clearOverQr(el, life);
    let clock = 0, phase: "hit" | "death" | "gone" = "hit";
    const pops: { x: number; y: number; t: number; n: number }[] = [];

    function explode() {
      phase = "gone";
      ctx.blip("boom");
      ctx.shake(1);
      canvas.classList.add("gone");
      // pixel shards in the boss's own palette
      const pal = kit.palette;
      for (let i = 0; i < (ctx.calm ? 0 : 140); i++) {
        const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * 700, s = 10 + ((Math.random() * 4) | 0) * 6;
        blast.append(h("i.shard", { style: `width:${s}px;height:${s}px;background:${pal[i % pal.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d * 0.7}px;--r:${(Math.random() * 900) | 0}deg;animation-delay:${(Math.random() * 120) | 0}ms` }));
      }
      life.timeout(() => blast.replaceChildren(), 2200);
      life.timeout(() => {
        const mark = createMarkAnim(6);
        life.add(() => mark.destroy());
        end.replaceChildren(
          h("div.close-wm", null, wordmark({ width: "860px", enter: !ctx.calm, sparkle: !ctx.calm })),
          h("div.close-row", null,
            h("div.close-card", null, homeQr("close-qr"), h("div", null, h("div.close-scan", null, "Scan to start playing"), h("div.close-url", null, HOME_URL.replace(/^https:\/\//, "")),
              h("a.repo-link", { href: "https://github.com/gfhdhytghd/Gitzilla", target: "_blank", rel: "noopener" }, "github.com/gfhdhytghd/Gitzilla"), h("div.close-thx", null, "Built in 24 h at HackPSU · thank you"))),
            h("div.close-mark", null, mark.canvas)));
        end.classList.add("on");
      }, ctx.calm ? 200 : 700);
    }

    life.frame((t, dt) => {
      clock += dt;
      if (phase === "hit" && clock > 2.4) phase = "death";
      if (phase === "death" && clock > 3.6) explode();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, 960, 576);
      if (phase === "gone" && clock > 6) return;
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.imageSmoothingEnabled = false;
      const hp = Math.max(0, 0.18 - clock * 0.07);
      const b = stagedBoss(kit, 240, 150, t, { hp, pose: phase === "death" ? "death" : Math.floor(clock * 2.5) % 2 ? "stagger" : "idle", broken: [0, 1, 2] });
      b.pose.t = phase === "death" ? clock - 2.4 : clock % 0.4;
      b.pose.total = phase === "death" ? 1.2 : 0.4;
      R.drawBoss(g, b, t);
      if (phase === "hit" && Math.random() < 0.18) pops.push({ x: 200 + Math.random() * 80, y: 110 + Math.random() * 60, t: 0, n: 30 + ((Math.random() * 70) | 0) });
      g.font = '12px "Press Start 2P", monospace';
      g.textAlign = "center";
      for (const p of pops) {
        p.t += dt;
        const a = Math.max(0, 1 - p.t);
        g.fillStyle = `rgba(255,210,61,${a})`;
        g.fillText(`-${p.n}`, p.x, p.y - p.t * 40);
      }
    });
  },
};
