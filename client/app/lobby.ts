// Lobby: your hero setup, squad cards that "spin up" as repos are analyzed, the boss panel
// (owner sets the boss repo; silhouette -> reveal), START. Big-screen mode (?screen=1) shows a huge QR.
import type { BossKit, LobbyPlayer, LobbyState, PlayerKit } from "../../shared/types";
import { type AppCtx, type Screen, isOwner, joinUrl, toast } from "./app";
import { createBackdrop } from "./backdrop";
import { createGithubPicker } from "./github";
import { createLogo } from "./logo";
import { MOCK_REPOS } from "./mock";
import { R, X } from "./renderers";
import { audio } from "./sound";
import { asciiBar, esc, h, hash32, normalizeRepo, shortRepo } from "./util";

const WEAPON_ICON: Record<string, string> = { blaster: "⌐╦", smg: "≡╤", shotgun: "═╦═", cannon: "▄█▀", staff: "─o", laser: "═══►", blade: "─┼══" };
const SKILL_DESC: Record<string, string> = {
  firewall: "shield bubble for you + nearby allies",
  fork: "spawn a decoy clone that pulls aggro",
  hotfix: "heal pulse for nearby allies",
  overclock: "fire-rate + speed burst",
  rollback: "blink back 2s in time, cleanse bullets",
};
const CLONE_STEPS = ["Cloning into '%s'...", "Receiving objects", "Resolving deltas", "Parsing imports", "Building dependency graph", "Finding the heart", "Detecting cycles", "Forging hero"];
const BOSS_STEPS = ["git clone --depth 1 %s", "Receiving objects", "Mapping components", "Growing tentacles", "Tying knots (cycles)", "Opening eyes", "Waking the kaiju"];

let fallbackCache: Promise<string[]> | null = null;
function fallbacks(mock: boolean): Promise<string[]> {
  if (mock) return Promise.resolve(MOCK_REPOS);
  return (fallbackCache ??= fetch("/api/fallbacks")
    .then((r) => (r.ok ? r.json() : []))
    .then((j: unknown) => (Array.isArray(j) ? (j as string[]) : (j as { repos?: string[] })?.repos ?? []))
    .catch(() => []));
}

/** Signature of the (optional, possibly late-arriving) Gemini design so cards can animate the swap. */
export const dsig = (k: { design?: unknown } | null | undefined) => (k?.design ? hash32(JSON.stringify(k.design)) : 0);

const portraitCache = new Map<string, HTMLCanvasElement>();
export function heroPortrait(kit: PlayerKit, size: number): HTMLCanvasElement {
  const key = `${kit.repo}|${kit.seed}|${size}|${dsig(kit)}`;
  let c = portraitCache.get(key);
  if (!c) {
    try {
      c = R.playerPortrait(kit, size);
    } catch {
      c = document.createElement("canvas");
    }
    portraitCache.set(key, c);
  }
  const copy = document.createElement("canvas");
  copy.width = c.width;
  copy.height = c.height;
  copy.getContext("2d")!.drawImage(c, 0, 0);
  copy.className = "portrait";
  animated.add({ c: copy, kit, size });
  return copy;
}

/** Portraits that breathe/blink (renderer frames); ticked by animatePortraits(). */
const animated = new Set<{ c: HTMLCanvasElement; kit: PlayerKit; size: number; f?: number }>();
export function animatePortraits(time: number) {
  for (const a of animated) {
    if (!a.c.isConnected) {
      if (a.f !== undefined) animated.delete(a); // was shown once, now gone
      continue;
    }
    const f = X.playerPortraitFrame(time, a.kit.seed);
    if (f === a.f) continue;
    a.f = f;
    try {
      const src = X.playerPortraitAt(a.kit, a.size, f);
      const g = a.c.getContext("2d")!;
      g.clearRect(0, 0, a.c.width, a.c.height);
      g.drawImage(src, 0, 0);
    } catch {
      animated.delete(a);
    }
  }
}

export function bossPortraitCanvas(kit: BossKit, size: number, silhouette = false): HTMLCanvasElement {
  let src: HTMLCanvasElement;
  try {
    src = R.bossPortrait(kit, size);
  } catch {
    src = document.createElement("canvas");
    src.width = src.height = size;
  }
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  if (silhouette) {
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#0a0410";
    g.fillRect(0, 0, c.width, c.height);
  }
  c.className = "portrait";
  return c;
}

function noiseCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.className = "portrait noise";
  return c;
}
function paintNoise(c: HTMLCanvasElement, t: number, hue: string) {
  const g = c.getContext("2d")!;
  const s = c.width;
  g.fillStyle = "#05070a";
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < s * 1.2; i++) {
    g.fillStyle = Math.random() < 0.5 ? hue : "#1b2a22";
    g.fillRect(Math.floor(Math.random() * s), Math.floor(Math.random() * s), 1, 1);
  }
  // spinning-up silhouette: a chibi blob outline that fills from the bottom
  const fill = (t * 0.35) % 1;
  g.fillStyle = hue;
  const cx = s / 2;
  for (let y = 0; y < s; y++) {
    const head = y > s * 0.18 && y < s * 0.55 ? Math.sqrt(Math.max(0, 1 - ((y - s * 0.36) / (s * 0.19)) ** 2)) * s * 0.22 : 0;
    const body = y >= s * 0.55 && y < s * 0.84 ? s * 0.15 : 0;
    const w = Math.max(head, body);
    if (!w) continue;
    if (s - y < fill * s) g.fillRect(Math.round(cx - w), y, Math.round(w * 2), 1);
    else {
      g.fillRect(Math.round(cx - w), y, 1, 1);
      g.fillRect(Math.round(cx + w), y, 1, 1);
    }
  }
  g.fillStyle = "rgba(255,255,255,.35)";
  g.fillRect(0, Math.floor((t * 24) % s), s, 1);
}

function hearts(kit: PlayerKit): string {
  return "♥".repeat(Math.min(9, kit.maxHp)) + " " + "◆".repeat(Math.min(9, kit.maxArmor));
}

function statusMarker(testid: string, status: string, text: string) {
  return h(`span.status-chip.st-${status}`, { "data-testid": testid, "data-status": status }, text);
}

export function createLobby(app: AppCtx): Screen {
  const screen = app.role === "screen";
  const backdrop = createBackdrop({ dim: screen ? 0.55 : 0.78, boss: null });
  const analyzingSince = new Map<string, number>();
  const cardSig = new Map<string, string>();
  const cardEls = new Map<string, HTMLElement>();
  const noiseEls = new Set<{ c: HTMLCanvasElement; hue: string }>();
  let bossSig = "";
  let bossRevealAt = 0;

  // ----- your panel -----
  const repoInput = h("input.term-input", {
    "data-testid": "player-repo-input", placeholder: "owner/repo or github URL", autocomplete: "off", spellcheck: "false", autocapitalize: "off", "aria-label": "your repo",
  }) as HTMLInputElement;
  const submitRepo = () => {
    const r = normalizeRepo(repoInput.value);
    if (!r.includes("/")) {
      toast("repo must look like owner/name", "err");
      return repoInput.focus();
    }
    repoInput.value = r;
    app.conn.send({ t: "setRepo", repo: r });
    audio.onUi();
    repoInput.blur();
  };
  repoInput.addEventListener("keydown", (e) => e.key === "Enter" && submitRepo());
  const youChips = h("div.chips");
  const youStatus = h("div.you-status");
  const youCard = h("div.you-card");
  const nameEl = h("span.you-name");
  const renameBtn = h("button.btn.btn-tiny", {
    onclick: () => {
      const n = prompt("$ whoami", app.name)?.trim();
      if (n) app.rename(n.replace(/\s+/g, "_").slice(0, 16));
    },
  }, "edit");

  const youPanel = h(
    "section.panel.you-panel",
    null,
    h("h2.panel-title", null, "$ whoami ", nameEl, " ", renameBtn),
    h("label.term-line", null, h("span.prompt", null, "$ git clone "), repoInput),
    h("button.btn.btn-primary", { "data-testid": "player-repo-submit", onclick: submitRepo }, "▶ summon hero"),
    youChips,
    createGithubPicker((full) => {
      repoInput.value = full;
      submitRepo();
    }),
    youStatus,
    youCard,
  );

  // ----- boss panel -----
  const bossInput = h("input.term-input", {
    "data-testid": "boss-repo-input", placeholder: "rival/repo", autocomplete: "off", spellcheck: "false", autocapitalize: "off", "aria-label": "boss repo",
  }) as HTMLInputElement;
  const submitBoss = () => {
    const r = normalizeRepo(bossInput.value);
    if (!r.includes("/")) {
      toast("boss repo must look like owner/name", "err");
      return bossInput.focus();
    }
    bossInput.value = r;
    app.conn.send({ t: "setBoss", repo: r });
    audio.onUi();
    bossInput.blur();
  };
  bossInput.addEventListener("keydown", (e) => e.key === "Enter" && submitBoss());
  const bossChips = h("div.chips");
  const bossOwnerCtl = h(
    "div.boss-owner",
    null,
    h("label.term-line", null, h("span.prompt.red", null, "$ summon-boss "), bossInput),
    h("button.btn.btn-danger", { "data-testid": "boss-repo-submit", onclick: submitBoss }, "☠ summon boss"),
    bossChips,
  );
  const bossStage = h("div.boss-stage");
  const bossInfo = h("div.boss-info");
  const bossStatus = h("div.boss-status");
  const startBtn = h("button.btn.btn-big.btn-start", { "data-testid": "start-match", onclick: () => (audio.onUi(), app.conn.send({ t: "start" })) }, "$ ./fight.sh") as HTMLButtonElement;
  const startHint = h("div.start-hint");
  const bossPanel = h(
    "section.panel.boss-panel",
    null,
    h("h2.panel-title.red", null, "BOSS KAIJU"),
    bossStage,
    bossStatus,
    bossInfo,
    bossOwnerCtl,
    startBtn,
    startHint,
  );

  // ----- squad -----
  const squadList = h("div.squad-list");
  const squadCount = h("span.count");
  const botCount = h("span.bot-n", null, "0");
  const setBots = (d: number) => {
    const cur = app.lobby?.players.filter((p) => p.bot).length ?? 0;
    const humans = (app.lobby?.players.length ?? 0) - cur;
    const n = Math.max(0, Math.min(7, Math.min(8 - humans, cur + d)));
    if (n !== cur) app.conn.send({ t: "setBots", count: n });
  };
  const botCtl = h(
    "div.bot-ctl",
    null,
    h("span.dim", null, "AI teammates: "),
    h("button.btn.btn-tiny", { "data-testid": "bots-minus", onclick: () => setBots(-1) }, "-"),
    botCount,
    h("button.btn.btn-tiny", { "data-testid": "bots-plus", onclick: () => setBots(1) }, "+"),
  );
  const squad = h("section.panel.squad-panel", null, h("h2.panel-title", null, "SQUAD ", squadCount), botCtl, squadList);

  // ----- header / QR -----
  const url = joinUrl(app.room);
  const copyBtn = h("button.btn.btn-tiny", {
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast("join link copied", "ok");
      } catch {
        prompt("join link", url);
      }
    },
  }, "copy link");
  const ownerBadge = h("span.owner-badge");
  const header = h(
    "header.lobby-head",
    null,
    h("div.room-code", null, h("span.dim", null, "ROOM "), app.room),
    ownerBadge,
    screen ? null : copyBtn,
  );

  let body: HTMLElement;
  if (screen) {
    const logo = createLogo(4);
    body = h(
      "div.lobby-big",
      null,
      h(
        "section.panel.qr-panel",
        null,
        h("div.logo-wrap.small", null, logo.canvas),
        h("img.qr", { src: `/api/qr?text=${encodeURIComponent(url)}`, alt: "join QR code" }),
        h("div.qr-url", null, url.replace(/^https?:\/\//, "")),
        h("div.qr-code-big", null, app.room),
        h("div.dim", null, "scan to join · landscape · tilt to move"),
      ),
      h("div.big-right", null, squad, bossPanel),
    );
  } else {
    body = h("div.lobby-grid", null, youPanel, squad, bossPanel);
  }

  const el = h("div.screen.lobby" + (screen ? ".is-screen" : ""), null, backdrop.canvas, h("div.crt"), h("div.lobby-scroll", null, header, body));

  // chips
  fallbacks(app.mock).then((list) => {
    const mk = (target: HTMLInputElement, submit: () => void, cls: string) => (slug: string) =>
      h(`button.chip${cls}`, { onclick: () => { target.value = slug; submit(); } }, slug);
    youChips.replaceChildren(...list.slice(0, 10).map(mk(repoInput, submitRepo, "")));
    bossChips.replaceChildren(...list.slice(0, 10).map(mk(bossInput, submitBoss, ".chip-red")));
  });

  // ----- render -----
  function cloneText(slug: string, since: number, steps: string[]): { lines: string[]; frac: number } {
    const el = (performance.now() - since) / 1000;
    const frac = 1 - Math.exp(-el / 4.5);
    const step = Math.min(steps.length - 1, Math.floor(frac * steps.length));
    const lines: string[] = [];
    for (let i = Math.max(0, step - 1); i <= step; i++) {
      const s = steps[i].replace("%s", shortRepo(slug));
      if (i === 1) {
        const total = 600 + (slug.length * 97) % 4000;
        const got = Math.round(total * Math.min(1, frac * 2.2));
        lines.push(`${s}: ${Math.round(Math.min(1, frac * 2.2) * 100)}% (${got}/${total})`);
      } else lines.push(i < step ? `${s} done.` : `${s}...`);
    }
    return { lines, frac };
  }

  function playerCard(p: LobbyPlayer, lobby: LobbyState): HTMLElement {
    const you = p.id === app.you;
    const owner = p.id === lobby.ownerId;
    const portrait = h("div.pcard-portrait");
    const info = h("div.pcard-info");
    const name = h("div.pcard-name", null, p.name, owner ? h("span.badge.owner", null, "★ OWNER") : null, you ? h("span.badge.you", null, "YOU") : null, p.bot ? h("span.badge.bot", null, "BOT") : null);
    const repo = h("div.pcard-repo", null, p.repo ? `⎇ ${p.repo}` : "awaiting repo…");
    info.append(name, repo);
    if (p.status === "ready" && p.kit) {
      portrait.append(heroPortrait(p.kit, 64));
      info.append(
        h("div.pcard-title", null, p.kit.design?.title ?? p.kit.title),
        ...(p.kit.design?.catchphrase ? [h("div.pcard-quote", null, `“${p.kit.design.catchphrase}”`)] : []),
        h("div.pcard-kit", null, h("span.tag", null, `${WEAPON_ICON[p.kit.weapon] ?? ""} ${p.kit.weapon}`), h("span.tag.tag-skill", null, `⚡ ${p.kit.skill}`)),
        h("div.pcard-hearts", null, hearts(p.kit)),
      );
    } else if (p.status === "analyzing") {
      const c = noiseCanvas(32);
      noiseEls.add({ c, hue: "#39ff88" });
      portrait.append(c);
      info.append(h("pre.clone-log", { "data-clone": p.id }));
    } else if (p.status === "error") {
      portrait.append(h("div.portrait-err", null, "✗"));
      info.append(h("div.pcard-err", null, `fatal: ${p.error ?? "analysis failed"}`));
    } else {
      portrait.append(h("div.portrait-empty", null, "?"));
      info.append(h("div.dim.blink", null, you ? "← paste your repo" : "typing…"));
    }
    return h(`div.pcard.st-${p.status}${you ? ".is-you" : ""}${p.status === "ready" ? ".reveal" : ""}`, null, portrait, info);
  }

  function renderSquad(lobby: LobbyState) {
    squadCount.textContent = `${lobby.players.filter((p) => p.status === "ready").length}/${lobby.players.length} ready`;
    const seen = new Set<string>();
    lobby.players.forEach((p, i) => {
      seen.add(p.id);
      const sig = [p.name, p.repo, p.status, p.kit?.seed, p.error, p.id === lobby.ownerId, p.id === app.you, p.bot, dsig(p.kit)].join("|");
      if (p.status === "analyzing" && !analyzingSince.has(p.id)) analyzingSince.set(p.id, performance.now());
      if (p.status !== "analyzing") analyzingSince.delete(p.id);
      let card = cardEls.get(p.id);
      if (!card || cardSig.get(p.id) !== sig) {
        const fresh = playerCard(p, lobby);
        // same ready hero, new Gemini design arrived: glitch-swap instead of the full spin-up reveal
        if (card?.classList.contains("st-ready") && p.status === "ready" && cardSig.get(p.id)?.split("|").slice(0, 4).join("|") === sig.split("|").slice(0, 4).join("|")) {
          fresh.classList.remove("reveal");
          fresh.classList.add("redesign");
        }
        if (card) card.replaceWith(fresh);
        card = fresh;
        cardEls.set(p.id, card);
        cardSig.set(p.id, sig);
      }
      if (squadList.children[i] !== card) squadList.insertBefore(card, squadList.children[i] ?? null);
    });
    for (const [id, c] of cardEls) if (!seen.has(id)) (c.remove(), cardEls.delete(id), cardSig.delete(id));
    // empty slots up to 4 to make the "4+ players" target visible
    squadList.querySelectorAll(".pcard-slot").forEach((e) => e.remove());
    for (let i = lobby.players.length; i < (screen ? 8 : 4); i++)
      squadList.append(h("div.pcard.pcard-slot", null, h("div.pcard-portrait", null, h("div.portrait-empty", null, "+")), h("div.pcard-info", null, h("div.dim", null, `slot ${i + 1} · scan to join`))));
    backdrop.setHeroes(lobby.players.filter((p) => p.kit).map((p) => p.kit!));
  }

  function renderYou(lobby: LobbyState) {
    nameEl.textContent = app.name;
    const me = lobby.players.find((p) => p.id === app.you);
    if (!me) {
      youStatus.replaceChildren(statusMarker("player-ready", "empty", "not in squad"));
      return;
    }
    nameEl.textContent = me.name;
    if (me.repo && document.activeElement !== repoInput && !repoInput.value) repoInput.value = me.repo;
    const st = me.status;
    const label = st === "ready" ? "✓ hero summoned" : st === "analyzing" ? "analyzing repo…" : st === "error" ? `✗ ${me.error ?? "error"}` : "no repo yet";
    youStatus.replaceChildren(statusMarker("player-ready", st, label));
    const sig = `${st}|${me.kit?.seed}|${me.kit?.repo}|${dsig(me.kit)}`;
    if (youCard.dataset.sig !== sig) {
      youCard.dataset.sig = sig;
      if (me.kit && st === "ready") {
        const k = me.kit;
        youCard.replaceChildren(
          h("div.you-hero.reveal", null, heroPortrait(k, 96)),
          h(
            "div.you-stats",
            null,
            h("div.you-title", null, k.design?.title ?? k.title),
            k.design?.catchphrase ? h("div.pcard-quote", null, `“${k.design.catchphrase}”`) : null,
            h("div.kv", null, h("span", null, "weapon"), h("b", null, `${WEAPON_ICON[k.weapon] ?? ""} ${k.weapon}`)),
            h("div.kv", null, h("span", null, "skill"), h("b", null, `⚡ ${k.skill}`)),
            h("div.kv.dim", null, SKILL_DESC[k.skill] ?? ""),
            h("div.kv", null, h("span", null, "hp/armor"), h("b.red", null, hearts(k))),
            h("div.kv", null, h("span", null, "energy"), h("b.cyan", null, String(k.maxEnergy))),
            h("div.kv", null, h("span", null, "dmg/spd"), h("b", null, `×${k.damageMul.toFixed(2)} · ${Math.round(k.speed)}px/s`)),
          ),
        );
      } else youCard.replaceChildren();
    }
  }

  function renderBoss(lobby: LobbyState) {
    const b = lobby.boss;
    const owner = isOwner(app);
    bossOwnerCtl.style.display = owner ? "" : "none";
    bossChips.style.display = b.status === "ready" ? "none" : "";
    if (b.repo && owner && document.activeElement !== bossInput && !bossInput.value) bossInput.value = b.repo;
    const label = b.status === "ready" ? "✓ boss summoned" : b.status === "analyzing" ? "summoning…" : b.status === "error" ? `✗ ${b.error ?? "error"}` : owner ? "pick a rival repo" : "owner is choosing…";
    bossStatus.replaceChildren(statusMarker("boss-ready", b.status, label));
    if (b.status === "analyzing" && !analyzingSince.has("__boss")) analyzingSince.set("__boss", performance.now());
    if (b.status !== "analyzing") analyzingSince.delete("__boss");

    const sig = `${b.status}|${b.repo}|${b.kit?.seed}|${dsig(b.kit)}`;
    if (sig !== bossSig) {
      const wasAnalyzing = bossSig.startsWith("analyzing");
      bossSig = sig;
      if (b.status === "ready" && b.kit) {
        const k = b.kit;
        const sil = bossPortraitCanvas(k, 160, true);
        const full = bossPortraitCanvas(k, 160);
        full.classList.add("boss-full");
        sil.classList.add("boss-sil");
        bossStage.replaceChildren(h("div.boss-frame.revealing", null, sil, full, h("div.boss-flash")));
        bossRevealAt = performance.now();
        const nameEl = h("div.boss-name");
        bossInfo.replaceChildren(
          nameEl,
          ...(k.design?.epithet ? [h("div.boss-epithet", null, k.design.epithet)] : []),
          h("div.boss-meta", null, h("span.tag.tag-red", null, `theme: ${k.theme}`), h("span.tag", null, `HP ${Math.round(k.maxHp)}`), h("span.tag", null, `${k.attacks.length} attacks`)),
          h("div.boss-heart", null, "♥ heart: ", h("code", null, k.heart || "?")),
          h(
            "ul.boss-limbs",
            null,
            ...k.limbs.map((l, i) =>
              h(`li${l.weakPoint ? ".weak" : ""}`, null, i === k.limbs.length - 1 ? "└─ " : "├─ ", h("span.limb-name", { title: l.component }, k.design?.limbNames?.[l.id] ?? l.component), h("span.limb-hp", null, ` ${Math.round(l.maxHp)}hp`), l.weakPoint ? h("span.knot", null, " ⚠KNOT") : null),
            ),
          ),
          h("div.boss-attacks", null, ...k.attacks.slice(0, 6).map((a) => h("span.atk", { title: `${a.kind} from ${a.source}` }, a.name))),
        );
        // name types in after the silhouette glitches into colour
        setTimeout(() => {
          nameEl.innerHTML = "";
          let i = 0;
          const iv = setInterval(() => {
            nameEl.textContent = k.name.slice(0, ++i);
            if (i >= k.name.length) clearInterval(iv);
          }, 45);
        }, wasAnalyzing ? 900 : 0);
        backdrop.setTheme(k.theme);
        if (screen) backdrop.setBoss(k, true);
      } else if (b.status === "analyzing") {
        const c = noiseCanvas(48);
        noiseEls.add({ c, hue: "#ff3355" });
        bossStage.replaceChildren(h("div.boss-frame.analyzing", null, c, h("pre.clone-log.red", { "data-clone": "__boss" })));
        bossInfo.replaceChildren(h("div.boss-name.dim", null, `??? (${esc(b.repo ?? "")})`));
      } else if (b.status === "error") {
        bossStage.replaceChildren(h("div.boss-frame.err", null, h("div.portrait-err", null, "✗")));
        bossInfo.replaceChildren(h("div.pcard-err", null, `fatal: ${b.error ?? "could not summon"}`));
      } else {
        bossStage.replaceChildren(h("div.boss-frame.empty", null, h("div.boss-q", null, "?")));
        bossInfo.replaceChildren(h("div.dim", null, "the arena is quiet… for now"));
      }
    }
    const readyPlayers = lobby.players.filter((p) => p.status === "ready").length;
    const canStart = owner && readyPlayers >= 1 && b.status === "ready";
    startBtn.style.display = owner ? "" : "none";
    startBtn.disabled = !canStart;
    startHint.textContent = owner
      ? !readyPlayers
        ? "need ≥1 ready hero"
        : b.status !== "ready"
          ? "summon a boss first"
          : readyPlayers < 4
            ? `${readyPlayers} ready · 4+ recommended`
            : `${readyPlayers} heroes ready. go.`
      : `waiting for ${lobby.players.find((p) => p.id === lobby.ownerId)?.name ?? "owner"} to start…`;
  }

  function render() {
    const lobby = app.lobby;
    if (!lobby) return;
    ownerBadge.textContent = isOwner(app) ? "★ you own this room" : "";
    botCtl.style.display = isOwner(app) ? "" : "none";
    botCount.textContent = String(lobby.players.filter((p) => p.bot).length);
    renderSquad(lobby);
    if (!screen) renderYou(lobby);
    renderBoss(lobby);
  }

  // animation tick for clone logs + noise portraits
  const iv = setInterval(() => {
    const t = performance.now() / 1000;
    animatePortraits(t);
    for (const n of noiseEls) {
      if (!n.c.isConnected) {
        noiseEls.delete(n);
        continue;
      }
      paintNoise(n.c, t, n.hue);
    }
    el.querySelectorAll<HTMLElement>("pre.clone-log").forEach((pre) => {
      const id = pre.dataset.clone!;
      const since = analyzingSince.get(id) ?? performance.now();
      const slug = id === "__boss" ? app.lobby?.boss.repo ?? "" : app.lobby?.players.find((p) => p.id === id)?.repo ?? "";
      const { lines, frac } = cloneText(slug, since, id === "__boss" ? BOSS_STEPS : CLONE_STEPS);
      pre.textContent = lines.join("\n") + "\n" + asciiBar(frac, 14) + ` ${Math.floor(frac * 100)}%`;
    });
    if (bossRevealAt && performance.now() - bossRevealAt > 1500) {
      bossStage.querySelector(".boss-frame")?.classList.remove("revealing");
      bossRevealAt = 0;
    }
  }, 80);

  audio.music("lobby");
  render();
  return {
    el,
    update: render,
    destroy() {
      clearInterval(iv);
      backdrop.destroy();
      el.remove();
    },
  };
}
