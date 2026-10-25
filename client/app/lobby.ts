import { t } from '../i18n';
// Lobby: your hero setup, squad cards that "spin up" as repos are analyzed, the boss panel
// (owner sets the boss repo; silhouette -> reveal), START. Big-screen mode (?screen=1) shows a huge QR.
import type { BossKit, LobbyPlayer, LobbyState, PlayerKit, ServerMsg } from "../../shared/types";
import { type AppCtx, type Screen, isOwner, joinUrl, toast } from "./app";
import { createBackdrop } from "./backdrop";
import { createGithubPicker } from "./github";
import { aiOf, powerBadge, powerOf, powerScore, strongestIds } from "./royale";
import { codeSpan } from "./codefmt";
import { ARCH, archetypeWhy } from "./archetype";
import { createGenesisMount } from "./genesisMount";
import { openSettings } from "./settings";
import { getMotionPermissionState, subscribeMotionPermission } from "../input";
import { createMarkAnim } from "./logo";
import { wordmark } from "./wordmark";
import { markCanvas } from "./mark";
import { createSuggestionChips } from "./suggestions";
import { R, X } from "./renderers";
import { createRubricEditor, createJudgedCard, localDefaultRubric, type RubricEditor, createReportCard, gpa, gpaGrade, GRADE_COLOR } from "../edu";
import { audio } from "./sound";
import { pairPanel } from "./pair";
import { requiresPhoneController, usesLocalControls } from "./device";
import { asciiBar, esc, h, hash32, isPhone, normalizeRepo, shortRepo, store, humanComponent } from "./util";

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

/** Requested contract (docs/progress/claude-ui.md): analyzer progress on LobbyPlayer / lobby.boss. */
interface Progress { stage?: string; pct?: number; paths?: string[] }

/** Real code on hero cards: a snippet in a mini editor + the signature move. */
function codeBits(k: PlayerKit, big: boolean): HTMLElement[] {
  const c = k.code;
  if (!c) return [];
  const out: HTMLElement[] = [];
  if (c.signature) out.push(h("div.sig", null, h("span.dim", null, big ? "signature move " : "sig "), h("code", null, c.signature)));
  if (c.snippet) out.push(h("pre.code-mini", { title: c.snippet }, h("span.ln", null, String((k.seed % 380) + 12)), " ", c.snippet));
  return out;
}

/** Real code on the boss panel: heart lines scrolling in a mini editor, TODOs as known bugs, commits as recent sins. */
function bossCode(k: BossKit): HTMLElement[] {
  const c = k.code;
  if (!c) return [];
  const out: HTMLElement[] = [];
  if (c.heartLines?.length) {
    const lines = c.heartLines.slice(0, 14);
    const mk = () => lines.map((l, i) => h("div.hl", null, h("span.ln", null, String(i + 1).padStart(2, " ")), " ", l));
    out.push(
      h(
        "div.heart-win",
        null,
        h("div.hw-title", null, `● ${k.heart.split("/").pop() || "heart"}`),
        h("div.hw-body", null, h("div.hw-scroll", { style: `animation-duration:${lines.length * 1.6}s` }, ...mk(), ...mk())),
      ),
    );
  }
  if (c.todos?.length)
    out.push(h("div.code-list", null, h("div.cl-h", null, "known bugs"), ...c.todos.slice(0, 4).map((t) => h("div.cl-row.bug", { title: t }, t))));
  if (c.commits?.length)
    out.push(h("div.code-list", null, h("div.cl-h", null, "recent sins"), ...c.commits.slice(0, 3).map((t) => h("div.cl-row.sin", { title: t }, t))));
  return out;
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

/** Relative 5-pip stat bar ("damage ▮▮▮▯▯") — judges don't know what ×1.00 or 85px/s means. */
function statBar(label: string, v: number, lo: number, hi: number, col: string): HTMLElement {
  const n = Math.max(1, Math.min(5, Math.round(((v - lo) / (hi - lo)) * 4) + 1));
  return h("div.kv.statbar", { title: `${label}: ${Math.round(v * 100) / 100}` }, h("span", null, label), h(`b.pips.${col}`, null, "▮".repeat(n) + "▯".repeat(5 - n)));
}

function hearts(kit: PlayerKit): string {
  return "♥".repeat(Math.min(9, kit.maxHp)) + " " + "◆".repeat(Math.min(9, kit.maxArmor));
}

/** data-status is the real lobby status (playtests key off it); `look` may differ (a ready hero still compiling). */
function statusMarker(testid: string, status: string, text: string, look = status) {
  return h(`span.status-chip.st-${look}`, { "data-testid": testid, "data-status": status }, text);
}

export function createLobby(app: AppCtx): Screen {
  const screen = app.role === "screen";
  const backdrop = createBackdrop({ dim: screen ? 0.55 : 0.78, boss: null });
  const analyzingSince = new Map<string, number>();
  const cardSig = new Map<string, string>();
  const cardEls = new Map<string, HTMLElement>();
  // PvP repo power: whose parts list is open (survives card re-renders) and who holds the crown
  const powerOpen = new Set<string>();
  let strongest = new Set<string>();
  const noiseEls = new Set<{ c: HTMLCanvasElement; hue: string }>();
  let bossSig = "";
  let revealedRepo: string | null = null;
  let bossRevealAt = 0;

  // ----- your panel -----
  const repoInput = h("input.term-input", {
    "data-testid": "player-repo-input", placeholder: "owner/repo or github URL", autocomplete: "off", spellcheck: "false", autocapitalize: "off", "aria-label": "your repo",
  }) as HTMLInputElement;
  const submitRepo = () => {
    const r = normalizeRepo(repoInput.value);
    if (!r.includes("/")) {
      repoErr.textContent = "a repo looks like owner/name — e.g. pallets/flask";
      return repoInput.focus();
    }
    repoErr.textContent = "";
    repoInput.value = r;
    app.conn.send({ t: "setRepo", repo: r });
    changingRepo = false;
    audio.onUi();
    repoInput.blur();
  };
  repoInput.addEventListener("keydown", (e) => e.key === "Enter" && submitRepo());
  const repoErr = h("div.input-err", { role: "alert" });
  repoInput.addEventListener("input", () => (repoErr.textContent = ""));
  const youChips = h("div.chips", { "data-testid": "public-repo-suggestions" });
  const youStatus = h("div.you-status");
  const youCard = h("div.you-card");
  const nameEl = h("span.you-name");
  const renameInput = h("input.term-input.rename-input", { maxlength: 16, "aria-label": "your name", hidden: true }) as HTMLInputElement;
  const finishRename = (save: boolean) => {
    const n = renameInput.value.trim().replace(/\s+/g, "_").slice(0, 16);
    renameInput.hidden = true;
    nameEl.hidden = false;
    renameBtn.hidden = false;
    if (save && n && n !== app.name) app.rename(n);
  };
  renameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finishRename(true);
    if (e.key === "Escape") finishRename(false);
  });
  renameInput.addEventListener("blur", () => finishRename(true));
  const renameBtn = h("button.btn.btn-tiny", {
    onclick: () => {
      renameInput.value = app.name;
      renameInput.hidden = false;
      nameEl.hidden = true;
      renameBtn.hidden = true;
      renameInput.focus();
      renameInput.select();
    },
  }, "edit");

  // claude-genesis: your repo visibly compiling into your hero (live while analyzing, tap to replay)
  const heroGenesis = createGenesisMount("hero", { compact: isPhone() });
  // claude-genesis: boss compile in the boss panel; the projector also gets it full screen (the money shot)
  const bossGenesis = createGenesisMount("boss", { compact: isPhone() });
  let bossFull: ReturnType<typeof createGenesisMount> | null = null;
  let bossFullEl: HTMLElement | null = null;
  let bossFullCloseAt = 0;

  // repo picker; collapses to one line once your hero is summoned (tap "change" to reopen)
  let changingRepo = false;
  const summonBtn = h("button.btn.btn-primary", { "data-testid": "player-repo-submit", onclick: submitRepo }, "▶ summon hero");
  // PvP lists only repos you may fight with (your own non-fork, or a public repo you maintain/administer)
  const ghPicker = createGithubPicker((full) => {
    repoInput.value = full;
    submitRepo();
  });
  const pickerBox = h(
    "div.picker",
    null,
    h("label.term-line", null, h("span.prompt", null, "$ git clone "), repoInput),
    repoErr,
    summonBtn,
    youChips,
    ghPicker,
  );
  const pickerDoneRepo = h("b");
  const pickerDone = h(
    "div.picker-done",
    null,
    h("span.ok", null, "✓ "),
    pickerDoneRepo,
    " ",
    h("button.btn-link", { "data-testid": "player-repo-change", onclick: () => ((changingRepo = true), render(), repoInput.focus()) }, "change"),
  );
  // display device: link a signed-in phone as this seat's controller (claude-auth pair.ts)
  const pair = pairPanel(app, { required: requiresPhoneController(app.lobby?.mode) });
  const youPanel = h(
    "section.panel.you-panel",
    null,
    h("h2.panel-title", null, "$ whoami ", nameEl, renameInput, " ", renameBtn),
    pickerDone,
    pickerBox,
    youStatus,
    heroGenesis.host,
    h("div.genesis-hint", null, "▶ watch your repo compile into your hero · tap to replay"),
    youCard,
    pair.el,
  );

  const rubricHost = h("section.panel.lobby-rubric", { "data-testid": "lobby-rubric", hidden: true });
  let rubricEditor: RubricEditor | null = null;
  let rubricOwner = false;
  let rubricSig = "";
  function renderRubric(lobby: LobbyState) {
    rubricHost.hidden = lobby.mode !== "edu";
    const owner = isOwner(app);
    if (lobby.mode !== "edu") return;
    const me = lobby.players.find(p => p.id === app.you);
    const preview = me?.rubricPreview;
    const sig = JSON.stringify([owner, lobby.rubric, me?.kit?.quality, preview, app.token]);
    if (sig === rubricSig) return;
    rubricSig = sig;
    if (owner) {
      if (!rubricEditor || !rubricOwner) {
        rubricEditor?.dispose();
        rubricEditor = createRubricEditor({ current: lobby.rubric, room: app.room, token: app.token,
          onUse: rubric => app.conn.send({ t: "setRubric", rubric }) });
        rubricHost.replaceChildren(rubricEditor.el);
      }
      rubricEditor.setCurrent(lobby.rubric);
    } else {
      rubricEditor?.dispose(); rubricEditor = null;
      rubricHost.replaceChildren(createJudgedCard({ rubric: lobby.rubric ?? localDefaultRubric(), quality: me?.kit?.quality, preview }));
    }
    rubricOwner = owner;
  }

  // ----- boss panel -----
  const bossInput = h("input.term-input", {
    "data-testid": "boss-repo-input", placeholder: "rival/repo", autocomplete: "off", spellcheck: "false", autocapitalize: "off", "aria-label": "boss repo",
  }) as HTMLInputElement;
  const submitBoss = () => {
    const r = normalizeRepo(bossInput.value);
    if (!r.includes("/")) {
      bossErr.textContent = "a repo looks like owner/name — e.g. lodash/lodash";
      return bossInput.focus();
    }
    bossErr.textContent = "";
    bossInput.value = r;
    app.conn.send({ t: "setBoss", repo: r });
    changingBoss = false;
    audio.onUi();
    bossInput.blur();
  };
  bossInput.addEventListener("keydown", (e) => e.key === "Enter" && submitBoss());
  const bossErr = h("div.input-err", { role: "alert" });
  bossInput.addEventListener("input", () => (bossErr.textContent = ""));
  const bossChips = h("div.chips");
  const bossOwnerCtl = h(
    "div.boss-owner",
    null,
    h("label.term-line", null, h("span.prompt.red", null, "$ summon-boss "), bossInput),
    bossErr,
    h("button.btn.btn-danger", { "data-testid": "boss-repo-submit", onclick: submitBoss }, "☠ summon boss"),
    bossChips,
    // owner can also summon one of their own GitHub repos (private ones use the owner's token server-side)
    createGithubPicker((full) => {
      bossInput.value = full;
      submitBoss();
    }, { kind: "boss" }),
  );
  const bossTitle = h("h2.panel-title.red", null, "BOSS KAIJU");
  const eduInfo = h(
    "div.edu-info",
    { hidden: true },
    h("p", null, "The whole class attacks one shared Boss. Submit code, review feedback, improve, and contribute together."),
    h("p", null, "Teachers set multi-step coding tasks. Each submitted GitHub commit is scored before the automatic class attack."),
  );
  let changingBoss = false;
  const changeBossLink = h("button.btn-link.change-boss", {
    "data-testid": "boss-change",
    onclick: () => {
      changingBoss = true;
      render();
      bossInput.focus();
      bossInput.select();
    },
  }, "⟲ change boss");
  const bossStage = h("div.boss-stage");
  const bossInfo = h("div.boss-info");
  const bossStatus = h("div.boss-status");
  /** The room owner is a screen (POST /api/room?host=screen, /demo; or a big-screen classroom), not a player seat. */
  const screenOwns = (lobby: LobbyState) => !!lobby.ownerId && !lobby.players.some((p) => p.id === lobby.ownerId);
  /** Who starts the match, for "waiting for … to start". */
  const starterName = (lobby: LobbyState) =>
    lobby.players.find((p) => p.id === lobby.ownerId)?.name ?? (lobby.mode === "edu" ? "the teacher" : screenOwns(lobby) ? "the big screen" : "the host");
  let startArmedAt = 0;
  const startArmed = () => startArmedAt > 0 && performance.now() - startArmedAt < 4000;
  const pendingControls = () => app.lobby?.players.filter(p => !p.bot && p.status === "ready" && !!p.kit && p.controlsReady === false) ?? [];
  // ---- PvP royale start rule (server: 2–8 ready fighters incl. bots; humans without an eligible repo spectate, the host too;
  // any repo/bot still being verified or analyzed blocks the start) ----
  /** A pasted PvP repo is checked for ownership first: until analysis really starts nothing about it is shown. */
  const pvpVerifying = (p: LobbyPlayer, lobby: LobbyState) =>
    lobby.mode === "pvp" && p.status === "analyzing" && (!p.progress || (p.progress.stage === "clone" && p.progress.pct === 0));
  const pvpStart = (lobby: LobbyState) => {
    const fighters = lobby.players.filter((p) => p.status === "ready" && !!p.kit);
    const pending = lobby.players.filter((p) => p.status === "analyzing");
    const watchers = lobby.players.filter((p) => !p.bot && (p.status === "empty" || p.status === "error"));
    const me = lobby.players.find((p) => p.id === app.you);
    const hostFights = me?.status === "ready";
    const n = fighters.length;
    const reason = pending.length
      ? `waiting for ${pending.map((p) => p.name).join(", ")} to finish verifying`
      : n < 2
        ? hostFights ? "need at least 2 fighters — invite friends or add AI rivals" : "need at least 2 fighters — add AI rivals, or connect GitHub and pick a repo you own to fight"
        : n > 8 ? "max 8 fighters — remove AI rivals" : "";
    const label = hostFights ? `▶ START ROYALE (${n} fighters)` : `▶ START ROYALE · you'll spectate (${n} fighters)`;
    const others = watchers.filter((p) => p.id !== app.you).map((p) => p.name);
    // separate sentences = separate text nodes, so each one translates on its own
    const hint = reason ? [reason] : [hostFights ? `${n}/8 fighters ready. Last one standing wins.` : "no eligible repo: you'll watch. Connect GitHub and pick a repo you own to fight.",
      ...(others.length ? [`${others.join(", ")} will spectate.`] : [])];
    return { n, reason, label, hint, hostFights };
  };
  const tryStart = () => {
    if (!app.lobby || startBlocks(app.lobby).length) return; // the button / bar already says why
    const cloning = app.lobby?.players.filter((p) => p.status === "analyzing") ?? [];
    if (cloning.length && !startArmed()) {
      startArmedAt = performance.now();
      startHint.textContent = `${cloning.map((p) => p.name).join(", ")} still cloning… press again to start anyway`;
      startHint.classList.add("warn");
      return;
    }
    audio.onUi();
    app.conn.send({ t: "start" });
  };
  const startBtn = h("button.btn.btn-big.btn-start", { "data-testid": "start-match", "aria-describedby": "start-block", onclick: () => tryStart() }, "$ ./fight.sh") as HTMLButtonElement;
  // why START is blocked, right above the button (the hint below is for non-blocking info)
  const startBlock = h("div.start-block", { id: "start-block", role: "status", "aria-live": "polite", "data-testid": "start-block", hidden: true });
  const startHint = h("div.start-hint");
  let startError = "";
  type StartBlock = { text: string; act?: () => void };
  /** Everything stopping the owner from starting right now (empty = startable), with a fix-it action where there is one. */
  const startBlocks = (lobby: LobbyState): StartBlock[] => {
    const out: StartBlock[] = [];
    const ready = lobby.players.filter((p) => p.status === "ready").length;
    const toTop = () => (youPanel.scrollIntoView({ behavior: "smooth", block: "start" }), repoInput.focus());
    const toBoss = () => (bossPanel.scrollIntoView({ behavior: "smooth", block: "start" }), bossInput.focus());
    if (lobby.mode === "pvp") {
      const st = pvpStart(lobby);
      if (st.reason) out.push({ text: st.reason, act: st.hostFights ? undefined : toTop });
    } else if (lobby.mode === "edu") {
      if (ready < 2) out.push({ text: `waiting for classmates (${ready} ready) — or add AI teammates` });
    } else {
      if (!ready) out.push({ text: "need ≥1 ready hero", act: toTop });
      if (lobby.boss.status !== "ready") out.push(lobby.boss.status === "analyzing" ? { text: "⟳ summoning the boss…" } : { text: "② pick the BOSS repo ↓", act: toBoss });
    }
    const local = !screen && usesLocalControls() && !getMotionPermissionState().ready && !(lobby.mode === "pvp" && !pvpStart(lobby).hostFights);
    const others = pendingControls().filter((p) => !(local && p.id === app.you));
    if (others.length) out.push({ text: `waiting for controls: ${others.map((p) => p.name).join(", ")}` });
    if (local) out.push({ text: "📱 tap to enable motion or choose touch only", act: openSettings });
    return out;
  };
  const bossPanel = h(
    "section.panel.boss-panel",
    null,
    bossTitle,
    eduInfo,
    bossStage,
    bossStatus,
    bossInfo,
    bossOwnerCtl,
    changeBossLink,
    startBlock,
    startBtn,
    startHint,
  );

  // ----- squad -----
  const squadList = h("div.squad-list");
  const squadCount = h("span.count");
  const botCount = h("span.bot-n", null, "0");
  const botLabel = h("span.dim", null, "AI teammates: ");
  const setBots = (d: number) => {
    const cur = app.lobby?.players.filter((p) => p.bot).length ?? 0;
    const humans = (app.lobby?.players.length ?? 0) - cur;
    const n = Math.max(0, Math.min(7, Math.min(8 - humans, cur + d)));
    if (n !== cur) app.conn.send({ t: "setBots", count: n });
  };
  const botCtl = h(
    "div.bot-ctl",
    null,
    botLabel,
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
        prompt(t("join link"), url);
      }
    },
  }, "copy link");
  const ownerBadge = h("span.owner-badge");
  // Classroom opens a dedicated teacher room; battle rooms keep their existing participants.
  const modeBtn = (m: "battle" | "edu" | "pvp", label: string) =>
    h("button.mode-btn", { "data-testid": `mode-${m}`, "data-mode": m, onclick: async () => {
      if (m !== "edu" || app.mock) { app.conn.send({ t: "setMode", mode: m }); return; }
      try {
        const response = await fetch("/api/room?mode=edu", { method: "POST" });
        if (!response.ok) throw new Error("Could not create a classroom");
        const { room } = await response.json() as { room: string };
        location.assign(`/r/${room}?screen=1`);
      } catch { toast("Could not open the teacher classroom. Please try again.", "err"); }
    } }, label);
  const modeCtl = h("div.mode-ctl", { role: "group", "aria-label": "game mode", title: "classroom: code together and attack one shared Boss" }, modeBtn("battle", "⚔ boss raid"), modeBtn("pvp", "☠ PvP royale"), modeBtn("edu", "🎓 classroom"));
  // ⏏ leave room (owner: one extra tap that says who inherits the room); a classroom projector says "end class"
  let leaveArmedAt = 0;
  const leaveLabel = () => (screen && app.lobby?.mode === "edu" ? "⏏ end class" : "⏏ leave room");
  const leaveMsg = h("span.leave-msg", { role: "status" });
  const leaveBtn = h("button.btn.btn-tiny.btn-leave", {
    "data-testid": "leave-room",
    onclick: () => {
      const lobby = app.lobby;
      const others = lobby?.players.filter((p) => p.id !== app.you && !p.bot) ?? [];
      const owner = isOwner(app);
      const armed = leaveArmedAt > 0 && performance.now() - leaveArmedAt < 4000;
      if (owner && !screen && others.length && !armed) {
        leaveArmedAt = performance.now();
        leaveMsg.textContent = `you own this room — ownership passes to ${others[0].name}. tap again to leave`;
        leaveBtn.textContent = "⏏ confirm leave";
        setTimeout(() => {
          if (leaveArmedAt > 0 && performance.now() - leaveArmedAt >= 4000) {
            leaveArmedAt = 0;
            leaveMsg.textContent = "";
            leaveBtn.textContent = leaveLabel();
          }
        }, 4100);
        return;
      }
      app.leave();
    },
  }, leaveLabel());
  const leaveCtl = h(
    "div.leave-ctl",
    null,
    leaveBtn,
    screen ? h("button.btn.btn-tiny", { "data-testid": "new-room", onclick: () => app.leave({ newRoom: true }) }, "new room") : null,
    leaveMsg,
  );
  const actions = h("div.lobby-actions", null, screen ? null : copyBtn, leaveCtl);
  const header = h(
    "header.lobby-head",
    null,
    h("div.room-code", null, h("span.dim", null, "ROOM "), app.room),
    ownerBadge,
    modeCtl,
    actions,
  );

  const qrHelp1 = h("div.qr-help", null, "scan with your phone (hold it upright)");
  const qrHelp2 = h("div.qr-help.yellow", null, "★ the first phone to join is the host");
  const classCounter = h("div.class-counter", { hidden: true });
  let body: HTMLElement;
  let screenLogo: { destroy(): void } | null = null; // the projector's animated mark (stopped on destroy)
  if (screen) {
    const logo = (screenLogo = createMarkAnim(3));
    body = h(
      "div.lobby-big",
      null,
      h(
        "section.panel.qr-panel",
        null,
        h("div.logo-wrap.small", null, h("div.brand-lockup.stack.qr-lockup", null, h("div.bl-mark", null, logo.canvas), wordmark({ width: "min(100%, 300px)", enter: true, sparkle: true }))),
        h("img.qr", { src: `/api/qr?text=${encodeURIComponent(url)}`, alt: "join QR code" }),
        h("div.qr-url", null, url.replace(/^https?:\/\//, "")),
        h("div.qr-code-big", null, app.room),
        h("div.qr-corner-mark", null, markCanvas(2)),
        qrHelp1,
        qrHelp2,
        classCounter,
      ),
      h("div.big-right", null, squad, bossPanel, rubricHost),
    );
  } else {
    body = h("div.lobby-grid", null, youPanel, squad, bossPanel, rubricHost);
  }

  // phones: a sticky "what do I do next" bar at the bottom of the lobby
  const nextBar = h("button.next-bar", { "data-testid": "next-step" });
  let nextAction: (() => void) | null = null;
  nextBar.addEventListener("click", () => nextAction?.());
  const el = h("div.screen.lobby" + (screen ? ".is-screen" : ""), null, backdrop.canvas, h("div.crt"), h("div.lobby-scroll", null, header, body), screen ? null : nextBar);

  // chips: a fresh mix from /api/suggestions (curated + rising on GitHub), "↻ more" for another; PvP hides the hero ones
  createSuggestionChips(youChips, {
    mock: app.mock, testid: "repo-suggestion", onPick: (slug) => ((repoInput.value = slug), submitRepo()),
    lead: () => {
      const last = store.get("kaiju.lastRepo");
      return last ? [h("button.chip.chip-last", { "data-testid": "reuse-repo", "data-slug": last, onclick: () => ((repoInput.value = last), submitRepo()) }, `↻ ${last} again`)] : [];
    },
  });
  createSuggestionChips(bossChips, { mock: app.mock, testid: "boss-suggestion", cls: ".chip-red", onPick: (slug) => ((bossInput.value = slug), submitBoss()) });

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

  // ---- summon gate: a hero stays hidden until it's really summoned ----
  // status "ready" arrives while the Genesis cinematic is still compiling the hero, so cards / you-card / backdrop wait
  // for: your own seat → the cinematic's done (capped); others seen analyzing → when their cinematic would end (it plays
  // its full ~10 s timeline even when the analysis is quick, so: max(start + 10 s, ready + 2.5 s));
  // bots → a short beat; heroes already ready when this screen arrived (reconnect, resume) → right away. Until then the
  // card shows the static/progress placeholder.
  const GENESIS_MS = 10000, REMOTE_TAIL_MS = 2500, BOT_REVEAL_MS = 600, OWN_REVEAL_CAP_MS = 20000;
  const summon = new Map<string, { analyzed: boolean; startAt: number; readyAt: number }>();
  let ownGenesisLive = false;
  const trackSummon = (p: LobbyPlayer) => {
    const s = summon.get(p.id);
    if (p.status === "analyzing") {
      if (!s?.analyzed || s.readyAt) summon.set(p.id, { analyzed: true, startAt: performance.now(), readyAt: 0 });
    } else if (p.status === "ready") {
      if (!s) summon.set(p.id, { analyzed: false, startAt: 0, readyAt: performance.now() });
      else if (!s.readyAt) s.readyAt = performance.now();
    } else summon.delete(p.id);
  };
  const revealed = (p: LobbyPlayer): boolean => {
    if (p.status !== "ready" || !p.kit) return false;
    const s = summon.get(p.id);
    if (!s?.analyzed) return true;
    const now = performance.now(), since = now - s.readyAt;
    if (p.id === app.you && ownGenesisLive) return heroGenesis.done || since > OWN_REVEAL_CAP_MS;
    if (p.bot) return since > BOT_REVEAL_MS;
    return since > REMOTE_TAIL_MS && now - s.startAt > GENESIS_MS;
  };
  let heldIds: string[] = [];

  // ---- owner: each other member gets "⋯" → Make host / Kick (bots: Remove), with an inline confirm ----
  type AdminState = "menu" | "kick" | "host";
  const adminOpen = new Map<string, AdminState>();
  const canManage = (p: LobbyPlayer, lobby: LobbyState) => isOwner(app) && p.id !== app.you && lobby.mode !== "edu" && lobby.phase === "lobby";
  function adminCtl(p: LobbyPlayer): { toggle: HTMLElement; body: HTMLElement | null } {
    const st = adminOpen.get(p.id);
    const set = (v?: AdminState) => {
      if (v) adminOpen.set(p.id, v);
      else adminOpen.delete(p.id);
      render();
    };
    const send = (m: { t: "kick" | "transferOwner"; playerId: string }) => {
      adminOpen.delete(p.id);
      audio.onUi();
      app.conn.send(m);
      render();
    };
    const toggle = h("button.pc-more", { type: "button", "data-testid": "member-menu", "aria-label": `manage ${p.name}`, "aria-expanded": String(!!st), title: p.bot ? "remove this bot" : "make host or kick", onclick: () => set(st ? undefined : "menu") }, st ? "✕" : "⋯");
    const cancel = () => h("button.btn.btn-tiny.pc-cancel", { type: "button", "data-testid": "member-cancel", onclick: () => set() }, "Cancel");
    let body: HTMLElement | null = null;
    if (st === "menu")
      body = h("div.pc-admin", null,
        p.bot ? null : h("button.btn.btn-tiny.pc-host", { type: "button", "data-testid": "member-make-host", onclick: () => set("host") }, "★ Make host"),
        p.bot
          ? h("button.btn.btn-tiny.btn-danger", { type: "button", "data-testid": "member-remove", onclick: () => send({ t: "kick", playerId: p.id }) }, "Remove")
          : h("button.btn.btn-tiny.btn-danger", { type: "button", "data-testid": "member-kick", onclick: () => set("kick") }, "Kick"));
    else if (st === "kick")
      body = h("div.pc-admin.confirm", { role: "group" },
        h("div.pc-q", null, `Kick ${p.name}? They can't rejoin this room.`),
        h("button.btn.btn-tiny.btn-danger", { type: "button", "data-testid": "member-kick-confirm", onclick: () => send({ t: "kick", playerId: p.id }) }, "Kick"),
        cancel());
    else if (st === "host")
      body = h("div.pc-admin.confirm", { role: "group" },
        h("div.pc-q", null, `Make ${p.name} the host? You stay in the room as a player.`),
        h("button.btn.btn-tiny.btn-primary", { type: "button", "data-testid": "member-host-confirm", onclick: () => send({ t: "transferOwner", playerId: p.id }) }, "★ Make host"),
        cancel());
    return { toggle, body };
  }

  function playerCard(p: LobbyPlayer, lobby: LobbyState): HTMLElement {
    const card = playerCardBody(p, lobby);
    if (!canManage(p, lobby)) return card;
    const a = adminCtl(p);
    card.classList.add("has-admin");
    card.append(a.toggle);
    if (a.body) card.querySelector(".pcard-info")?.append(a.body);
    return card;
  }

  function playerCardBody(p: LobbyPlayer, lobby: LobbyState): HTMLElement {
    const you = p.id === app.you;
    const owner = p.id === lobby.ownerId;
    const portrait = h("div.pcard-portrait");
    const info = h("div.pcard-info");
    const crown = lobby.mode === "pvp" && p.status === "ready" && strongest.has(p.id);
    const name = h("div.pcard-name", null, h("span", { translate: "no" }, p.name), owner ? h("span.badge.owner", null, "★ OWNER") : null, you ? h("span.badge.you", null, "YOU") : null, p.bot ? h("span.badge.bot", null, "BOT") : null,
      crown ? h("span.badge.crown", { "data-testid": "strongest-repo", title: "strongest repo in this room (highest power)" }, "👑 STRONGEST") : null);
    const pvp = lobby.mode === "pvp";
    // PvP: never show a card for a repo that isn't (yet) verified as yours; those players spectate
    if (pvp && !p.bot && (p.status === "empty" || p.status === "error" || pvpVerifying(p, lobby))) {
      const verifying = p.status === "analyzing";
      portrait.append(h("div.portrait-empty", null, verifying ? "…" : "👁"));
      info.append(name, h("div.pcard-repo.dim", null, verifying ? "verifying repo ownership…" : you ? "spectating · pick a repo you own to fight" : "spectating"));
      return h(`div.pcard.st-${verifying ? "analyzing" : "spectate"}${you ? ".is-you" : ""}`, { "data-testid": "pvp-spectator" }, portrait, info);
    }
    const repo = h("div.pcard-repo", null, p.repo ? h("span", { translate: "no" }, `⎇ ${p.repo}`) : "awaiting repo…");
    info.append(name, repo);
    if (!p.bot) info.append(h("div.controls-state", { "data-testid": "player-controls", "data-ready": p.controlsReady !== false }, p.controlsReady === false ? "📱 waiting for controls" : "✓ controls ready"));
    const shown = revealed(p);
    if (p.status === "ready" && p.kit && shown) {
      portrait.append(heroPortrait(p.kit, 64));
      const pw = lobby.mode === "pvp" ? powerOf(p.kit) : null;
      info.append(
        h("div.pcard-title", null, p.kit.design?.title ?? p.kit.title),
        ...(pw ? [powerBadge(pw, { ai: aiOf(p.kit), open: powerOpen.has(p.id), onToggle: (on) => (on ? powerOpen.add(p.id) : powerOpen.delete(p.id)) })] : []),
        ...(p.kit.design?.catchphrase ? [h("div.pcard-quote", null, `“${p.kit.design.catchphrase}”`)] : []),
        h("div.pcard-kit", null, h("span.tag.tag-weapon", { title: `weapon (${p.kit.weapon})` }, `${WEAPON_ICON[p.kit.weapon] ?? ""} `, codeSpan(p.kit.code?.weapon?.name ?? p.kit.weapon)), h("span.tag.tag-skill", { title: "skill" }, `⚡ ${p.kit.skill}`)),
        lobby.mode === "edu" && p.kit.quality?.length
          ? h("div.pcard-gpa", { style: `--c:${GRADE_COLOR[gpaGrade(gpa(p.kit.quality))]}` }, h("b.gpa-letter", null, gpaGrade(gpa(p.kit.quality))), h("span.gpa-txt", null, ` code grade · GPA ${gpa(p.kit.quality).toFixed(1)}`))
          : h("div.pcard-hearts", null, hearts(p.kit)),
        ...codeBits(p.kit, false),
      );
    } else if (p.status === "analyzing" || p.status === "ready") {
      // summoning: static + the real stage/progress; a ready hero whose reveal hasn't played yet stays in here too
      const c = noiseCanvas(32);
      noiseEls.add({ c, hue: "#39ff88" });
      portrait.append(c);
      info.append(h("pre.clone-log", { "data-clone": p.id, "data-testid": "summoning" }));
    } else if (p.status === "error") {
      portrait.append(h("div.portrait-err", null, "✗"));
      info.append(h("div.pcard-err", null, `fatal: ${p.error ?? "analysis failed"}`));
    } else {
      portrait.append(h("div.portrait-empty", null, "?"));
      info.append(h("div.dim.blink", null, you ? "← paste your repo" : "typing…"));
    }
    const st = p.status === "ready" && !shown ? "analyzing" : p.status;
    return h(`div.pcard.st-${st}${you ? ".is-you" : ""}${st === "ready" ? ".reveal" : ""}${crown && shown ? ".strongest" : ""}`, { "data-revealed": String(shown) }, portrait, info);
  }

  function renderSquad(lobby: LobbyState) {
    const nReady = lobby.players.filter((p) => p.status === "ready").length;
    squadCount.textContent = `${nReady}/${lobby.players.length} ready`;
    const edu = lobby.mode === "edu";
    // classroom copy on the projector: the teacher's screen is the host; bots are opponents in PvP
    botLabel.textContent = edu ? "AI classmates (bots): " : lobby.mode === "pvp" ? "AI rivals: " : "AI teammates: ";
    qrHelp1.textContent = edu ? "students: scan to join · hold your phone upright" : "scan with your phone (hold it upright)";
    qrHelp2.textContent = edu ? "★ the teacher launches the class attack"
      : screenOwns(lobby) ? (isOwner(app) ? "★ this screen is the host: start the match here" : "★ the host screen will start the match")
      : "★ the first phone to join is the host";
    classCounter.hidden = !(screen && edu);
    classCounter.textContent = `${lobby.players.filter((p) => !p.bot).length} / 30 joined · ${nReady} ready`;
    const seen = new Set<string>();
    strongest = lobby.mode === "pvp" ? strongestIds(lobby.players.filter((p) => p.status === "ready")) : new Set();
    for (const p of lobby.players) trackSummon(p);
    heldIds = lobby.players.filter((p) => p.status === "ready" && p.kit && !revealed(p)).map((p) => p.id);
    lobby.players.forEach((p, i) => {
      seen.add(p.id);
      const sig = [p.name, p.repo, p.status, pvpVerifying(p, lobby), p.kit?.pvpPower ? powerScore(p.kit.pvpPower) : "", p.kit?.pvpAi?.baseScore ?? "", strongest.has(p.id), p.kit?.seed, p.error, p.id === lobby.ownerId, p.id === app.you, p.bot, p.controlsReady, dsig(p.kit), lobby.mode, p.kit?.quality?.map((q) => q.grade).join(""), revealed(p), canManage(p, lobby), adminOpen.get(p.id) ?? ""].join("|");
      if (p.status === "analyzing" && !analyzingSince.has(p.id)) analyzingSince.set(p.id, performance.now());
      if (p.status !== "analyzing") analyzingSince.delete(p.id);
      let card = cardEls.get(p.id);
      if (!card || cardSig.get(p.id) !== sig) {
        const fresh = playerCard(p, lobby);
        // same ready hero, new Gemini design arrived: glitch-swap instead of the full spin-up reveal
        // only the owner's ⋯ menu changed: no animation at all
        const base = (x?: string) => x?.split("|").slice(0, -2).join("|");
        if (card && base(cardSig.get(p.id)) === base(sig)) fresh.classList.remove("reveal");
        else if (card?.classList.contains("st-ready") && p.status === "ready" && cardSig.get(p.id)?.split("|").slice(0, 4).join("|") === sig.split("|").slice(0, 4).join("|")) {
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
    for (const id of adminOpen.keys()) if (!seen.has(id) || !isOwner(app)) adminOpen.delete(id);
    // empty slots up to 4 to make the "4+ players" target visible
    squadList.querySelectorAll(".pcard-slot").forEach((e) => e.remove());
    // royale: show the whole 8-seat roster so "up to eight" reads at a glance
    if (!(screen && lobby.mode === "edu")) for (let i = lobby.players.length; i < (lobby.mode === "pvp" || screen ? 8 : 4); i++)
      squadList.append(h("div.pcard.pcard-slot", null, h("div.pcard-portrait", null, h("div.portrait-empty", null, "+")), h("div.pcard-info", null, h("div.dim", null, `slot ${i + 1} · scan to join`))));
    backdrop.setHeroes(lobby.players.filter((p) => p.kit && revealed(p)).map((p) => p.kit!));
  }

  function renderYou(lobby: LobbyState) {
    nameEl.textContent = app.name;
    const me = lobby.players.find((p) => p.id === app.you);
    const hideRepo = !!me && lobby.mode === "pvp" && (me.status === "error" || pvpVerifying(me, lobby));
    const live = !!me && !hideRepo && heroGenesis.sync({ repo: me.repo, status: me.status, progress: me.progress, genesis: me.genesis, kit: me.kit }, lobby.mode);
    if (hideRepo) heroGenesis.sync({ repo: null, status: "empty", kit: null }, lobby.mode);
    // PvP: the server's refusal ("not your repo", "forks don't count", …) shows inline under the input, never as a card
    if (lobby.mode === "pvp" && me?.status === "error" && me.error) repoErr.textContent = me.error;
    youPanel.classList.toggle("has-genesis", live);
    ownGenesisLive = live;
    const collapse = !!me && me.status === "ready" && !changingRepo;
    pickerBox.hidden = collapse;
    pickerDone.hidden = !collapse;
    pickerDoneRepo.textContent = me?.repo ?? "";
    summonBtn.classList.toggle("btn-primary", !me || me.status !== "ready");
    if (!me) {
      youStatus.replaceChildren(statusMarker("player-ready", "empty", "not in squad"));
      return;
    }
    nameEl.textContent = me.name;
    if (me.repo && document.activeElement !== repoInput && !repoInput.value) repoInput.value = me.repo;
    const st = me.status;
    const pvp = lobby.mode === "pvp";
    const compiling = st === "ready" && !revealed(me);
    const label = compiling ? "⟳ compiling your hero…" : st === "ready" ? "✓ hero summoned" : st === "analyzing" ? (pvp && pvpVerifying(me, lobby) ? "checking that this repo is yours…" : "analyzing repo…")
      : pvp ? "👁 spectating · pick a repo you own to fight" : st === "error" ? `✗ ${me.error ?? "error"}` : "no repo yet";
    youStatus.replaceChildren(statusMarker("player-ready", st, label, compiling ? "analyzing" : st));
    const edu = lobby.mode === "edu";
    const myPower = pvp ? powerOf(me.kit) : null;
    const meShown = revealed(me);
    const sig = `${st}|${meShown}|${me.kit?.seed}|${me.kit?.repo}|${dsig(me.kit)}|${edu}|${me.kit?.quality?.map((q) => q.grade).join("")}|${myPower ? powerScore(myPower) : ""}|${strongest.has(me.id)}`;
    if (youCard.dataset.sig !== sig) {
      youCard.dataset.sig = sig;
      if (!meShown) youCard.replaceChildren(); // still being summoned: the Genesis cinematic above is the only reveal
      else if (me.kit && st === "ready" && edu && me.kit.quality?.length) {
        // classroom: stats ARE the code-quality report card
        const k = me.kit;
        youCard.replaceChildren(
          h("div.you-hero.reveal", null, heroPortrait(k, 96)),
          h("div.you-stats", null, h("div.you-title", null, k.design?.title ?? k.title), h("div.dim.rc-why", null, "in classroom mode your stats are graded from your code ↓"), ...codeBits(k, true)),
          h("div.you-report", null, createReportCard({ id: me.id, name: me.name, repo: me.repo ?? "", quality: k.quality }, { size: "md", you: true })),
        );
      } else if (me.kit && st === "ready") {
        const k = me.kit;
        youCard.replaceChildren(
          h("div.you-hero.reveal", null, heroPortrait(k, 96)),
          h(
            "div.you-stats",
            null,
            h("div.you-title", null, k.design?.title ?? k.title),
            k.design?.catchphrase ? h("div.pcard-quote", null, `“${k.design.catchphrase}”`) : null,
            // PvP: your repo's power decides your stats; your own card shows what counts most right away
            ...(myPower ? [powerBadge(myPower, { open: true, ai: aiOf(me.kit) }), strongest.has(me.id) ? h("div.pw-crown", null, "👑 strongest repo in this room") : h("div.dim.pw-why", null, "stats scale with power")] : []),
            h("div.kv", null, h("span", null, "weapon"), h("b.kv-weapon", null, `${WEAPON_ICON[k.weapon] ?? ""} `, codeSpan(k.code?.weapon?.name ?? k.weapon))),
            ...(k.code?.weapon
              ? [h("div.kv.dim", null, `a ${k.weapon} · fires ${k.code.weapon.projectiles.map((x) => `"${x}"`).join(" ")} · hits go ${k.code.weapon.impact}`)]
              : []),
            h("div.kv", null, h("span", null, "skill"), h("b", null, `⚡ ${k.skill}`)),
            h("div.kv.dim", null, SKILL_DESC[k.skill] ?? ""),
            ...codeBits(k, true),
            statBar("health", k.maxHp, 4, 10, "red"),
            statBar("armor", k.maxArmor, 2, 8, "grey"),
            statBar("energy", k.maxEnergy, 120, 260, "cyan"),
            statBar("damage", k.damageMul, 0.75, 1.3, "yellow"),
            statBar("speed", k.speed, 60, 115, "green"),
          ),
        );
      } else youCard.replaceChildren();
    }
  }

  function renderBoss(lobby: LobbyState) {
    const b = lobby.boss;
    const owner = isOwner(app);
    bossTitle.textContent = lobby.mode === "edu" ? "CLASSROOM BRAWL" : "BOSS KAIJU";
    if (lobby.mode === "edu") return renderClassroom(lobby, owner);
    if (lobby.mode === "pvp") {
      bossTitle.textContent = "PVP ROYALE";
      eduInfo.hidden = false;
      eduInfo.replaceChildren(
        h("p.royale-rules", null, h("b", null, "2–8 heroes · free-for-all · no respawns."), " ", h("span", null, "A knockout is final; the last hero standing wins.")),
        h("p.royale-rules", null, h("b.zone-word", null, "GC sweep:"), " ", h("span", null, "the safe circle starts shrinking after 0:45–1:40 (more heroes, later). Outside it the garbage collector eats your HP.")),
        h("p.royale-rules", null, h("span", null, "Stronger repos make stronger heroes: POWER comes from tests, modularity, docs, stars and contributors. No one-shots."), " ", h("span", null, "Knockouts drop a heart and energy.")),
        h("p.dim", null, "Connect GitHub. Use your own non-fork repository, or a public repository you maintain or administer. Your own forks are not eligible."),
      );
      for (const n of [bossStage, bossStatus, bossInfo]) n.hidden = true;
      bossOwnerCtl.style.display = "none"; changeBossLink.style.display = "none";
      startBtn.style.display = owner ? "" : "none";
      const st = pvpStart(lobby);
      startBtn.disabled = !!st.reason;
      startBtn.textContent = st.label;
      if (startError) startHint.textContent = startError;
      else startHint.replaceChildren(...st.hint.flatMap((x, i) => (i ? [" ", h("span", null, x)] : [h("span", null, x)])));
      startHint.classList.toggle("warn", !!startError || !!st.reason);
      return;
    }
    eduInfo.hidden = true;
    for (const n of [bossStage, bossStatus, bossInfo]) n.hidden = false;
    startBtn.textContent = "$ ./fight.sh";
    bossOwnerCtl.style.display = owner ? "" : "none";
    // once a boss is summoned, ./fight.sh is the only primary action; changing the boss is a small link
    const collapse = b.status === "ready" && !changingBoss;
    bossOwnerCtl.classList.toggle("collapsed", collapse);
    changeBossLink.style.display = owner && collapse ? "" : "none";
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
        // the silhouette -> colour reveal plays once per boss repo; later kit updates (e.g. the Gemini design
        // arriving) swap the art in place so the boss is never left looking like a dark silhouette
        const firstReveal = revealedRepo !== b.repo;
        revealedRepo = b.repo;
        if (!bossStage.contains(bossGenesis.host)) bossStage.replaceChildren(h(`div.boss-frame${firstReveal ? ".revealing" : ".redesign"}`, null, sil, full, h("div.boss-flash")));
        if (firstReveal) bossRevealAt = performance.now();
        const nameEl = h("div.boss-name");
        bossInfo.replaceChildren(
          nameEl,
          ...(k.design?.epithet ? [h("div.boss-epithet", null, k.design.epithet)] : []),
          ...(k.archetype && ARCH[k.archetype]
            ? [h("div.boss-arch", { "data-testid": "boss-archetype", "data-arch": k.archetype },
                h("span.arch-badge", null, `${ARCH[k.archetype].icon} ${ARCH[k.archetype].label}`),
                h("span.arch-why", null, archetypeWhy(k)),
                h("div.arch-blurb", null, ARCH[k.archetype].blurb))]
            : []),
          h("div.boss-meta", null, h("span.tag.tag-red", null, `theme: ${k.theme}`), h("span.tag", null, `HP ${Math.round(k.maxHp)}`), h("span.tag", null, `${k.attacks.length} attacks`)),
          h("div.boss-heart", null, "♥ heart: ", h("code", null, k.heart || "?")),
          ...bossCode(k),
          h(
            "ul.boss-limbs",
            null,
            ...k.limbs.map((l, i) =>
              h(`li${l.weakPoint ? ".weak" : ""}`, null, i === k.limbs.length - 1 ? "└─ " : "├─ ", h("span.limb-name", { title: l.component }, k.design?.limbNames?.[l.id] ?? humanComponent(l.component, k.repo)), h("span.limb-hp", null, ` ${Math.round(l.maxHp)}hp`), l.weakPoint ? h("span.knot", null, " ⚠KNOT") : null),
            ),
          ),
          h("div.boss-attacks", null, ...k.attacks.slice(0, 6).map((a) => h("span.atk", { title: `${a.kind} from ${a.source}` }, a.name))),
        );
        // name types in as the silhouette glitches into colour (instantly on in-place updates)
        if (!firstReveal) nameEl.textContent = k.name;
        else setTimeout(() => {
          nameEl.innerHTML = "";
          let i = 0;
          const iv = setInterval(() => {
            nameEl.textContent = k.name.slice(0, ++i);
            if (i >= k.name.length) clearInterval(iv);
          }, 45);
        }, wasAnalyzing ? 450 : 0);
        backdrop.setTheme(k.theme);
        if (screen) backdrop.setBoss(k, true);
      } else if (b.status === "analyzing") {
        const c = noiseCanvas(48);
        noiseEls.add({ c, hue: "#ff3355" });
        if (!bossStage.contains(bossGenesis.host)) bossStage.replaceChildren(h("div.boss-frame.analyzing", null, c, h("pre.clone-log.red", { "data-clone": "__boss" })));
        bossInfo.replaceChildren(h("div.boss-name.dim", null, `??? (${esc(b.repo ?? "")})`));
      } else if (b.status === "error") {
        bossGenesis.dispose();
        bossStage.replaceChildren(h("div.boss-frame.err", null, h("div.portrait-err", null, "✗")));
        bossInfo.replaceChildren(h("div.pcard-err", null, `fatal: ${b.error ?? "could not summon"}`));
      } else {
        bossGenesis.dispose();
        bossStage.replaceChildren(h("div.boss-frame.empty", null, h("div.boss-q", null, "?")));
        bossInfo.replaceChildren(h("div.dim", null, "the arena is quiet… for now"));
      }
    }
    syncBossGenesis(lobby);
    const readyPlayers = lobby.players.filter((p) => p.status === "ready").length;
    const canStart = owner && readyPlayers >= 1 && b.status === "ready";
    startBtn.style.display = owner ? "" : "none";
    startBtn.disabled = !canStart;
    if (startArmed()) return; // keep the "still cloning… press again" warning visible
    startHint.classList.remove("warn");
    startHint.textContent = owner
      ? !readyPlayers
        ? "need ≥1 ready hero"
        : b.status !== "ready"
          ? "summon a boss first"
          : readyPlayers < 4
            ? `${readyPlayers} ready · 4+ recommended`
            : `${readyPlayers} heroes ready. go.`
      : `waiting for ${starterName(lobby)} to start…`;
  }

  function syncBossGenesis(lobby: LobbyState) {
    const b = lobby.boss;
    const src = { repo: b.repo, status: b.status, progress: b.progress, genesis: b.genesis, kit: b.kit };
    if (!screen) {
      // panel: the cinematic replaces the static silhouette while compiling and stays as the live idle boss after
      if ((b.status === "analyzing" || b.status === "ready") && !bossStage.contains(bossGenesis.host)) bossStage.replaceChildren(bossGenesis.host);
      if (!bossGenesis.sync(src, lobby.mode) && bossStage.contains(bossGenesis.host)) bossSig = ""; // fall back to the static reveal
      return;
    }
    // projector: full-screen compile while the boss is analyzed, held a few seconds after the reveal, then the panel
    if (b.status === "analyzing" && !bossFull) {
      bossFull = createGenesisMount("boss", { className: "full", onDone: () => (bossFullCloseAt = performance.now() + 5000) });
      bossFullEl = h("div.genesis-full", { "data-testid": "boss-genesis-full" }, bossFull.host, h("button.btn.btn-tiny.gf-close", { onclick: () => closeBossFull() }, "✕ close"));
      el.append(bossFullEl);
      bossFullCloseAt = 0;
    }
    if (bossFull) {
      if (b.status !== "analyzing" && b.status !== "ready") closeBossFull();
      else bossFull.sync(src, lobby.mode);
    }
  }
  function closeBossFull() {
    bossFull?.dispose();
    bossFull = null;
    bossFullEl?.remove();
    bossFullEl = null;
  }

  function renderClassroom(lobby: LobbyState, owner: boolean) {
    eduInfo.hidden = false;
    for (const n of [bossStage, bossStatus, bossInfo]) n.hidden = true;
    bossOwnerCtl.style.display = "none";
    changeBossLink.style.display = "none";
    startBtn.style.display = owner ? "" : "none";
    startBtn.disabled = true;
    startBtn.textContent = "Open the teacher classroom";
    if (startArmed()) return;
    startHint.classList.remove("warn");
    startHint.textContent = owner
      ? "Refresh to open the cooperative teacher classroom."
      : `waiting for ${starterName(lobby)} to start…`;
  }

  function render() {
    pair.update(app);
    const lobby = app.lobby;
    if (!lobby) return;
    const edu = lobby.mode === "edu";
    el.classList.toggle("edu", edu);
    modeCtl.classList.toggle("owner", isOwner(app));
    for (const b of modeCtl.querySelectorAll<HTMLButtonElement>(".mode-btn")) {
      b.classList.toggle("on", b.dataset.mode === lobby.mode);
      b.disabled = !isOwner(app);
    }
    ownerBadge.textContent = isOwner(app) ? "★ you own this room" : "";
    if (!leaveArmedAt && leaveBtn.textContent !== leaveLabel()) leaveBtn.textContent = leaveLabel(); // follows mode changes
    botCtl.style.display = isOwner(app) ? "" : "none";
    youChips.hidden = lobby.mode === "pvp"; // PvP: no famous-repo quick picks (you can only fight with your own)
    ghPicker.setPvp(lobby.mode === "pvp");
    if (lobby.mode !== "pvp" || lobby.phase !== "lobby") startError = "";
    botCount.textContent = String(lobby.players.filter((p) => p.bot).length);
    renderRubric(lobby);
    renderSquad(lobby);
    if (!screen) renderYou(lobby);
    renderBoss(lobby);
    renderStart(lobby);
    if (!screen) renderNext(lobby);
  }

  /** A blocked START looks disabled (muted, no glow) and says why right above it; startable = lit, reason gone. */
  function renderStart(lobby: LobbyState) {
    const owner = isOwner(app);
    const blocks = owner ? startBlocks(lobby) : [];
    // the classroom lobby never starts from here (the teacher classroom does)
    const lines: StartBlock[] = lobby.mode === "edu" && owner && !blocks.length ? [{ text: "Refresh to open the cooperative teacher classroom." }] : blocks;
    const blocked = lines.length > 0;
    startBtn.disabled = blocked;
    startBtn.setAttribute("aria-disabled", String(blocked));
    startBlock.hidden = !owner || !blocked;
    startBlock.replaceChildren(...lines.map((b) => (b.act ? h("button.btn-link.sb-line", { type: "button", onclick: b.act }, b.text) : h("div.sb-line", null, b.text))));
    // the hint below keeps non-blocking info (n ready, who spectates), server errors and the "press again" warning
    startHint.hidden = owner && blocked && !startError && !startArmed();
  }

  /** Phone sticky bar as the START control: same rules as the panel button. A blocked bar with a fix-it action stays tappable for that action. */
  function startBar(lobby: LobbyState, label: string) {
    const blocks = startBlocks(lobby);
    nextBar.setAttribute("aria-disabled", String(blocks.length > 0));
    if (!blocks.length) {
      nextBar.replaceChildren(label);
      nextBar.className = "next-bar go";
      nextAction = tryStart;
      nextBar.disabled = false;
      return;
    }
    nextBar.replaceChildren(h("span.nb-why", null, ...blocks.map((b) => h("span.nb-line", null, b.text))), h("span.nb-start", null, label));
    nextBar.className = "next-bar blocked";
    nextAction = blocks.find((b) => b.act)?.act ?? null;
    nextBar.disabled = !nextAction;
  }

  const phoneLobby = () => matchMedia("(max-width: 600px) and (orientation: portrait)").matches;
  function renderNext(lobby: LobbyState) {
    const me = lobby.players.find((p) => p.id === app.you);
    const owner = isOwner(app);
    const ready = lobby.players.filter((p) => p.status === "ready").length;
    const edu = lobby.mode === "edu";
    const bossOk = edu || lobby.mode === "pvp" || lobby.boss.status === "ready";
    const ownerName = starterName(lobby);
    let text = "", cls = "", act: (() => void) | null = null;
    const toTop = () => (youPanel.scrollIntoView({ behavior: "smooth", block: "start" }), repoInput.focus());
    nextBar.removeAttribute("aria-disabled");
    if (lobby.mode === "pvp" && (owner || !me || me.status !== "ready")) {
      const st = pvpStart(lobby);
      const barIsStart = phoneLobby() && owner;
      if (owner) {
        startBar(lobby, st.label);
      } else {
        text = me?.status === "analyzing" ? "checking that this repo is yours…" : "👁 you'll spectate — pick a repo you own to fight";
        cls = me?.status === "analyzing" ? "busy" : "";
        act = toTop;
        nextBar.textContent = text;
        nextBar.className = `next-bar ${cls}`;
        nextAction = act;
        nextBar.disabled = false;
      }
      nextBar.dataset.testid = barIsStart ? "start-match" : "next-step";
      startBtn.dataset.testid = phoneLobby() ? "start-match-panel" : "start-match";
      return;
    }
    if (!me || me.status === "empty" || me.status === "error") {
      text = me?.status === "error" ? "✗ that repo failed — pick another above" : "① pick your repo above (or tap a chip)";
      act = toTop;
    } else if (me.status === "analyzing") {
      text = `⟳ cloning ${me.repo ?? "your repo"}…`;
      cls = "busy";
    } else if (owner) {
      // your hero is in: from here the bar IS the start button (blocked until every reason is cleared)
      startBar(lobby, edu ? `▶ START BRAWL (${ready} students)` : `▶ START FIGHT (${ready} hero${ready === 1 ? "" : "es"})`);
      nextBar.dataset.testid = phoneLobby() ? "start-match" : "next-step";
      startBtn.dataset.testid = phoneLobby() ? "start-match-panel" : "start-match";
      return;
    } else if (usesLocalControls() && !getMotionPermissionState().ready) {
      text = "📱 open settings to enable motion or choose touch only";
      act = openSettings;
    } else {
      text = `✓ ready as ${me.kit?.design?.title ?? me.kit?.title ?? "your hero"} · waiting for ${ownerName} to start (${ready} in)`;
      cls = "done";
    }
    nextBar.textContent = text;
    nextBar.className = `next-bar ${cls}`;
    nextAction = act;
    nextBar.disabled = false;
    // data-testid="start-match" always belongs to the VISIBLE start control: the sticky bar on phone-portrait
    // (where the panel button is hidden by CSS), the panel button everywhere else
    nextBar.dataset.testid = "next-step";
    startBtn.dataset.testid = phoneLobby() ? "start-match-panel" : "start-match";
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
      const fake = cloneText(slug, since, id === "__boss" ? BOSS_STEPS : CLONE_STEPS);
      const lines = fake.lines;
      const src = (id === "__boss" ? app.lobby?.boss : app.lobby?.players.find((p) => p.id === id)) as { progress?: Progress; status?: string } | undefined;
      const paths = src?.status === "ready" ? [] : src?.progress?.paths ?? [];
      if (src?.progress?.stage) lines[lines.length - 1] = `${src.progress.stage}...`;
      // real analyzer progress when the server sends it; a ready hero still waiting for its reveal reads 100%
      let frac = typeof src?.progress?.pct === "number" ? Math.max(0, Math.min(1, src.progress.pct)) : fake.frac;
      if (src?.status === "ready") (lines.length = 0), lines.push("assembling hero..."), (frac = 1);
      // stream the real file paths the analyzer is reading, newest last
      const k = Math.floor(performance.now() / 140);
      const shown = paths.length ? [paths[k % paths.length], paths[(k + 1) % paths.length]].map((x) => `  ${x}`) : [];
      pre.textContent = [...lines, ...shown].join("\n") + "\n" + asciiBar(frac, 14) + ` ${Math.floor(frac * 100)}%`;
    });
    if (heldIds.length && app.lobby && heldIds.some((id) => { const p = app.lobby!.players.find((x) => x.id === id); return !p || revealed(p); })) render();
    if (bossFull && bossFullCloseAt && performance.now() > bossFullCloseAt) closeBossFull();
    if (bossRevealAt && performance.now() - bossRevealAt > 1500) {
      bossStage.querySelector(".boss-frame")?.classList.remove("revealing");
      bossRevealAt = 0;
    }
  }, 80);

  audio.music("lobby");
  // the start control's test id follows the layout (phone bar vs panel button)
  const onResize = () => render();
  addEventListener("resize", onResize);
  const stopPermission = usesLocalControls() ? subscribeMotionPermission(() => render()) : () => {};
  render();
  return {
    el,
    update: render,
    onMsg(m: ServerMsg) {
      // PvP: show the server's start refusal right under START (it's also a toast)
      if (m.t === "error" && app.lobby?.mode === "pvp" && app.lobby.phase === "lobby") startError = m.message;
    },
    destroy() {
      stopPermission();
      pair.destroy();
      rubricEditor?.dispose();
      clearInterval(iv);
      removeEventListener("resize", onResize);
      heroGenesis.dispose();
      bossGenesis.dispose();
      screenLogo?.destroy();
      closeBossFull();
      backdrop.destroy();
      el.remove();
    },
  };
}
