// 3 · Repo → kaiju, as explicit wiring: animated connectors from real analysis facts (data/fallback) to the monster's
// parts, placed with the sim's own hit-region geometry. R cycles three public repos.
//   top components → limbs (real names) · most-imported file → heart · import cycles → red weak points
//   language → hero class + code weapon · stars/contributors/LOC → PvP POWER · commits/TODOs → taunts ("recent sins")
import { h } from "../../app/util.ts";
import { R } from "../../app/renderers.ts";
import { bossMouth } from "../../../sim/index.ts";
import type { Scene } from "../core.ts";
import { FEATURED, basename, bossKit, compact, heroKit, power, profile } from "../data.ts";
import { stagedBoss } from "../sims.ts";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
// monster viewport on the stage (px)
const VIEW = { x: 470, y: 196, w: 980, h: 620 };

export const mapping: Scene = {
  id: "mapping", title: "Repo → kaiju", tracks: ["gemini"],
  mount(el, life, ctx) {
    const canvas = h("canvas.map-boss", { width: VIEW.w, height: VIEW.h, style: `left:${VIEW.x}px;top:${VIEW.y}px;width:${VIEW.w}px;height:${VIEW.h}px` }) as HTMLCanvasElement;
    const g = canvas.getContext("2d")!;
    const wires = svg("svg", { class: "map-wires", viewBox: "0 0 1920 1080", width: 1920, height: 1080 }) as SVGSVGElement;
    const head = h("div.map-head"), left = h("div.map-left"), right = h("div.map-right"), tags = h("div.map-tags"), foot = h("div.map-foot");
    el.append(canvas, wires, tags, head, left, right, foot);

    let boss = stagedBoss(bossKit(FEATURED[0]), 240, 150, 0), view = { x: 0, y: 0, k: 1 }, born = 0;
    const toStage = (x: number, y: number) => ({ x: VIEW.x + (x - view.x) * view.k, y: VIEW.y + (y - view.y) * view.k });

    function wire(from: { x: number; y: number }, to: { x: number; y: number }, color: string, delay: number, bend = 0.45) {
      const dx = (to.x - from.x) * bend;
      const d = `M${from.x},${from.y} C${from.x + dx},${from.y} ${to.x - dx},${to.y} ${to.x},${to.y}`;
      const path = svg("path", { d, class: "wire", stroke: color, style: `--d:${delay}ms` });
      const dot = svg("circle", { r: 6, fill: color, class: "wire-dot", style: `--d:${delay}ms` });
      const motion = svg("animateMotion", { dur: `${1.6 + Math.random()}s`, repeatCount: "indefinite", path: d, begin: `${delay / 1000 + 0.6}s` });
      dot.append(motion);
      const end = svg("circle", { cx: to.x, cy: to.y, r: 9, class: "wire-end", stroke: color, style: `--d:${delay}ms` });
      wires.append(path, dot, end);
    }
    const anchor = (box: HTMLElement, side: "r" | "l" | "b") => {
      let x = 0, y = 0;
      for (let n: HTMLElement | null = box; n && n !== el; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop; }
      const r = { x, y, w: box.offsetWidth, h: box.offsetHeight };
      return side === "r" ? { x: r.x + r.w + 6, y: r.y + r.h / 2 } : side === "l" ? { x: r.x - 6, y: r.y + r.h / 2 } : { x: r.x + r.w / 2, y: r.y + r.h + 6 };
    };

    function show(i: number) {
      const slug = FEATURED[i], p = profile(slug), kit = bossKit(slug), hero = heroKit(slug), pw = power(slug);
      boss = stagedBoss(kit, 240, 150, 0);
      // frame the monster: bounds of its hit regions, padded, fitted to the viewport aspect
      const xs = boss.regions.map((r) => r.x), ys = boss.regions.map((r) => r.y);
      const bw = Math.max(...xs) - Math.min(...xs) + 96, bh = Math.max(...ys) - Math.min(...ys) + 84;
      const k = Math.min(VIEW.w / bw, VIEW.h / bh);
      view = { k, x: (Math.min(...xs) + Math.max(...xs)) / 2 - VIEW.w / k / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 - VIEW.h / k / 2 + 6 };
      born = performance.now();
      const cyc = new Set(p.cycles.flat());
      const langs = Object.entries(p.languages).sort((a, b) => b[1] - a[1]);
      const total = langs.reduce((s, [, v]) => s + v, 0) || 1;

      head.replaceChildren(
        h("a.repo-link.big", { href: `https://github.com/${slug}`, target: "_blank", rel: "noopener" }, `github.com/${slug}`),
        h("span.map-arrow", null, "⟶"),
        h("span.map-name", null, kit.name),
        kit.design?.epithet ? h("span.map-epithet", null, kit.design.epithet) : "",
      );
      const limbs = kit.limbs.slice(0, 6);
      const compRows = limbs.map((l) => h("div.fact-row" + (cyc.has(l.component) ? ".cyc" : ""), null, h("code", null, l.component), h("span", null, `${compact(p.components.find((c) => c.name === l.component)?.loc ?? 0)} LOC`)));
      const heartCard = h("div.fact.heart", null, h("h4", null, "most-imported file"), h("code", null, p.heart), h("span.fact-sub", null, `imported by ${p.heartFanIn} files`));
      const cycleCard = h("div.fact.cycles" + (p.cycles.length ? ".hot" : ""), null, h("h4", null, "import cycles (Tarjan SCC)"),
        p.cycles.length ? h("div", null, ...p.cycles.slice(0, 2).map((c) => h("code.cyc-line", null, c.map(basename).join(" ↔ ")))) : h("span.fact-sub", null, "none · no weak point to aim for"));
      left.replaceChildren(h("div.fact.comps", null, h("h4", null, "top components"), ...compRows), heartCard, cycleCard);

      const port = R.playerPortrait(hero, 144);
      port.classList.add("map-hero");
      const langRow = h("div.fact.src", null, h("h4", null, "language"), h("span", null, langs.slice(0, 3).map(([l, v]) => `${l} ${Math.round((v / total) * 100)}%`).join(" · ")));
      const heroCard = h("div.out.hero", null, port, h("div", null, h("b", null, hero.title), h("span.out-sub", null, `${hero.weapon} · `, h("code", null, hero.code?.weapon?.name ?? hero.weapon))));
      const powRow = h("div.fact.src", null, h("h4", null, "social + size"), h("span", null, `★ ${compact(p.stars)} · ${compact(p.contributors)} contributors · ${compact(p.totalLoc)} LOC`));
      const powCard = h("div.out.power", null, h("b", null, "PvP POWER"), h("div.pow-bar", null, h("i", { style: `--w:${pw.score}%` })), h("span.pow-n", null, String(Math.round(pw.score))));
      const sins = [...(p.dna?.todos ?? []).slice(0, 1).map((t) => `${t.text}`), ...(p.dna?.commits ?? []).slice(0, 1)];
      const sinRow = h("div.fact.src", null, h("h4", null, "recent sins"), h("span", null, `${compact(p.commits)} commits · ${p.dna?.counts.todo ?? 0} TODOs`), ...sins.map((s) => h("code.sin", null, s.slice(0, 54))));
      const taunt = kit.design?.taunts[0] ?? `TODO: ${p.dna?.todos[0]?.text ?? "refactor later"}`;
      const tauntCard = h("div.out.out-taunt", null, h("b", null, "taunt"), h("span", null, `“${taunt.slice(0, 70)}”`));
      right.replaceChildren(langRow, heroCard, powRow, powCard, sinRow, tauntCard);
      foot.replaceChildren(h("span.key", null, "R"), ` next repo  ·  ${i + 1} / ${FEATURED.length}  ·  real analysis from data/fallback, Gemini art direction from data/design`);

      // limb + heart tags at the sim's region positions, then the wires
      wires.replaceChildren();
      tags.replaceChildren();
      const center = toStage(boss.x, boss.y);
      limbs.forEach((l, n) => {
        const r = boss.regions.find((x) => x.id === l.id);
        if (!r) return;
        const name = kit.design?.limbNames?.[l.id] ?? basename(l.component);
        // left of center the tag hangs left, unless it would run under the fact column
        const at = toStage(r.x, r.y), out = at.x < center.x && at.x - 40 - name.length * 11 > VIEW.x ? -1 : 1;
        const hot = cyc.has(l.component);
        tags.append(h("div.limb-tag" + (hot ? ".hot" : "") + (out < 0 ? ".l" : ".r"), { style: `left:${at.x}px;top:${at.y}px;--d:${500 + n * 260}ms` }, name));
        if (hot) tags.append(h("div.weak", { style: `left:${at.x}px;top:${at.y}px` }));
        requestAnimationFrame(() => life.alive && wire(anchor(compRows[n], "r"), at, hot ? "#ff3355" : "#3dff8b", 400 + n * 260));
      });
      const heartR = boss.regions.find((r) => r.id === "heart")!, hs = toStage(heartR.x, heartR.y);
      tags.append(h("div.heart-tag", { style: `left:${hs.x}px;top:${hs.y}px` }, "♥"));
      const mouth = bossMouth(boss), ms = toStage(mouth.x, mouth.y);
      requestAnimationFrame(() => {
        if (!life.alive) return;
        wire(anchor(heartCard, "r"), hs, "#ff3d8b", 400 + limbs.length * 260);
        if (p.cycles.length) for (const l of limbs.filter((x) => cyc.has(x.component)).slice(0, 3)) {
          const r = boss.regions.find((x) => x.id === l.id);
          if (r) wire(anchor(cycleCard, "r"), toStage(r.x, r.y), "#ff3355", 700 + limbs.length * 260);
        }
        wire(anchor(langRow, "b"), anchor(heroCard, "b"), "#3de8ff", 2300, 0);
        wire(anchor(tauntCard, "l"), ms, "#ffd23d", 2800);
      });
      if (n0++ > 0) ctx.shake(0.5);
    }
    let n0 = 0;
    life.frame((t) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, VIEW.w, VIEW.h);
      g.setTransform(view.k, 0, 0, view.k, -view.x * view.k, -view.y * view.k);
      g.imageSmoothingEnabled = false;
      // a slow breathing idle; the boss "roars" briefly whenever a new repo lands
      const age = (performance.now() - born) / 1000;
      boss.pose = { name: age < 1.2 ? "roar" : "idle", t: age < 1.2 ? age : t % 2, total: age < 1.2 ? 1.2 : 2, dir: [-1, 0] };
      R.drawBoss(g, boss, t);
    });
    ctx.onRepo((i) => show(i), life);
    show(ctx.repo);
  },
};
