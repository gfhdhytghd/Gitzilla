// Offline mock server for UI development/screenshots: open any page with ?mock=1 (or ?mock=match / ?mock=autopsy).
// Uses the real sim (sim/index.ts) + fallback profiles in the browser when they exist; otherwise a tiny fake sim.
import type {
  Autopsy, BossKit, BossState, Bullet, ClientMsg, GameEvent, Hazard, InputFrame, LobbyState, MatchState, Minion,
  PlayerKit, PlayerState, PvpState, QualityStat, RepoProfile, ServerMsg,
} from "../../shared/types";
import { ARENA_H, ARENA_W } from "../../shared/types";
import type { Conn, ConnOpts, ConnStatus } from "./net";
import { hash32, mulberry32, normalizeRepo } from "./util";
import { buildGenesisLocal } from "../genesis";
import { defaultClassroomPlan } from "../../shared/classroom-defaults";

interface SimMod {
  playerKitFromProfile(p: RepoProfile, options?: { mode?: "battle" | "edu" | "pvp" }): PlayerKit;
  bossKitFromProfile(p: RepoProfile, n: number): BossKit;
  createMatch(players: { id: string; name: string; kit: PlayerKit }[], boss: BossKit | null, options?: { mode?: "battle" | "edu" | "pvp" }): {
    step(dt: number, inputs: Map<string, InputFrame>): void;
    snapshot(): MatchState;
    autopsy(): Autopsy;
    readonly over: boolean;
  };
}
const simGlob = import.meta.glob("../../sim/index.ts");
// ?mock=royale&real=1: the real sim royale + the sim's normal-input bots (bots.ts imports node:fs for its balance
// tooling; createBot itself doesn't touch it, so a failed import just falls back to random mock inputs)
const botsGlob = import.meta.glob("../../sim/bots.ts");
const fallbackGlob = import.meta.glob("../../data/fallback/*.json", { import: "default" });

export const MOCK_REPOS = ["facebook/react", "torvalds/linux", "pallets/flask", "rust-lang/rust", "lodash/lodash", "django/django", "vuejs/core", "golang/go"];

const LANGS = ["TypeScript", "Rust", "Python", "Go", "C", "Java", "Ruby", "JavaScript", "C++", "Kotlin"];
const LANG_COL: Record<string, string> = {
  TypeScript: "#3178c6", Rust: "#dea584", Python: "#3572a5", Go: "#00add8", C: "#8a8a8a", Java: "#b07219",
  Ruby: "#cc342d", JavaScript: "#f1e05a", "C++": "#f34b7d", Kotlin: "#a97bff",
};

export function fakeProfile(slug: string): RepoProfile {
  const seed = hash32(slug);
  const r = mulberry32(seed);
  const lang = LANGS[seed % LANGS.length];
  const names = ["src/core", "src/utils", "src/router", "lib/parser", "src/render", "packages/cli", "src/net", "tests"];
  const nc = 4 + Math.floor(r() * 5);
  const components = names.slice(0, nc).map((name) => ({ name, files: 5 + Math.floor(r() * 120), loc: 500 + Math.floor(r() * 20000), fanIn: Math.floor(r() * 6), fanOut: Math.floor(r() * 6) }));
  components.sort((a, b) => b.loc - a.loc);
  return {
    slug, description: "mock repo", stars: Math.floor(r() * 90000), primaryLanguage: lang, languages: { [lang]: 100000 },
    totalFiles: 300, totalLoc: 40000, commits: Math.floor(r() * 9000), contributors: 1 + Math.floor(r() * 300), ageDays: 300 + Math.floor(r() * 4000),
    components, heart: `${components[0].name}/index.ts`, heartFanIn: 12, edges: [[0, 1], [1, 2], [2, 0], [3, 1]],
    cycles: [[components[0].name, components[1].name, components[2].name]], maxDepth: 4, testRatio: r() * 0.4, seed,
  };
}

const WEAPONS: PlayerKit["weapon"][] = ["blaster", "smg", "shotgun", "cannon", "staff", "laser", "blade"];
const SKILLS: PlayerKit["skill"][] = ["firewall", "fork", "hotfix", "overclock", "rollback"];
function fakePlayerKit(p: RepoProfile): PlayerKit {
  const r = mulberry32(p.seed);
  const weapon = WEAPONS[p.seed % WEAPONS.length];
  const skill = SKILLS[(p.seed >>> 3) % SKILLS.length];
  const cls = { blaster: "Ranger", smg: "Gunslinger", shotgun: "Rogue", cannon: "Paladin", staff: "Mage", laser: "Engineer", blade: "Knight" }[weapon];
  return {
    repo: p.slug, title: `${p.primaryLanguage} ${cls}`, weapon, skill, maxHp: 6 + Math.floor(r() * 3), maxArmor: 4 + Math.floor(r() * 3), maxEnergy: 200,
    speed: 80, damageMul: 1, palette: [LANG_COL[p.primaryLanguage] ?? "#39ff88", `hsl(${p.seed % 360} 70% 55%)`, "#f4e9d8", "#1b1b2a"], seed: p.seed,
  };
}
const ATK_NAMES = ["rm -rf /", "Merge Conflict", "Segfault Storm", "Dependency Hell", "npm install", "Stack Overflow", "git push --force", "Null Pointer", "Race Condition", "Memory Leak"];
const ATK_KINDS: BossKit["attacks"][number]["kind"][] = ["ring", "spiral", "fan", "laser", "slam", "charge", "summon", "cascade"];
function fakeBossKit(p: RepoProfile, n: number): BossKit {
  const cyc = new Set(p.cycles.flat());
  const limbs = p.components.slice(0, 6).map((c, i) => ({ id: `limb${i}`, component: c.name, maxHp: 300 + Math.round(c.loc / 50), weakPoint: cyc.has(c.name) }));
  const name = p.slug.split("/")[1].toUpperCase();
  return {
    repo: p.slug, archetype: (["kaiju", "hydra", "mecha", "abyssal"] as const)[p.seed % 4], name: `${name}, THE ${["MONOLITH", "MICRO-HORROR", "TANGLE", "UNDYING"][p.seed % 4]}`, maxHp: 3000 * (0.6 + 0.4 * n), limbs,
    attacks: limbs.map((l, i) => ({ id: `${l.id}-${i}`, kind: ATK_KINDS[(p.seed + i) % ATK_KINDS.length], name: ATK_NAMES[(p.seed + i * 3) % ATK_NAMES.length], source: l.component, damage: 1, cooldown: 3, telegraph: 0.9, params: {} })),
    enrageAt: 0.5, speed: 20, heart: p.heart, palette: ["#2a0f2e", "#7b2fbe", "#c13cff", "#ff3d7f", "#ffd23d"], theme: (["terminal", "kernel", "web", "notebook", "enterprise", "legacy"] as const)[p.seed % 6], seed: p.seed,
  };
}

/** Kits for decorative use (landing page lineup) without a server. */
export const demoPlayerKit = (slug: string) => fakePlayerKit(fakeProfile(slug));
export const demoBossKit = (slug: string) => fakeBossKit(fakeProfile(slug), 4);

export function createMockConn(opts: ConnOpts): Conn {
  const msgFns: ((m: ServerMsg) => void)[] = [];
  const statusFns: ((s: ConnStatus) => void)[] = [];
  const mode = new URLSearchParams(location.search).get("mock") ?? "1";
  const you = opts.role === "screen" ? "screen" : "you";
  let sim: SimMod | null = null;
  const profiles = new Map<string, RepoProfile>();
  const emit = (m: ServerMsg) => setTimeout(() => msgFns.forEach((f) => f(structuredClone(m))), 0);

  const ready = (async () => {
    const s = Object.values(simGlob)[0];
    if (s) try { sim = (await s()) as SimMod; } catch (e) { console.warn("mock: sim failed", e); }
    for (const load of Object.values(fallbackGlob)) {
      try {
        const p = (await load()) as RepoProfile;
        if (p?.slug) profiles.set(p.slug, p);
      } catch { /* ignore */ }
    }
  })();
  const profile = (slug: string) => profiles.get(slug) ?? fakeProfile(slug);
  const safeGenesis = (slug: string, kit: PlayerKit | BossKit) => {
    try {
      return buildGenesisLocal(profile(slug), kit);
    } catch {
      return undefined;
    }
  };
  // PvP kits come from the sim's pvp mode (kit.pvpPower + power-scaled stats)
  const pkit0 = (slug: string) => {
    try { return sim ? sim.playerKitFromProfile(profile(slug), lobby.mode === "pvp" ? { mode: "pvp" } : undefined) : fakePlayerKit(profile(slug)); } catch { return fakePlayerKit(profile(slug)); }
  };
  const bkit0 = (slug: string, n: number) => { try { return sim ? sim.bossKitFromProfile(profile(slug), n) : fakeBossKit(profile(slug), n); } catch { return fakeBossKit(profile(slug), n); } };
  // until analysis produces CodeDNA, give mock kits some plausible code so the UI can be exercised
  const pkit = (slug: string): PlayerKit => {
    const k = pkit0(slug);
    if (lobby.mode === "edu" && !k.quality?.length) k.quality = fakeQuality(k.seed);
    if (lobby.mode === "pvp" && !k.pvpPower) k.pvpPower = fakePower(k.seed);
    const EXPR = ["for { go serve() }", "yield from app()", "unsafe { search() }", "await Promise.all(render())", "try { parse() }"];
    if (k.code?.weapon && !/[({]/.test(k.code.weapon.name)) k.code.weapon = { ...k.code.weapon, name: EXPR[k.seed % EXPR.length] };
    if (!k.code?.signature) k.code = { weapon: k.code?.weapon, tokens: ["fn", "=>", "::", "let"], signature: `${slug.split("/")[1].replace(/\W/g, "_")}_main()`, snippet: "fn parse(args: &[String]) -> Result<Config> {", identifiers: ["parse", "Config", "run"] };
    return k;
  };
  const bkit = (slug: string, n: number): BossKit => {
    const k = bkit0(slug, n);
    if (!k.code?.heartLines?.length) k.code = {
      heartLines: ["def dispatch_request(self):", "    req = request_ctx.request", "    if req.routing_exception:", "        self.raise_routing_exception(req)", "    rule = req.url_rule", "    if getattr(rule, 'provide_automatic_options'", "        return self.make_default_options_response()", "    view_args = req.view_args", "    return self.ensure_sync(self.view_functions", "        [rule.endpoint])(**view_args)"],
      snippets: ["class Flask(App):", "def wsgi_app(self, environ, start_response):"],
      todos: ["TODO: remove this in 3.0", "FIXME: this is a hack for old werkzeug", "HACK: don't ask", "XXX: race condition when reloading"],
      commits: ["fix typo in docs", "revert 'fix typo in docs'", "release 3.0.1"],
      tokens: ["def", "self", ":", "->"],
      limbSymbols: Object.fromEntries(k.limbs.map((l, i) => [l.id, [`${l.component.split("/").pop()}_handler()`, `class ${["Router", "Blueprint", "Config", "Session"][i % 4]}`, `def _${["load", "dump", "wrap"][i % 3]}()`]])),
    };
    return k;
  };

  const lobby: LobbyState = {
    room: opts.room, ownerId: "you",
    players: [
      { id: "you", name: opts.name || "you", repo: null, status: "empty", kit: null },
      { id: "b1", name: "octocat", repo: "facebook/react", status: "analyzing", kit: null },
      { id: "b2", name: "linus", repo: "torvalds/linux", status: "analyzing", kit: null },
      { id: "b3", name: "ada", repo: "rust-lang/rust", status: "analyzing", kit: null },
    ],
    boss: { repo: null, status: "empty", kit: null },
    phase: "lobby",
    mode: "battle",
  };
  // a real classroom is owned by the teacher's big screen; other mock rooms hand the projector a spectator seat
  if (opts.role === "screen") lobby.players.shift(), (lobby.ownerId = mode === "edu" || mode === "raid" ? "screen" : "b1");
  // ?mock=raid: a classroom mid "class attack" (for the raid pause UI); ?screen=1 = teacher, otherwise a student
  if (mode === "raid") {
    lobby.mode = "edu";
    lobby.ownerId = "screen"; // the teacher's projector owns a classroom; phones are students
    const loc = new URLSearchParams(location.search).get("locale");
    if (loc === "zh" || loc === "es" || loc === "fr" || loc === "en") lobby.locale = loc; // classroom language is the room's
    const plan = defaultClassroomPlan();
    const now = Date.now();
    lobby.classroom = {
      plan, phase: "raid", stepIndex: 0, attempt: 1, deadline: null, remainingMs: null, serverTime: now,
      raidEndsAt: now + 45_000, bossHp: 640, bossMaxHp: 1000, rounds: [],
      paused: new URLSearchParams(location.search).has("paused") ? { by: "screen", since: now, resumeAt: null } : null,
      rows: lobby.players.map((p, i) => ({ id: p.id, name: p.name, connected: true, status: "submitted" as const, repo: "pallets/flask", commit: "abc1234def", score: 70 + i * 5, improvement: 5, damage: 40 + i * 10, totalDamage: 120, attempts: 1 })),
    };
  }
  const pushLobby = () => emit({ t: "lobby", lobby });

  const setRepo = (id: string, repo: string, delay: number) => {
    const pl = lobby.players.find((p) => p.id === id);
    if (!pl) return;
    Object.assign(pl, { repo, status: "analyzing", kit: null, error: undefined });
    pushLobby();
    setTimeout(async () => {
      await ready;
      if (repo.includes("error")) Object.assign(pl, { status: "error", error: "404: repo not found" });
      else {
        const kit = pkit(repo);
        Object.assign(pl, { status: "ready", kit, genesis: safeGenesis(repo, kit) });
      }
      pushLobby();
    }, delay);
  };
  const setBoss = (repo: string, delay: number) => {
    lobby.boss = { repo, status: "analyzing", kit: null };
    pushLobby();
    setTimeout(async () => {
      await ready;
      const kit = bkit(repo, lobby.players.length);
      lobby.boss = { repo, status: "ready", kit, genesis: safeGenesis(repo, kit) };
      pushLobby();
    }, delay);
  };

  // ---------- match ----------
  let loop: ReturnType<typeof setInterval> | null = null;
  let lastInput: InputFrame | null = null;
  let paused: MatchState["paused"] = null;
  const startMatch = async () => {
    await ready;
    lobby.phase = "match";
    pushLobby();
    const ps = lobby.players.filter((p) => p.kit);
    const boss = lobby.boss.kit ?? bkit("lodash/lodash", ps.length);
    const edu = lobby.mode === "edu";
    let match: { step(dt: number, inputs: Map<string, InputFrame>): void; snapshot(): MatchState; autopsy(): Autopsy; readonly over: boolean };
    try {
      match = sim ? sim.createMatch(ps.map((p) => ({ id: p.id, name: p.name, kit: p.kit! })), boss) : fakeMatch(ps.map((p) => ({ id: p.id, name: p.name, kit: p.kit! })), boss);
    } catch (e) {
      console.warn("mock: real createMatch failed, using fake", e);
      match = fakeMatch(ps.map((p) => ({ id: p.id, name: p.name, kit: p.kit! })), boss);
    }
    // ?mock=review: start the boss just above the phase-2 threshold to reach CODE REVIEW quickly
    if (mode === "review") {
      const st = (match as unknown as { state?: MatchState }).state;
      if (st?.boss) st.boss.hp = st.boss.maxHp * 0.505;
    }
    const realRoyale = lobby.mode === "pvp" && !!sim && new URLSearchParams(location.search).has("real");
    type BotFactory = (seed: number) => (s: MatchState, p: PlayerState) => InputFrame;
    let createBot = null as BotFactory | null;
    if (realRoyale) {
      try {
        match = sim!.createMatch(ps.map((p) => ({ id: p.id, name: p.name, kit: p.kit! })), null, { mode: "pvp" });
        const load = Object.values(botsGlob)[0];
        if (load) createBot = ((await load()) as { createBot: BotFactory }).createBot;
      } catch (e) {
        console.warn("mock: real royale unavailable", e);
      }
    }
    const bots = new Map(ps.filter((p) => p.id !== "you").map((p, i) => [p.id, createBot?.(i + 1) ?? null]));
    // ?mock=royale: dress the boss sim as a last-one-standing royale (scripted knockouts + shrinking GC zone)
    // you go out ~25s in (spectator view) unless &win=1
    const royale = lobby.mode === "pvp" && !realRoyale ? mockRoyale(ps.map((p) => ({ id: p.id, name: p.name, repo: p.repo ?? p.kit!.repo, kit: p.kit! })), !new URLSearchParams(location.search).has("win")) : null;
    let royaleEnded = false;
    const rnd = mulberry32(7);
    const botMove = new Map<string, [number, number]>();
    let tick = 0;
    let seq = 0;
    let evBuf: GameEvent[] = [];
    loop = setInterval(() => {
      const inputs = new Map<string, InputFrame>();
      for (const p of ps) {
        if (p.id === "you" && lastInput) { inputs.set(p.id, lastInput); continue; }
        // read the sim's live state (snapshot() would drain its event queue)
        const bot = bots.get(p.id), st = bot ? (match as unknown as { state?: MatchState }).state : null;
        const self = st?.players.find((x) => x.id === p.id);
        if (bot && st && self) { inputs.set(p.id, bot(st, self)); continue; }
        if (tick % 30 === 0 || !botMove.has(p.id)) botMove.set(p.id, [rnd() * 2 - 1, rnd() * 2 - 1]);
        inputs.set(p.id, { seq: seq++, move: botMove.get(p.id)!, aim: null, fire: true, dash: rnd() < 0.01, skill: rnd() < 0.005, source: "keyboard" });
      }
      if (paused && paused.resumeAt !== null && Date.now() >= paused.resumeAt) paused = null;
      if (!paused) match.step(1 / 30, inputs);
      if (lastInput) lastInput = { ...lastInput, dash: false, skill: false };
      tick++;
      const snap = { ...match.snapshot(), paused };
      evBuf.push(...snap.events);
      // 20 Hz: send 2 of every 3 ticks
      if (tick % 3 !== 2) {
        // edu mock: dress the fake boss match as a classroom brawl (no boss, PvP scoreboard, 2x heroes)
        const st = royale ? royale.dress(snap) : edu ? { ...snap, mode: "edu" as const, boss: null, heroScale: 2, pvp: mockPvp(snap) } : snap;
        emit({ t: "snapshot", state: { ...st, events: evBuf }, ack: lastInput?.seq ?? 0 });
        evBuf = [];
      }
      if (royale?.winner && !royaleEnded) {
        royaleEnded = true;
        setTimeout(() => {
          clearInterval(loop!);
          loop = null;
          lobby.phase = "autopsy";
          emit({ t: "autopsy", result: royale.autopsy() });
          pushLobby();
        }, 2600);
      }
      if (match.over && !royale) {
        clearInterval(loop!);
        loop = null;
        setTimeout(() => {
          lobby.phase = "autopsy";
          emit({ t: "autopsy", result: match.autopsy() });
          pushLobby();
        }, 600);
      }
    }, 1000 / 30);
  };

  const handle = (m: ClientMsg) => {
    switch (m.t) {
      case "hello":
        emit({ t: "welcome", you, token: "mock-token", lobby });
        if (opts.role === "player") {
          setTimeout(() => setRepo("b1", "facebook/react", 1200), 50);
          setTimeout(() => setRepo("b2", "torvalds/linux", 2600), 50);
          setTimeout(() => setRepo("b3", "rust-lang/rust", 4000), 50);
        } else {
          setTimeout(() => setRepo("b1", "facebook/react", 800), 50);
          setTimeout(() => setRepo("b2", "torvalds/linux", 2000), 50);
          setTimeout(() => setRepo("b3", "rust-lang/rust", 3000), 50);
          setTimeout(() => setBoss("pallets/flask", 3500), 50);
        }
        if (mode === "edu" || mode === "edu-match" || mode === "edu-autopsy") {
          lobby.mode = "edu";
          for (const p of lobby.players) if (p.kit) p.kit.quality = fakeQuality(p.kit.seed);
        }
        if (mode === "edu-match" || mode === "edu-autopsy") {
          setTimeout(async () => {
            await ready;
            if (opts.role === "player") Object.assign(lobby.players[0], { repo: "golang/go", status: "ready", kit: pkit("golang/go") });
            for (const p of lobby.players) if (p.repo && !p.kit) Object.assign(p, { status: "ready", kit: pkit(p.repo) });
            if (mode === "edu-autopsy") {
              lobby.phase = "autopsy";
              pushLobby();
              emit({ t: "autopsy", result: fakeEduAutopsy(lobby) });
            } else startMatch();
          }, 100);
        }
        if (mode === "royale" || mode === "royale-autopsy" || mode === "royale-lobby") {
          lobby.mode = "pvp";
          for (let i = 0; i < 4; i++) {
            const repo = MOCK_REPOS[(i + 3) % MOCK_REPOS.length];
            lobby.players.push({ id: `bot${i}`, name: `bot-${i + 1}`, repo, status: "analyzing", kit: null, bot: true });
          }
          setTimeout(async () => {
            await ready;
            // &norepo=1: the host has no eligible repo -> they spectate (the server allows a 2+ fighter royale without them)
            if (opts.role === "player" && !new URLSearchParams(location.search).has("norepo")) Object.assign(lobby.players[0], { repo: "octocat/hackpsu-kaiju", status: "ready", kit: pkit("octocat/hackpsu-kaiju") });
            for (const p of lobby.players) if (p.repo && !p.kit) Object.assign(p, { status: "ready", kit: pkit(p.repo) });
            if (mode === "royale-autopsy") {
              const r = mockRoyale(lobby.players.map((p) => ({ id: p.id, name: p.name, repo: p.repo!, kit: p.kit! })), true);
              lobby.phase = "autopsy";
              pushLobby();
              emit({ t: "autopsy", result: r.finish() });
            } else if (mode === "royale") startMatch();
            else pushLobby();
          }, 100);
        }
        if (mode === "match" || mode === "autopsy" || mode === "review") {
          setTimeout(async () => {
            await ready;
            if (opts.role === "player") Object.assign(lobby.players[0], { repo: "golang/go", status: "ready", kit: pkit("golang/go") });
            for (const p of lobby.players) if (p.repo && !p.kit) Object.assign(p, { status: "ready", kit: pkit(p.repo) });
            const bk = bkit("lodash/lodash", lobby.players.length);
            lobby.boss = { repo: "lodash/lodash", status: "ready", kit: bk, genesis: safeGenesis("lodash/lodash", bk) };
            if (mode === "autopsy") {
              lobby.phase = "autopsy";
              pushLobby();
              emit({ t: "autopsy", result: fakeAutopsy(lobby) });
            } else startMatch();
          }, 100);
        }
        break;
      case "setRepo": {
        const repo = normalizeRepo(m.repo);
        // PvP: like the server, verify ownership first (mock: octocat/* is yours, except the fork dotfiles)
        if (lobby.mode === "pvp" && (!repo.startsWith("octocat/") || repo === "octocat/dotfiles")) {
          const me = lobby.players.find((p) => p.id === "you");
          if (!me) break;
          Object.assign(me, { repo, status: "analyzing", kit: null, error: undefined, progress: { stage: "clone", pct: 0 } });
          pushLobby();
          setTimeout(() => {
            Object.assign(me, { status: "error", progress: undefined, error: repo === "octocat/dotfiles" ? "PvP needs your own non-fork repository: forks don't count." : "That repository is not yours. PvP needs your own non-fork repository, or a public repository you maintain or administer." });
            pushLobby();
          }, 900);
          break;
        }
        setRepo("you", repo, 2200);
        break;
      }
      case "setBoss":
        setBoss(normalizeRepo(m.repo), 2600);
        break;
      case "start": {
        if (lobby.mode === "pvp") {
          const pending = lobby.players.filter((p) => p.status === "analyzing");
          const fighters = lobby.players.filter((p) => p.status === "ready" && p.kit).length;
          const err = pending.length ? `Wait for ${pending.map((p) => p.name).join(", ")} to finish analysis.` : fighters < 2 || fighters > 8 ? "PvP needs 2–8 ready fighters." : "";
          if (err) { emit({ t: "error", message: err }); break; }
        }
        startMatch();
        break;
      }
      case "input":
        lastInput = m.frame;
        break;
      case "pause":
        if (m.paused) paused = { by: you, since: Date.now(), resumeAt: null };
        else if (paused) paused = { ...paused, resumeAt: Date.now() + 3000 };
        if (lobby.classroom) {
          const c = lobby.classroom;
          if (paused && paused.resumeAt === null && c.raidEndsAt) c.paused = { ...paused };
          else if (paused && c.paused) {
            c.paused = { ...c.paused, resumeAt: paused.resumeAt };
            setTimeout(() => { if (c.raidEndsAt && c.paused) c.raidEndsAt += Date.now() - c.paused.since; c.paused = null; paused = null; c.serverTime = Date.now(); pushLobby(); }, 3000);
          }
          c.serverTime = Date.now();
          pushLobby();
        }
        break;
      case "setMode":
        lobby.mode = m.mode;
        for (const p of lobby.players) if (p.kit && p.repo) p.kit = pkit(p.repo); // kits are mode-specific (edu quality, pvp power)
        for (const p of lobby.players) if (p.kit) p.kit.quality = m.mode === "edu" ? fakeQuality(p.kit.seed) : undefined;
        pushLobby();
        break;
      case "setBots": {
        lobby.players = lobby.players.filter((p) => !p.bot);
        for (let i = 0; i < m.count; i++) {
          const repo = MOCK_REPOS[(i + 3) % MOCK_REPOS.length];
          lobby.players.push({ id: `bot${i}`, name: `bot-${i + 1}`, repo, status: "ready", kit: pkit(repo), bot: true });
        }
        pushLobby();
        break;
      }
      case "rematch":
        lobby.phase = "lobby";
        pushLobby();
        break;
    }
  };

  setTimeout(() => statusFns.forEach((f) => f("open")), 0);
  setTimeout(() => handle({ t: "hello", room: opts.room, role: opts.role, name: opts.name }), 10);
  return {
    send: (m) => handle(m),
    onMessage: (f) => void msgFns.push(f),
    onStatus: (f) => void statusFns.push(f),
    reclaim: () => {},
    setName: (n) => {
      if (lobby.players[0]?.id === "you") lobby.players[0].name = n;
      pushLobby();
    },
    close: () => loop && clearInterval(loop),
  };
}

function fakePower(seed: number): NonNullable<PlayerKit["pvpPower"]> {
  const r = mulberry32(seed ^ 0x9e37);
  const parts = [["Tests", 0.16], ["Modularity", 0.12], ["Cohesion", 0.12], ["Docs", 0.12], ["Debt hygiene", 0.08], ["Stars", 0.12], ["Contributors", 0.1], ["Analyzed LOC", 0.1], ["Commit activity", 0.08]] as const;
  const rows = parts.map(([label, weight]) => ({ label, value: Math.round(r() * 1000) / 10, weight }));
  return { score: Math.round(rows.reduce((s, x) => s + x.value * x.weight, 0) * 10) / 10, parts: rows };
}
const GR = ["A", "B", "C", "D", "F"] as const;
function fakeQuality(seed: number): QualityStat[] {
  const r = mulberry32(seed);
  const g = () => GR[Math.floor(r() * 4)];
  return [
    { stat: "armor", value: 4, grade: g(), signal: `tests: ${Math.round(r() * 35)}% of files`, tip: "add tests for src/parser to raise armor" },
    { stat: "hp", value: 6, grade: g(), signal: `${Math.round(5 + r() * 60)}k LOC · README ✓`, tip: "a README that explains setup counts too" },
    { stat: "speed", value: 85, grade: g(), signal: `avg fan-out ${(1 + r() * 4).toFixed(1)}`, tip: "split utils/ so fewer modules import everything" },
    { stat: "damage", value: 1, grade: g(), signal: `avg function ${Math.round(8 + r() * 40)} lines`, tip: "break up the 300-line handler() into smaller functions" },
    { stat: "energy", value: 180, grade: g(), signal: `comments: ${Math.round(r() * 25)}% of lines`, tip: "document the public API" },
    { stat: "weakness", value: 0.1, grade: g(), signal: `${Math.floor(r() * 3)} circular deps · ${Math.floor(r() * 20)} TODOs`, tip: "break the cycle api <-> db" },
  ];
}
function mockPvp(s: MatchState): PvpState {
  const scores: PvpState["scores"] = {};
  for (const p of s.players) scores[p.id] = { kos: Math.floor(p.stats.damage / 120), downs: 0, damage: p.stats.damage, roundWins: 0 };
  const round = Math.min(3, 1 + Math.floor(s.t / 75));
  return { round, rounds: 3, roundEndsAt: round * 75, scores, leader: null };
}
/** Mock PvP royale on top of any match snapshot: a knockout every 5s from 0:10 (you at ~0:25 unless &win=1, then you win),
 *  a GC zone that shrinks 300 → 80 px over 0:12–0:40, KOs / placements / killedBy and a royale autopsy. */
function mockRoyale(heroes: { id: string; name: string; repo: string; kit: PlayerKit }[], youDie: boolean) {
  const rnd = mulberry32(99);
  const alive = heroes.map((p) => p.id);
  const placements: Record<string, number> = {};
  const killedBy: Record<string, string | null> = {};
  const kos: Record<string, number> = {};
  const elims: { id: string; by: string | null; t: number; weapon?: string }[] = [];
  let next = 10;
  let winner: string | null = null;
  let t = 0;
  const knockOut = (now: number) => {
    const others = alive.filter((id) => id !== "you");
    const victim = youDie && alive.includes("you") && now >= 24.5 ? "you" : others[Math.floor(rnd() * others.length)];
    if (!victim) return;
    const killers = alive.filter((id) => id !== victim);
    const by = rnd() < 0.2 ? null : killers[Math.floor(rnd() * killers.length)] ?? null;
    placements[victim] = alive.length;
    alive.splice(alive.indexOf(victim), 1);
    killedBy[victim] = by;
    if (by) kos[by] = (kos[by] ?? 0) + 1;
    elims.push({ id: victim, by, t: now, weapon: by ? heroes.find((h) => h.id === by)?.kit.code?.weapon?.name : undefined });
    if (alive.length === 1) (winner = alive[0]), (placements[winner] = 1);
  };
  const zoneAt = (now: number) => ({ cx: 250, cy: 150, r: now < 12 ? 300 : now < 40 ? 300 - (220 * (now - 12)) / 28 : 80, targetR: 80, shrinkStart: 12, shrinkEnd: 40, dps: 1 });
  const autopsy = (): Autopsy => ({
    mode: "pvp", victory: true, duration: t, boss: null, mvp: winner,
    players: heroes.map((p) => ({ id: p.id, name: p.name, repo: p.repo, stats: { damage: 120 + (kos[p.id] ?? 0) * 160 + Math.round(rnd() * 90), bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false } })),
    ranking: heroes
      .map((p) => ({ id: p.id, name: p.name, repo: p.repo, kos: kos[p.id] ?? 0, damage: 120 + (kos[p.id] ?? 0) * 160, roundWins: 0, quality: [], place: placements[p.id] ?? 1, killedBy: killedBy[p.id] ?? null }))
      .sort((a, b) => a.place - b.place),
    royale: { placements, eliminations: elims, winner },
  } as Autopsy);
  return {
    get winner() { return winner; },
    dress(snap: MatchState): MatchState {
      t = snap.t;
      if (snap.status === "fighting" && t >= next && alive.length > 1) {
        next = t + 5;
        knockOut(t);
      }
      const out = new Set(heroes.map((p) => p.id).filter((id) => !alive.includes(id)));
      const players = snap.players.map((p) => (out.has(p.id) ? { ...p, alive: false, eliminated: true, killedBy: killedBy[p.id], hp: 0 } : { ...p, alive: true, eliminated: false, hp: Math.max(1, p.hp) }));
      const scores: PvpState["scores"] = {};
      for (const p of players) scores[p.id] = { kos: kos[p.id] ?? 0, downs: 0, damage: p.stats.damage, roundWins: 0 };
      const leader = [...alive].sort((a, b) => (kos[b] ?? 0) - (kos[a] ?? 0))[0] ?? null;
      return {
        ...snap, mode: "pvp", boss: null, heroScale: 1, hazards: [], minions: [], perkOffer: null, players,
        bullets: snap.bullets.filter((b) => b.owner !== "boss"),
        events: snap.events.filter((e) => e.type === "hit" && e.target !== "boss"),
        status: winner ? "victory" : snap.status,
        pvp: { round: 1, rounds: 1, roundEndsAt: 999, scores, leader, royale: { alive: [...alive], placements: { ...placements }, zone: zoneAt(t), winner } },
      };
    },
    autopsy,
    /** Play the whole thing instantly (royale-autopsy). */
    finish(): Autopsy {
      while (alive.length > 1) knockOut((t += 9));
      return autopsy();
    },
  };
}

function fakeEduAutopsy(lobby: LobbyState): Autopsy {
  const ps = lobby.players.filter((p) => p.kit);
  return {
    mode: "edu", victory: false, duration: 225, boss: null, mvp: ps[0]?.id ?? null,
    players: ps.map((p, i) => ({ id: p.id, name: p.name, repo: p.repo!, stats: { damage: 900 - i * 120, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false } })),
    ranking: ps.map((p, i) => ({ id: p.id, name: p.name, repo: p.repo!, kos: 9 - i * 2, damage: 900 - i * 120, roundWins: Math.max(0, 2 - i), quality: p.kit!.quality ?? fakeQuality(p.kit!.seed) })),
  };
}

function fakeAutopsy(lobby: LobbyState): Autopsy {
  const kit = lobby.boss.kit!;
  return {
    mode: "battle", victory: true, duration: 163.4,
    boss: {
      repo: kit.repo, heart: "src/core/index.ts", busFactor: 2,
      limbs: kit.limbs.map((l, i) => ({ component: l.component, broken: i % 2 === 0, damageTaken: 1200 - i * 170, maintainers: [5, 2, 7, 3, 4][i % 5], fragile: false, issues: [] })),
      repoIssues: [
        { number: 5812, title: "docs: clarify _.debounce leading/trailing", url: `https://github.com/${kit.repo}/issues/5812`, labels: ["good first issue"] },
        { number: 5790, title: "test: cover _.get with symbol keys", url: `https://github.com/${kit.repo}/issues/5790`, labels: ["help wanted"] },
      ],
    },
    players: lobby.players.filter((p) => p.kit).map((p, i) => ({ id: p.id, name: p.name, repo: p.repo!, stats: { damage: 2400 - i * 400, bestCombo: 4 - i, limbsBroken: 2 - (i % 2), revives: i % 3, killingBlow: i === 0 } })),
    mvp: lobby.players[0].id,
  };
}

// ---------- a tiny fake sim (only used when sim/ hasn't landed) ----------
function fakeMatch(plist: { id: string; name: string; kit: PlayerKit }[], kit: BossKit) {
  let t = -3;
  let bid = 1;
  const rnd = mulberry32(kit.seed);
  const players: PlayerState[] = plist.map((p, i) => ({
    id: p.id, name: p.name, x: 80 + (i % 2) * 30, y: 80 + i * 40, vx: 0, vy: 0, facing: [1, 0], hp: p.kit.maxHp, armor: p.kit.maxArmor, energy: p.kit.maxEnergy,
    alive: true, downedFor: 0, reviveProgress: 0, skillCd: 0, dashCd: 0, invuln: 0, buffs: [], perks: [], kit: p.kit,
    stats: { damage: 0, bestCombo: 0, limbsBroken: 0, revives: 0, killingBlow: false },
  }));
  const boss: BossState = { x: 360, y: 140, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1, limbs: kit.limbs.map((l) => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })), casting: null, targetPlayer: null, enraged: false, kit, pose: { name: "idle", t: 0, total: 1, dir: [-1, 0] }, airborne: false,
    regions: [{ id: "heart", x: 360, y: 140, r: 14 }, ...kit.limbs.map((l, i) => ({ id: l.id, x: 360 + Math.cos(i * 1.3) * 40, y: 140 + Math.sin(i * 1.3) * 34, r: 12 }))] };
  let bullets: Bullet[] = [];
  let hazards: Hazard[] = [];
  const minions: Minion[] = [];
  let events: GameEvent[] = [];
  let atkCd = 2;
  let status: MatchState["status"] = "countdown";
  const fireCd = new Map<string, number>();
  const limbDmg = new Map<string, number>();
  let over = false;
  let lastHit = new Map<string, { by: string; t: number; n: number }>();

  return {
    get over() { return over; },
    step(dt: number, inputs: Map<string, InputFrame>) {
      t += dt;
      if (status === "countdown") { if (t >= 0) status = "fighting"; else return; }
      if (status !== "fighting") return;
      const cyc = t % 12;
      const special = kit.archetype === "hydra" || kit.archetype === "abyssal";
      boss.airborne = special && cyc > 8 && cyc < 11;
      const pn = boss.casting ? (boss.casting.t < boss.casting.total * 0.8 ? "windup" : "attack") : boss.airborne ? (kit.archetype === "hydra" ? "fly" : "burrow") : "walk";
      if (boss.pose.name !== pn) boss.pose = { name: pn, t: 0, total: pn === "walk" ? 1.2 : 1, dir: [-1, 0] };
      else boss.pose.t = (boss.pose.t + dt) % boss.pose.total;
      const ox = boss.x, oy = boss.y;
      boss.x = 360 + Math.sin(t * 0.4) * 30;
      boss.y = 144 + Math.sin(t * 0.7) * 20;
      for (const rg of boss.regions) { rg.x += boss.x - ox; rg.y += boss.y - oy; }
      for (const p of players) {
        const inp = inputs.get(p.id);
        p.invuln = Math.max(0, p.invuln - dt);
        p.skillCd = Math.max(0, p.skillCd - dt);
        p.dashCd = Math.max(0, p.dashCd - dt);
        if (!p.alive) {
          p.downedFor += dt;
          p.reviveProgress = Math.min(1, p.downedFor / 4);
          if (p.reviveProgress >= 1) { p.alive = true; p.hp = Math.ceil(p.kit.maxHp / 2); p.invuln = 1.5; p.downedFor = 0; p.reviveProgress = 0; events.push({ type: "revived", player: p.id, by: players[0].id }); }
          continue;
        }
        if (!inp) continue;
        let sp = p.kit.speed;
        if (inp.dash && p.dashCd <= 0) { p.dashCd = 1; p.invuln = 0.3; sp *= 6; }
        if (inp.skill && p.skillCd <= 0) { p.skillCd = 8; p.buffs = [p.kit.skill]; events.push({ type: "skill", player: p.id, skill: p.kit.skill }); setTimeout(() => (p.buffs = []), 3000); }
        p.vx = inp.move[0] * sp; p.vy = inp.move[1] * sp;
        p.x = Math.max(12, Math.min(ARENA_W - 12, p.x + p.vx * dt));
        p.y = Math.max(24, Math.min(ARENA_H - 12, p.y + p.vy * dt));
        const ax = boss.x - p.x, ay = boss.y - p.y, al = Math.hypot(ax, ay) || 1;
        p.facing = inp.aim ?? [ax / al, ay / al];
        const cd = (fireCd.get(p.id) ?? 0) - dt;
        fireCd.set(p.id, cd);
        if (inp.fire && cd <= 0) {
          fireCd.set(p.id, 0.22);
          bullets.push({ id: bid++, owner: p.id, kind: p.kit.weapon, x: p.x, y: p.y, vx: p.facing[0] * 220, vy: p.facing[1] * 220, r: 3 });
        }
        p.armor = Math.min(p.kit.maxArmor, p.armor + dt * 0.3);
      }
      atkCd -= dt;
      if (!boss.casting && atkCd <= 0) {
        const live = kit.attacks.filter((a) => !boss.limbs.find((l) => l.id === kit.limbs.find((k) => k.component === a.source)?.id)?.broken);
        const atk = live[Math.floor(rnd() * live.length)] ?? kit.attacks[0];
        const tgt = players.filter((p) => p.alive)[Math.floor(rnd() * players.length)] ?? players[0];
        boss.casting = { attackId: atk.id, t: 0, total: 1, target: [tgt.x, tgt.y] };
        boss.targetPlayer = tgt.id;
        events.push({ type: "telegraph", attackId: atk.id, name: atk.name, targetPlayer: tgt.id });
        if (atk.kind === "slam" || atk.kind === "laser" || atk.kind === "cascade") hazards.push({ id: bid++, kind: atk.kind === "laser" ? "laser" : atk.kind === "cascade" ? "cascade" : "slam", x: atk.kind === "laser" ? boss.x : tgt.x, y: atk.kind === "laser" ? boss.y : tgt.y, r: atk.kind === "laser" ? 8 : 34, angle: Math.atan2(tgt.y - boss.y, tgt.x - boss.x), t: 0, total: 1.6, armed: false });
        atkCd = boss.enraged ? 1.6 : 2.6;
      }
      if (boss.casting) {
        boss.casting.t += dt;
        if (boss.casting.t >= boss.casting.total) {
          const n = 18;
          const off = rnd() * 6;
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; bullets.push({ id: bid++, owner: "boss", kind: "ring", x: boss.x, y: boss.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, r: 4 }); }
          boss.casting = null;
        }
      }
      for (const z of hazards) { z.t += dt; z.armed = z.t >= 1; }
      hazards = hazards.filter((z) => z.t < z.total);
      const keep: Bullet[] = [];
      for (const b of bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < 0 || b.y < 0 || b.x > ARENA_W || b.y > ARENA_H) continue;
        if (b.owner !== "boss") {
          if (Math.hypot(b.x - boss.x, b.y - boss.y) < 40) {
            const live = boss.limbs.filter((l) => !l.broken);
            const limb = live[Math.floor(rnd() * live.length)];
            const p = players.find((pp) => pp.id === b.owner)!;
            const lh = limb ? lastHit.get(limb.id) : undefined;
            const combo = lh && lh.by !== p.id && t - lh.t < 0.5 ? lh.n + 1 : 1;
            const dmg = Math.round((8 + rnd() * 6) * (combo > 1 ? 1 + combo * 0.25 : 1));
            boss.hp -= dmg;
            p.stats.damage += dmg;
            p.stats.bestCombo = Math.max(p.stats.bestCombo, combo);
            if (limb) {
              lastHit.set(limb.id, { by: p.id, t, n: combo });
              limb.hp -= dmg * 1.6;
              limbDmg.set(limb.id, (limbDmg.get(limb.id) ?? 0) + dmg);
              if (limb.hp <= 0) { limb.hp = 0; limb.broken = true; p.stats.limbsBroken++; events.push({ type: "limbBroken", limb: limb.id, by: p.id }); }
            }
            events.push({ type: "hit", target: "boss", limb: limb?.id, amount: dmg, x: b.x, y: b.y, combo: combo > 1 ? combo : undefined });
            if (boss.hp <= kit.maxHp * 0.5 && boss.phase === 1) { boss.phase = 2; boss.enraged = true; events.push({ type: "phase", phase: 2 }); }
            if (boss.hp <= kit.maxHp * 0.15 && boss.phase === 2) { boss.phase = 3; events.push({ type: "phase", phase: 3 }); }
            if (boss.hp <= 0) { boss.hp = 0; status = "victory"; over = true; p.stats.killingBlow = true; events.push({ type: "victory" }); }
            continue;
          }
        } else {
          const hit = players.find((p) => p.alive && p.invuln <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < 7);
          if (hit) {
            if (hit.armor >= 1) hit.armor -= 1; else hit.hp -= 1;
            hit.invuln = 0.6;
            events.push({ type: "hit", target: hit.id, amount: 1, x: hit.x, y: hit.y });
            if (hit.hp <= 0) { hit.hp = 0; hit.alive = false; events.push({ type: "downed", player: hit.id }); }
            if (players.every((p) => !p.alive)) { status = "defeat"; over = true; events.push({ type: "defeat" }); }
            continue;
          }
        }
        keep.push(b);
      }
      bullets = keep;
    },
    snapshot(): MatchState {
      const s: MatchState = structuredClone({ t: Math.max(0, t), status, players, boss, bullets, hazards, minions, events, obstacles: [], pickups: [], perkOffer: null, mode: "battle", heroScale: 1, pvp: null });
      if (status === "countdown") s.t = t;
      events = [];
      return s;
    },
    autopsy(): Autopsy {
      const best = [...players].sort((a, b) => b.stats.damage - a.stats.damage)[0];
      return {
        mode: "battle", victory: status === "victory", duration: t,
        boss: { repo: kit.repo, heart: "src/core/index.ts", limbs: kit.limbs.map((l, i) => ({ component: l.component, broken: boss.limbs[i].broken, damageTaken: Math.round(limbDmg.get(l.id) ?? 0) })) },
        players: players.map((p) => ({ id: p.id, name: p.name, repo: p.kit.repo, stats: p.stats })),
        mvp: best?.id ?? null,
      };
    },
  };
}
