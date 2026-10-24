// Offline mock server for UI development/screenshots: open any page with ?mock=1 (or ?mock=match / ?mock=autopsy).
// Uses the real sim (sim/index.ts) + fallback profiles in the browser when they exist; otherwise a tiny fake sim.
import type {
  Autopsy, BossKit, BossState, Bullet, ClientMsg, GameEvent, Hazard, InputFrame, LobbyState, MatchState, Minion,
  PlayerKit, PlayerState, RepoProfile, ServerMsg,
} from "../../shared/types";
import { ARENA_H, ARENA_W } from "../../shared/types";
import type { Conn, ConnOpts, ConnStatus } from "./net";
import { hash32, mulberry32, normalizeRepo } from "./util";

interface SimMod {
  playerKitFromProfile(p: RepoProfile): PlayerKit;
  bossKitFromProfile(p: RepoProfile, n: number): BossKit;
  createMatch(players: { id: string; name: string; kit: PlayerKit }[], boss: BossKit): {
    step(dt: number, inputs: Map<string, InputFrame>): void;
    snapshot(): MatchState;
    autopsy(): Autopsy;
    readonly over: boolean;
  };
}
const simGlob = import.meta.glob("../../sim/index.ts");
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
    repo: p.slug, name: `${name}, THE ${["MONOLITH", "MICRO-HORROR", "TANGLE", "UNDYING"][p.seed % 4]}`, maxHp: 3000 * (0.6 + 0.4 * n), limbs,
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
  const pkit0 = (slug: string) => { try { return sim ? sim.playerKitFromProfile(profile(slug)) : fakePlayerKit(profile(slug)); } catch { return fakePlayerKit(profile(slug)); } };
  const bkit0 = (slug: string, n: number) => { try { return sim ? sim.bossKitFromProfile(profile(slug), n) : fakeBossKit(profile(slug), n); } catch { return fakeBossKit(profile(slug), n); } };
  // until analysis produces CodeDNA, give mock kits some plausible code so the UI can be exercised
  const pkit = (slug: string): PlayerKit => {
    const k = pkit0(slug);
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
  if (opts.role === "screen") lobby.players.shift(), (lobby.ownerId = "b1");
  const pushLobby = () => emit({ t: "lobby", lobby });

  const setRepo = (id: string, repo: string, delay: number) => {
    const pl = lobby.players.find((p) => p.id === id);
    if (!pl) return;
    Object.assign(pl, { repo, status: "analyzing", kit: null, error: undefined });
    pushLobby();
    setTimeout(async () => {
      await ready;
      if (repo.includes("error")) Object.assign(pl, { status: "error", error: "404: repo not found" });
      else Object.assign(pl, { status: "ready", kit: pkit(repo) });
      pushLobby();
    }, delay);
  };
  const setBoss = (repo: string, delay: number) => {
    lobby.boss = { repo, status: "analyzing", kit: null };
    pushLobby();
    setTimeout(async () => {
      await ready;
      lobby.boss = { repo, status: "ready", kit: bkit(repo, lobby.players.length) };
      pushLobby();
    }, delay);
  };

  // ---------- match ----------
  let loop: ReturnType<typeof setInterval> | null = null;
  let lastInput: InputFrame | null = null;
  const startMatch = async () => {
    await ready;
    lobby.phase = "match";
    pushLobby();
    const ps = lobby.players.filter((p) => p.kit);
    const boss = lobby.boss.kit ?? bkit("lodash/lodash", ps.length);
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
    const rnd = mulberry32(7);
    const botMove = new Map<string, [number, number]>();
    let tick = 0;
    let seq = 0;
    let evBuf: GameEvent[] = [];
    loop = setInterval(() => {
      const inputs = new Map<string, InputFrame>();
      for (const p of ps) {
        if (p.id === "you" && lastInput) { inputs.set(p.id, lastInput); continue; }
        if (tick % 30 === 0 || !botMove.has(p.id)) botMove.set(p.id, [rnd() * 2 - 1, rnd() * 2 - 1]);
        inputs.set(p.id, { seq: seq++, move: botMove.get(p.id)!, aim: null, fire: true, dash: rnd() < 0.01, skill: rnd() < 0.005, source: "keyboard" });
      }
      match.step(1 / 30, inputs);
      if (lastInput) lastInput = { ...lastInput, dash: false, skill: false };
      tick++;
      const snap = match.snapshot();
      evBuf.push(...snap.events);
      // 20 Hz: send 2 of every 3 ticks
      if (tick % 3 !== 2) {
        emit({ t: "snapshot", state: { ...snap, events: evBuf }, ack: lastInput?.seq ?? 0 });
        evBuf = [];
      }
      if (match.over) {
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
        if (mode === "match" || mode === "autopsy" || mode === "review") {
          setTimeout(async () => {
            await ready;
            if (opts.role === "player") Object.assign(lobby.players[0], { repo: "golang/go", status: "ready", kit: pkit("golang/go") });
            for (const p of lobby.players) if (p.repo && !p.kit) Object.assign(p, { status: "ready", kit: pkit(p.repo) });
            lobby.boss = { repo: "lodash/lodash", status: "ready", kit: bkit("lodash/lodash", lobby.players.length) };
            if (mode === "autopsy") {
              lobby.phase = "autopsy";
              pushLobby();
              emit({ t: "autopsy", result: fakeAutopsy(lobby) });
            } else startMatch();
          }, 100);
        }
        break;
      case "setRepo":
        setRepo("you", normalizeRepo(m.repo), 2200);
        break;
      case "setBoss":
        setBoss(normalizeRepo(m.repo), 2600);
        break;
      case "start":
        startMatch();
        break;
      case "input":
        lastInput = m.frame;
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

function fakeAutopsy(lobby: LobbyState): Autopsy {
  const kit = lobby.boss.kit!;
  return {
    mode: "battle", victory: true, duration: 163.4,
    boss: { repo: kit.repo, heart: "src/core/index.ts", limbs: kit.limbs.map((l, i) => ({ component: l.component, broken: i % 2 === 0, damageTaken: 1200 - i * 170 })) },
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
  const boss: BossState = { x: 360, y: 140, hp: kit.maxHp, maxHp: kit.maxHp, phase: 1, limbs: kit.limbs.map((l) => ({ id: l.id, hp: l.maxHp, maxHp: l.maxHp, broken: false })), casting: null, targetPlayer: null, enraged: false, kit,
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
