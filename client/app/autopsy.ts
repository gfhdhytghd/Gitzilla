// Autopsy: boss dissection as a git diff, per-player stats, MVP, shareable victory card (PNG), owner REMATCH.
import type { Autopsy, BossKit, PlayerKit } from "../../shared/types";
import { type AppCtx, type Screen, isOwner } from "./app";
import { createBackdrop } from "./backdrop";
import { createHallBoard } from "./hall";
import { markCanvas } from "./mark";
import { codeSpan, drawCode } from "./codefmt";
import { ARCH } from "./archetype";
import { reportCard } from "./report";
import { createFeedbackView, createClassFeedback, localDefaultRubric, createArchitectureReport, createClassReport, type LessonEngine } from "../edu";
import { bossPortraitCanvas, heroPortrait } from "./lobby";
import { fmtTime, fontsReady, h, isPhone, shortRepo } from "./util";

function brag(a: Autopsy, pid: string, bossRepo: string): string {
  const p = a.players.find((x) => x.id === pid);
  if (!p) return "";
  const boss = shortRepo(bossRepo);
  const me = `@${p.name} (${shortRepo(p.repo)})`;
  const s = p.stats;
  if (!a.victory) return `${me} dealt ${Math.round(s.damage)} damage before ${boss} won. git revert incoming.`;
  if (s.killingBlow) return `${me} tore the heart out of ${boss}${s.bestCombo >= 2 ? ` with a ${s.bestCombo}-player combo` : ""}.`;
  if (s.limbsBroken) return `${me} rm -rf'd ${s.limbsBroken} limb${s.limbsBroken > 1 ? "s" : ""} off ${boss}.`;
  if (s.revives) return `${me} restarted ${s.revives} fallen teammate${s.revives > 1 ? "s" : ""} while ${boss} burned.`;
  return `${me} helped delete ${boss} in ${fmtTime(a.duration)}.`;
}

/** 1200x630 share card rendered from pixel-art portraits. */
async function renderCard(a: Autopsy, pid: string, bossKit: BossKit | null, heroKit: PlayerKit | null): Promise<HTMLCanvasElement> {
  await fontsReady;
  const W = 1200, H = 630;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#05070a";
  g.fillRect(0, 0, W, H);
  // grid + scanlines
  g.fillStyle = "rgba(57,255,136,.06)";
  for (let x = 0; x < W; x += 24) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 24) g.fillRect(0, y, W, 1);
  const accent = a.victory ? "#39ff88" : "#ff3355";
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.strokeRect(12, 12, W - 24, H - 24);
  // boss (big, right) with a red X on victory
  if (bossKit) {
    const b = bossPortraitCanvas(bossKit, 160);
    g.drawImage(b, W - 520, 90, 480, 480);
    if (a.victory) {
      g.strokeStyle = "rgba(255,51,85,.9)";
      g.lineWidth = 18;
      g.beginPath();
      g.moveTo(W - 470, 140);
      g.lineTo(W - 90, 520);
      g.moveTo(W - 90, 140);
      g.lineTo(W - 470, 520);
      g.stroke();
    }
  }
  if (heroKit) {
    const p = heroPortrait(heroKit, 64);
    g.drawImage(p, 60, 230, 256, 256);
  }
  g.textBaseline = "top";
  g.fillStyle = accent;
  g.font = '28px "Press Start 2P", monospace';
  g.fillText(a.victory ? "BOSS DELETED" : "SQUAD WIPED", 56, 56);
  g.fillStyle = "#e8fff2";
  g.font = '40px "VT323", monospace';
  g.fillText(`GITZILLA · ${a.boss ? shortRepo(a.boss.repo) : "classroom brawl"} · ${fmtTime(a.duration)}`, 58, 110);
  g.fillStyle = "#ffd23d";
  const text = brag(a, pid, a.boss?.repo ?? "the class");
  const words = text.split(" ");
  let line = "", y = 160;
  g.font = '34px "VT323", monospace';
  for (const w of words) {
    if (g.measureText(line + w).width > 640) {
      g.fillText(line, 58, y);
      y += 34;
      line = "";
    }
    line += w + " ";
  }
  g.fillText(line, 58, y);
  const p = a.players.find((x) => x.id === pid);
  if (heroKit) drawCode(g, `⌐ ${heroKit.code?.weapon?.name ?? heroKit.weapon}`, 330, 400, 34, 560);
  if (p) {
    g.fillStyle = "#3de8ff";
    g.font = '32px "VT323", monospace';
    g.fillText(`dmg ${Math.round(p.stats.damage)}  combo x${p.stats.bestCombo}  limbs ${p.stats.limbsBroken}  revives ${p.stats.revives}`, 330, 500);
    if (a.mvp === pid) {
      g.fillStyle = "#ffd23d";
      g.font = '20px "Press Start 2P", monospace';
      g.fillText("★ MVP", 330, 440);
    }
  }
  // brand mark + wordmark in the corner
  g.drawImage(markCanvas(3), 52, H - 112);
  g.font = '22px "Press Start 2P", monospace';
  g.fillStyle = "#2fe39a";
  g.fillText("GIT", 196, H - 84);
  g.fillStyle = "#ff3e9a";
  g.fillText("ZILLA", 196 + g.measureText("GIT").width, H - 84);
  g.fillStyle = "rgba(255,255,255,.4)";
  g.font = '26px "VT323", monospace';
  g.fillText("$ play at HackPSU · your repo is a kaiju", 196, H - 52);
  g.fillStyle = "rgba(0,0,0,.18)";
  for (let yy = 0; yy < H; yy += 3) g.fillRect(0, yy, W, 1);
  return c;
}

type AutopsyBoss = NonNullable<Autopsy["boss"]>;

/**
 * Social impact ending — "Adopt an Organ": feature the most fragile organ (fragile flag, else fewest maintainers)
 * and point at real issues: the organ's own, else the repo's good-first issues, else the repo's issues page.
 * Always ends with a scannable QR (huge on the projector).
 */
function adoptOrgan(boss: AutopsyBoss, big: boolean): HTMLElement {
  const byMaint = (x: AutopsyBoss["limbs"][number]) => x.maintainers ?? 99;
  const fragile = boss.limbs.filter((l) => l.fragile).sort((a, b) => byMaint(a) - byMaint(b));
  const counted = boss.limbs.filter((l) => l.maintainers !== undefined).sort((a, b) => byMaint(a) - byMaint(b));
  const organ = fragile[0] ?? counted[0] ?? [...boss.limbs].sort((a, b) => b.damageTaken - a.damageTaken)[0] ?? null;
  const issues = organ?.issues?.length ? organ.issues : boss.repoIssues?.length ? boss.repoIssues : [];
  const issuesPage = `https://github.com/${boss.repo}/issues?q=is%3Aopen+label%3A%22good+first+issue%22`;
  const target = issues[0]?.url ?? issuesPage;
  const m = organ?.maintainers;
  const who = m === undefined ? (organ?.fragile ? "barely anyone maintains this" : "it could use more hands") : m <= 0 ? "nobody maintains this right now" : m === 1 ? "only 1 person maintains this" : `only ${m} people maintain this`;
  const qr = h("img.adopt-qr", { src: `/api/qr?text=${encodeURIComponent(target)}`, alt: "scan to adopt", width: big ? 320 : 150, height: big ? 320 : 150 });
  return h(
    `section.panel.ap-adopt${big ? ".big" : ""}`,
    { "data-testid": "adopt-organ" },
    h("h2.panel-title", null, "♥ ADOPT AN ORGAN"),
    h(
      "div.adopt-row",
      null,
      h(
        "div.adopt-text",
        null,
        organ ? h("div.adopt-organ", null, h("code", null, organ.component), organ.fragile ? h("span.adopt-tag", null, " fragile") : null) : null,
        h("div.adopt-who", null, `${who}.`),
        h("div.adopt-sub", null, `you just fought ${shortRepo(boss.repo)}. now help keep it alive — it's real open source.`),
        issues.length
          ? h("ul.adopt-issues", null, ...issues.slice(0, big ? 3 : 4).map((i) => h("li", null, h("a", { href: i.url, target: "_blank", rel: "noopener" }, `#${i.number} ${i.title}`), i.labels?.length ? h("small", null, ` ${i.labels.slice(0, 2).join(" · ")}`) : null)))
          : h("div.adopt-sub", null, h("a", { href: issuesPage, target: "_blank", rel: "noopener" }, `open ${boss.repo} good-first issues ↗`)),
        boss.busFactor !== undefined ? h("div.adopt-sub.dim", null, `bus factor: ${boss.busFactor} — that many people leaving would stall the project`) : null,
      ),
      h("div.adopt-scan", null, qr, h("div", null, "scan to adopt it")),
    ),
  );
}

/** [ new room ] [ leave ] next to REMATCH (projector: end class / new room). */
function exitButtons(app: AppCtx): HTMLElement {
  const screen = app.role === "screen";
  return h(
    "div.ap-exit",
    null,
    h("button.btn", { "data-testid": "autopsy-new-room", onclick: () => app.leave({ newRoom: true }) }, "[ new room ]"),
    h("button.btn.btn-ghost", { "data-testid": "autopsy-leave", onclick: () => app.leave() }, screen ? "[ end class ]" : "[ leave ]"),
  );
}

export function createAutopsy(app: AppCtx): Screen {
  const a0 = app.autopsy!;
  if (a0.mode === "pvp") return createDuelAutopsy(app);
  if (!a0.boss) return createPvpAutopsy(app);
  const a = { ...a0, boss: a0.boss };
  const lobby = app.lobby;
  const bossKit = lobby?.boss.kit ?? null;
  const kitOf = (id: string) => lobby?.players.find((p) => p.id === id)?.kit ?? null;
  const backdrop = createBackdrop({ dim: 0.82 });
  if (bossKit) backdrop.setTheme(bossKit.theme);

  const maxDmg = Math.max(1, ...a.boss.limbs.map((l) => l.damageTaken));
  const codeOf = (component: string): string[] => {
    const id = bossKit?.limbs.find((l) => l.component === component)?.id;
    return (id && bossKit?.code?.limbSymbols?.[id]) || [];
  };
  const diff = h(
    "div.diff",
    null,
    h("div.diff-head", null, `diff --git a/${a.boss.repo} b/${a.boss.repo}`),
    h("div.diff-head.dim", null, `--- a/${a.boss.repo}  (before raid)`),
    h("div.diff-head.dim", null, `+++ b/${a.boss.repo}  (after raid)`),
    h("div.diff-hunk", null, `@@ -1,${a.boss.limbs.length} +1,${a.boss.limbs.filter((l) => !l.broken).length} @@ heart: ${a.boss.heart}`),
    ...[...a.boss.limbs]
      .sort((x, y) => y.damageTaken - x.damageTaken)
      .flatMap((l, i) => [
        h(
          `div.diff-line.${l.broken ? "del" : "keep"}`,
          { style: `animation-delay:${0.1 + i * 0.06}s` },
          h("span.sign", null, l.broken ? "-" : " "),
          h("span.comp", null, l.component),
          h("span.dmgbar", null, h("i", { style: `width:${((l.damageTaken / maxDmg) * 100).toFixed(0)}%` })),
          h("span.dmg", null, `${Math.round(l.damageTaken)} dmg`),
          h("span.mark", null, l.broken ? "✗ broken" : "✓ survived"),
          h("span.mark-short", null, l.broken ? "✗" : "✓"),
        ),
        // the real code that lived in this limb: deleted lines for broken limbs, context for survivors
        ...codeOf(l.component).slice(0, l.broken ? 3 : 1).map((line) =>
          h(`div.diff-code.${l.broken ? "del" : "ctx"}`, { style: `animation-delay:${0.15 + i * 0.06}s` }, h("span.sign", null, l.broken ? "-" : " "), h("code", null, line)),
        ),
      ]),
    ...(a.victory && bossKit?.code?.heartLines?.length
      ? [
          h("div.diff-hunk", null, `@@ ${a.boss.heart} @@ heart removed`),
          ...bossKit.code.heartLines.slice(0, 4).map((line) => h("div.diff-code.del", null, h("span.sign", null, "-"), h("code", null, line))),
        ]
      : []),
  );

  const ranked = [...a.players].sort((x, y) => y.stats.damage - x.stats.damage);
  const rows = ranked.map((p, i) => {
    const kit = kitOf(p.id);
    return h(
      `div.ap-row${p.id === app.you ? ".you" : ""}${p.id === a.mvp ? ".mvp" : ""}`,
      { style: `animation-delay:${0.2 + i * 0.06}s` },
      h("span.rank", null, `#${i + 1}`),
      kit ? h("span.ap-port", null, heroPortrait(kit, 32)) : h("span.ap-port"),
      h("span.ap-name", null, p.name, h("small", null, ` ${shortRepo(p.repo)} `), kit?.code?.weapon?.name ? codeSpan(kit.code.weapon.name) : null),
      h("span.ap-dmg", null, String(Math.round(p.stats.damage))),
      h("span.ap-combo", null, `x${p.stats.bestCombo}`),
      h("span.ap-limbs", null, String(p.stats.limbsBroken)),
      h("span.ap-rev", null, String(p.stats.revives)),
      h("span.ap-kb", null, p.stats.killingBlow ? "☠ yes" : ""),
    );
  });

  const mvp = a.players.find((p) => p.id === a.mvp);
  const mvpKit = mvp ? kitOf(mvp.id) : null;
  const meId = a.players.some((p) => p.id === app.you) ? app.you! : a.mvp ?? a.players[0]?.id;

  const cardImg = h("div.card-preview");
  let cardCanvas: HTMLCanvasElement | null = null;
  if (meId)
    renderCard(a, meId, bossKit, kitOf(meId)).then((c) => {
      cardCanvas = c;
      c.className = "share-card";
      cardImg.replaceChildren(c);
    });
  const share = async () => {
    if (!cardCanvas) return;
    try {
      const blob: Blob | null = await new Promise((r) => cardCanvas!.toBlob(r, "image/png"));
      const file = blob && new File([blob], `gitzilla-${a.boss ? shortRepo(a.boss.repo) : "class"}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (file && nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "GITZILLA", text: brag(a, meId ?? "", a.boss?.repo ?? "") });
        return;
      }
    } catch {
      /* cancelled or unsupported: fall back to a download */
    }
    download();
  };
  const download = () => {
    if (!cardCanvas) return;
    const link = document.createElement("a");
    link.download = `gitzilla-${shortRepo(a.boss.repo)}-${a.victory ? "victory" : "defeat"}.png`;
    link.href = cardCanvas.toDataURL("image/png");
    link.click();
  };

  const owner = isOwner(app);
  const el = h(
    "div.screen.autopsy",
    { "data-testid": "autopsy" },
    backdrop.canvas,
    h("div.crt"),
    h(
      "div.ap-scroll",
      null,
      h(
        "header.ap-head",
        null,
        h("div.ap-verdict" + (a.victory ? ".win" : ".loss"), null, a.victory ? "VICTORY" : "DEFEAT"),
        h("div.ap-sub", null, `$ autopsy --boss ${a.boss.repo} · ${fmtTime(a.duration)} · exit ${a.victory ? "0 (boss deleted)" : "1 (squad wiped)"}`),
        h("div.ap-top-actions", null,
          owner ? h("button.btn.btn-big.btn-start", { "data-testid": "rematch", onclick: () => app.conn.send({ t: "rematch" }) }, "$ git reset --hard && REMATCH") : h("div.dim", null, "waiting for the owner to rematch…"),
          exitButtons(app),
        ),
      ),
      ...(app.role === "screen" ? [adoptOrgan(a.boss, true)] : []),
      h(
        "div.ap-grid",
        null,
        ...(app.role === "screen" ? [] : [adoptOrgan(a.boss, false)]),
        h(
          "section.panel.ap-boss",
          null,
          h("h2.panel-title.red", null, "BOSS DISSECTION", bossKit?.archetype && ARCH[bossKit.archetype] ? h("span.ap-arch", null, ` · ${ARCH[bossKit.archetype].icon} ${ARCH[bossKit.archetype].label} — ${a.victory ? ARCH[bossKit.archetype].death : "still standing"}`) : null),
          h("div.ap-boss-row", null, bossKit ? h("div.ap-boss-port" + (a.victory ? ".dead" : ""), null, bossPortraitCanvas(bossKit, 128)) : null, diff),
        ),
        h(
          "section.panel.ap-players",
          null,
          h("h2.panel-title", null, "SQUAD STATS"),
          h("div.ap-row.ap-header", null, h("span.rank", null, ""), h("span.ap-port"), h("span.ap-name", null, "dev"), h("span.ap-dmg", null, "damage"), h("span.ap-combo", null, "best combo"), h("span.ap-limbs", null, "limbs broken"), h("span.ap-rev", null, "revives"), h("span.ap-kb", null, "final blow")),
          ...rows,
          mvp
            ? h(
                "div.mvp-card",
                null,
                mvpKit ? h("div.mvp-port", null, heroPortrait(mvpKit, 64)) : null,
                h("div", null, h("div.mvp-label", null, "★ MVP"), h("div.mvp-name", null, mvp.name), h("div.mvp-brag", null, brag(a, mvp.id, a.boss.repo))),
              )
            : null,
        ),
        // claude-edu: the boss repo in plain words, "your repo vs the boss", where the project needs help
        ...(() => {
          const g = app.lobby?.boss.genesis;
          if (!g) return [];
          try {
            const heroes = (app.lobby?.players ?? []).filter((p) => p.genesis && !p.bot).slice(0, 4).map((p) => ({ label: p.name, genesis: p.genesis!, you: p.id === app.you }));
            return [h("section.panel.ap-arch", null, createArchitectureReport({ genesis: g, kit: bossKit, autopsy: a, heroes, variant: app.role === "screen" ? "screen" : isPhone() ? "phone" : "desktop" }))];
          } catch (e) {
            console.warn("[kaiju] architecture report failed", e);
            return [];
          }
        })(),
        (() => {
          const hb = createHallBoard(app.mock, { rows: 5, highlight: a.players.map((p) => p.name) });
          hb.classList.add("ap-hall");
          return hb;
        })(),
        h(
          "section.panel.ap-share",
          null,
          h("h2.panel-title", null, "BRAGGING RIGHTS"),
          cardImg,
          h("div.ap-actions", null,
            h("button.btn.btn-primary", { onclick: share }, "share ↗"),
            h("button.btn", { onclick: download }, "⤓ save card.png"),

          ),
        ),
      ),
    ),
  );
  return {
    el,
    destroy() {
      backdrop.destroy();
      el.remove();
    },
  };
}

/** Edu (classroom PvP) autopsy: class ranking + each student's report card with tips. */
function createPvpAutopsy(app: AppCtx): Screen {
  const a = app.autopsy!;
  const kitOf = (id: string) => app.lobby?.players.find((p) => p.id === id)?.kit ?? null;
  const ranking = a.ranking ?? a.players.map((p) => ({ id: p.id, name: p.name, repo: p.repo, kos: 0, damage: p.stats.damage, roundWins: 0, quality: kitOf(p.id)?.quality ?? [] }));
  const backdrop = createBackdrop({ dim: 0.85 });
  backdrop.setTheme("notebook");
  const me = ranking.find((r) => r.id === app.you);
  const winner = ranking[0];
  const cards = ranking.map((r) =>
    h("div.rp-card", null, h("div.rp-who", null, `${r.name} `, h("small.dim", null, r.repo)), reportCard(r.quality, { tips: r.id === app.you || app.role === "screen" })),
  );
  const owner = isOwner(app);
  const feedbackHost = h("section.panel.ap-feedback", { "data-testid": "autopsy-feedback" });
  let feedbackSig = "";
  const renderFeedback = () => {
    const items = app.feedback ?? [];
    const rubric = app.lobby?.rubric ?? localDefaultRubric();
    const sig = JSON.stringify([items, rubric, app.token, isOwner(app), app.role]);
    if (sig === feedbackSig) return;
    feedbackSig = sig;
    const variant = app.role === "screen" ? "screen" as const : isPhone() ? "phone" as const : "desktop" as const;
    const mine = items.find(f => f.playerId === app.you);
    const opts = { items, rubric, variant, room: app.mock ? undefined : app.room, token: app.token, canExport: isOwner(app) };
    feedbackHost.replaceChildren(items.length && (isOwner(app) || app.role === "screen")
      ? createClassFeedback(opts)
      : mine ? createFeedbackView(mine, rubric, { variant, you: true })
      : h("div.dim", { role: "status" }, "waiting for your teacher's feedback…"));
  };
  renderFeedback();
  const el = h(
    "div.screen.autopsy.edu",
    { "data-testid": "autopsy" },
    backdrop.canvas,
    h("div.crt"),
    h(
      "div.ap-scroll",
      null,
      h(
        "header.ap-head",
        null,
        h("div.ap-verdict.win", null, "CLASS RESULTS"),
        h("div.ap-sub", null, `$ make grade · ${fmtTime(a.duration)} · winner: ${winner ? winner.name : "—"}${me ? ` · you: #${ranking.indexOf(me) + 1}` : ""}`),
        h("div.ap-top-actions", null,
          owner ? h("button.btn.btn-big.btn-start", { "data-testid": "rematch", onclick: () => app.conn.send({ t: "rematch" }) }, "$ make rematch") : h("div.dim", null, "waiting for the teacher to start the next round…"),
          exitButtons(app),
        ),
      ),
      h(
        "div.ap-grid",
        null,
        feedbackHost,
        // claude-edu's class report: highlights, improvement tips, quiz results, glossary (+ every report card)
        (() => {
          try {
            const students = (app.lobby?.players ?? []).filter((p) => p.kit).map((p) => ({ id: p.id, name: p.name, repo: p.repo ?? "", quality: p.kit!.quality }));
            return h("section.panel.ap-class", null, createClassReport({ autopsy: a, students, engine: (app.eduEngine as LessonEngine | undefined) ?? null, you: app.you, variant: app.role === "screen" ? "screen" : isPhone() ? "phone" : "desktop" }));
          } catch (e) {
            console.warn("[kaiju] class report failed", e);
            return h("section.panel.ap-class", null, ...cards);
          }
        })(),
      ),
    ),
  );
  return {
    el,
    update: renderFeedback,
    destroy() {
      backdrop.destroy();
      el.remove();
    },
  };
}

function createDuelAutopsy(app: AppCtx): Screen {
  const a = app.autopsy!, ranking = a.ranking ?? [];
  const backdrop = createBackdrop({ dim: 0.85 });
  const el = h("div.screen.autopsy", { "data-testid": "autopsy" }, backdrop.canvas,
    h("div.ap-scroll", null, h("header.ap-head", null,
      h("div.ap-verdict.win", null, "PVP RESULTS"),
      h("div.ap-sub", null, a.mvp ? `Winner: ${ranking.find(p => p.id === a.mvp)?.name ?? "Player"}` : "Draw"),
      h("p", null, "Round wins, then KOs, then damage decide the ranking."),
      ...ranking.map((p, i) => h("div.rp-card", null, `#${i + 1} ${p.name} · ${p.repo} · ${p.roundWins} round wins · ${p.kos} KOs · ${p.damage.toFixed(1)} damage`)),
      isOwner(app) ? h("button.btn.btn-big.btn-start", { "data-testid": "rematch", onclick: () => app.conn.send({ t: "rematch" }) }, "Rematch") : h("p", null, "Waiting for the host to start a rematch"),
      exitButtons(app))));
  return { el, update() {}, destroy() { backdrop.destroy(); el.remove(); } };
}
