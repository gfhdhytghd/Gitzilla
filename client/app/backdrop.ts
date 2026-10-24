// Animated full-screen pixel backdrop for landing/lobby: themed arena floor, a looming boss silhouette,
// a lineup of tiny heroes and falling code glyphs. Renders at 480x288 and is CSS-upscaled (pixelated).
import type { ArenaTheme, BossKit, PlayerKit } from "../../shared/types";
import { ARENA_H, ARENA_W } from "../../shared/types";
import { R, loadModules, safe } from "./renderers";

const THEMES: ArenaTheme[] = ["terminal", "web", "kernel", "notebook", "enterprise", "legacy"];
const RAIN = "01{}[]<>;=/*#$&|!?~".split("");

export interface Backdrop {
  canvas: HTMLCanvasElement;
  setBoss(kit: BossKit | null, reveal: boolean): void;
  setHeroes(kits: PlayerKit[]): void;
  setTheme(theme: ArenaTheme | null): void;
  destroy(): void;
}

export function createBackdrop(opts: { dim?: number; boss?: BossKit | null; heroes?: PlayerKit[]; themeCycle?: boolean } = {}): Backdrop {
  const canvas = document.createElement("canvas");
  canvas.className = "backdrop";
  canvas.width = ARENA_W;
  canvas.height = ARENA_H;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = false;

  let boss = opts.boss ?? null;
  let bossReveal = false;
  let bossSprite: { sil: HTMLCanvasElement; full: HTMLCanvasElement } | null = null;
  let heroes: { kit: PlayerKit; img: HTMLCanvasElement }[] = [];
  let fixedTheme: ArenaTheme | null = null;
  let themeIdx = 0;
  let themeT = 0;
  let revealT = 0;

  const drops = Array.from({ length: 42 }, (_, i) => ({ x: (i * 11.7) % ARENA_W, y: Math.random() * ARENA_H, v: 18 + Math.random() * 40, c: RAIN[i % RAIN.length] }));

  const makeBoss = () => {
    bossSprite = null;
    if (!boss) return;
    const size = 168;
    let full: HTMLCanvasElement;
    try {
      full = R.bossPortrait(boss, size);
    } catch {
      return;
    }
    const sil = document.createElement("canvas");
    sil.width = full.width;
    sil.height = full.height;
    const sg = sil.getContext("2d")!;
    sg.drawImage(full, 0, 0);
    sg.globalCompositeOperation = "source-in";
    sg.fillStyle = "#07040c";
    sg.fillRect(0, 0, sil.width, sil.height);
    bossSprite = { sil, full };
  };
  makeBoss();

  const setHeroes = (kits: PlayerKit[]) => {
    heroes = kits.slice(0, 8).map((kit) => {
      let img: HTMLCanvasElement;
      try {
        img = R.playerPortrait(kit, 32);
      } catch {
        img = document.createElement("canvas");
      }
      return { kit, img };
    });
  };
  setHeroes(opts.heroes ?? []);

  // renderers may still be loading: rebuild sprites once the real ones land
  loadModules().then(() => {
    makeBoss();
    setHeroes(heroes.map((x) => x.kit));
  });

  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    themeT += dt;
    if (opts.themeCycle && !fixedTheme && themeT > 7) {
      themeT = 0;
      themeIdx = (themeIdx + 1) % THEMES.length;
    }
    const theme = fixedTheme ?? THEMES[themeIdx];
    safe("drawArenaBackground", R.drawArenaBackground, g, theme, 1337, time);

    // boss silhouette, breathing; reveal crossfades to full colour with a glitch band
    if (bossSprite) {
      revealT = bossReveal ? Math.min(1, revealT + dt * 0.8) : Math.max(0, revealT - dt * 2);
      const s = bossSprite;
      const breathe = Math.sin(time * 1.3) * 3;
      const x = Math.round(ARENA_W - s.full.width - 8);
      const y = Math.round(ARENA_H / 2 - s.full.height / 2 + breathe);
      g.save();
      g.globalAlpha = 0.9;
      g.drawImage(s.sil, x, y);
      if (revealT > 0) {
        const hgt = Math.round(s.full.height * revealT);
        g.drawImage(s.full, 0, 0, s.full.width, hgt, x, y, s.full.width, hgt);
        if (revealT < 1) {
          g.fillStyle = "rgba(255,51,85,.8)";
          g.fillRect(x, y + hgt, s.full.width, 2);
        }
      } else {
        // glowing eyes in the dark
        const blink = Math.sin(time * 0.7) > 0.96 ? 0 : 1;
        g.fillStyle = `rgba(255,40,70,${0.6 + 0.4 * Math.sin(time * 3)})`;
        if (blink) {
          g.fillRect(x + s.full.width * 0.38, y + s.full.height * 0.4, 3, 2);
          g.fillRect(x + s.full.width * 0.55, y + s.full.height * 0.38, 3, 2);
          g.fillRect(x + s.full.width * 0.47, y + s.full.height * 0.47, 2, 2);
        }
      }
      g.restore();
    }

    // heroes lineup facing the boss
    heroes.forEach((hh, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 40 + col * 38 + row * 6;
      const y = 70 + row * 46 + Math.round(Math.sin(time * 4 + i) * 1.5);
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(x + 8, y + 30, 16, 3);
      g.drawImage(hh.img, x, y);
    });

    // glyph rain
    g.font = '8px "Press Start 2P", monospace';
    g.textBaseline = "top";
    for (const d of drops) {
      d.y += d.v * dt;
      if (d.y > ARENA_H) {
        d.y = -10;
        d.c = RAIN[Math.floor(Math.random() * RAIN.length)];
      }
      g.fillStyle = "rgba(57,255,136,.35)";
      g.fillText(d.c, Math.round(d.x), Math.round(d.y));
      g.fillStyle = "rgba(57,255,136,.12)";
      g.fillText(d.c, Math.round(d.x), Math.round(d.y) - 9);
    }
    if (opts.dim) {
      g.fillStyle = `rgba(3,4,8,${opts.dim})`;
      g.fillRect(0, 0, ARENA_W, ARENA_H);
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    canvas,
    setBoss(kit, reveal) {
      if (kit !== boss) {
        boss = kit;
        revealT = 0;
        makeBoss();
      }
      bossReveal = reveal;
    },
    setHeroes,
    setTheme(t) {
      fixedTheme = t;
    },
    destroy: () => cancelAnimationFrame(raf),
  };
}
