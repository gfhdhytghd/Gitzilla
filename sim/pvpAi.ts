import type { InputFrame, MatchState, PlayerState } from '../shared/types.ts';
import { clamp, distance, random, unit } from './math.ts';
import { pvpArenaSize } from './pvp.ts';
import { WEAPONS } from './weapons.ts';
import type { ClassroomKit } from './quality.ts';

export interface PvpControllerMetrics {
  decisions: number; minReaction: number; maxReaction: number; threats: number; dodges: number;
  botTargets: number; humanTargets: number; maxAimError: number; fireFrames: number; pauseFrames: number; dashes: number; skills: number;
  mixedChoices: number; forcedBotChoices: number;
}
export type PvpController = ((state: MatchState, player: PlayerState) => InputFrame) & { metrics: PvpControllerMetrics };
export const isPvpAi = (p: PlayerState) => p.id.startsWith('bot-') || !!(p.kit as ClassroomKit).pvpAi;

/** Browser-safe input controller. The proxy is a fixed synthetic comparator, never actual-human evidence. */
export function createPvpController(seed: number, kind: 'ai' | 'human-proxy' = 'ai'): PvpController {
  const ai = kind === 'ai', rng = random(seed), side = seed & 1 ? 1 : -1;
  const metrics: PvpControllerMetrics = { decisions: 0, minReaction: Infinity, maxReaction: 0, threats: 0, dodges: 0,
    botTargets: 0, humanTargets: 0, maxAimError: 0, fireFrames: 0, pauseFrames: 0, dashes: 0, skills: 0, mixedChoices: 0, forcedBotChoices: 0 };
  let seq = 0, nextThink = ai ? 0.35 : 0.23, targetId = '', retargetAt = 0, retreat = false;
  let burst = true, burstUntil = 0.8 + rng() * 0.5, dashAt = 2.8 + rng(), skillAt = 4.5 + rng() * 2;
  const threats = new Map<number, boolean>();
  let frame: InputFrame = { seq: 0, move: [0, 0], aim: [1, 0], fire: false, dash: false, skill: false, source: 'keyboard' };
  const controller = ((s: MatchState, p: PlayerState): InputFrame => {
    if (!p.alive || p.eliminated) return { ...frame, seq: seq++, move: [0, 0], fire: false, dash: false, skill: false };
    if (s.t >= burstUntil) {
      burst = !burst;
      burstUntil = s.t + (burst ? ai ? 1.4 + rng() * 0.6 : 1 + rng() * 0.5 : ai ? 0.25 + rng() * 0.25 : 0.2 + rng() * 0.3);
    }
    const send = (edges: boolean) => {
      const fire = burst && !!targetId;
      if (fire) metrics.fireFrames++; else metrics.pauseFrames++;
      return { ...frame, seq: seq++, fire, dash: edges && frame.dash, skill: edges && frame.skill };
    };
    if (s.t < nextThink) return send(false);
    const delay = ai ? 0.35 + rng() ** 2 * 0.15 : 0.3 + rng() * 0.1;
    nextThink = s.t + delay; metrics.decisions++; metrics.minReaction = Math.min(metrics.minReaction, delay); metrics.maxReaction = Math.max(metrics.maxReaction, delay);
    const others = s.players.filter(other => other.alive && !other.eliminated && other.id !== p.id).sort((a, b) => distance(p, a) - distance(p, b));
    let target = others.find(other => other.id === targetId);
    if (!target || s.t >= retargetAt) {
      let pool = others;
      const bots = others.filter(isPvpAi), humans = others.filter(other => !isPvpAi(other));
      if (ai && bots.length && humans.length) {
        metrics.mixedChoices++;
        if (rng() < 0.5) { pool = bots; metrics.forcedBotChoices++; }
        else { const nearbyHumans = humans.filter(h => distance(p, h) < 180); pool = nearbyHumans.length ? nearbyHumans : others; }
      }
      target = pool[0]; targetId = target?.id ?? ''; retargetAt = s.t + (ai ? 1.1 + rng() * 1.2 : 0.7 + rng() * 0.5);
      if (target) { if (isPvpAi(target)) metrics.botTargets++; else metrics.humanTargets++; }
    }
    const w = WEAPONS[p.kit.weapon], arena = pvpArenaSize(s.players.length, 'pvp');
    const d = target ? distance(p, target) : 0, toward = target ? unit(target.x - p.x, target.y - p.y) : [0, 0] as [number, number];
    if (p.armor <= p.kit.maxArmor * 0.25 && (!ai || rng() < 0.75)) retreat = true;
    if (p.armor >= p.kit.maxArmor * 0.85) retreat = false;
    const preferred = Math.min(150, w.speed * w.life * 0.62) + (ai ? (rng() - 0.5) * 26 : 0);
    const radial = retreat ? -1.3 : d > preferred + 18 ? 0.9 : d < preferred - 20 ? -0.65 : 0;
    let mx = toward[0] * radial - toward[1] * side * 0.35, my = toward[1] * radial + toward[0] * side * 0.35, danger = false;
    for (const b of s.bullets) {
      if (b.owner === p.id || distance(b, p) > 105) continue;
      const t = clamp(((p.x - b.x) * b.vx + (p.y - b.y) * b.vy) / Math.max(1, b.vx ** 2 + b.vy ** 2), 0, 0.5);
      const x = b.x + b.vx * t, y = b.y + b.vy * t;
      if (Math.hypot(p.x - x, p.y - y) >= 20 + b.r) continue;
      if (!threats.has(b.id)) { const accepted = rng() < (ai ? 0.4 : 0.5); threats.set(b.id, accepted); metrics.threats++; if (accepted) metrics.dodges++; }
      if (!threats.get(b.id)) continue;
      const away = Math.hypot(p.x - x, p.y - y) < 0.01 ? unit(-b.vy * side, b.vx * side) : unit(p.x - x, p.y - y);
      mx += away[0] * 1.25; my += away[1] * 1.25; danger = true;
    }
    if (threats.size > 1000) { const live = new Set(s.bullets.map(b => b.id)); for (const id of threats.keys()) if (!live.has(id)) threats.delete(id); }
    if (p.x < 55 && mx < 0) { mx = 0.3; my += p.y < arena.height / 2 ? 0.6 : -0.6; }
    if (p.x > arena.width - 55 && mx > 0) { mx = -0.3; my += p.y < arena.height / 2 ? 0.6 : -0.6; }
    if (p.y < 55 && my < 0) { my = 0.3; mx += p.x < arena.width / 2 ? 0.6 : -0.6; }
    if (p.y > arena.height - 55 && my > 0) { my = -0.3; mx += p.x < arena.width / 2 ? 0.6 : -0.6; }
    const zone = s.pvp?.royale?.zone;
    const buffer = ai ? 18 + rng() * 20 : 24;
    if (zone && s.t >= zone.shrinkStart && distance(p, { x: zone.cx, y: zone.cy }) > Math.max(0, zone.r - buffer)) {
      const inward = unit(zone.cx - p.x, zone.cy - p.y), wander = ai ? Math.sin(s.t * 0.8 + seed) * 0.4 : 0;
      mx = inward[0] * 2 - inward[1] * wander; my = inward[1] * 2 + inward[0] * wander; danger = true;
    }
    const length = Math.max(1, Math.hypot(mx, my));
    const lead = target ? Math.min(0.35, d / (w.speed * 1.35)) * (ai ? 0.4 + rng() * 0.5 : 0.4 + rng() * 0.6) : 0;
    const error = (rng() * 2 - 1) * (ai ? 10 + rng() ** 3 * 4 : 9 + rng() * 2), radians = error * Math.PI / 180;
    metrics.maxAimError = Math.max(metrics.maxAimError, Math.abs(error));
    const angle = target ? Math.atan2(target.y + target.vy * lead - p.y, target.x + target.vx * lead - p.x) + radians : Math.atan2(p.facing[1], p.facing[0]);
    let dash = false, skill = false;
    if (danger && p.dashCd <= 0 && s.t >= dashAt) { dashAt = s.t + (ai ? 1.8 + rng() * 1.4 : 1.4 + rng() * 0.8); dash = rng() < (ai ? 0.4 : 0.55); }
    if (p.skillCd <= 0 && s.t >= skillAt) {
      skillAt = s.t + (ai ? 2.5 + rng() * 2 : 1.5 + rng());
      skill = !!target && d < 210 && (p.kit.skill !== 'hotfix' || p.hp <= p.kit.maxHp - (ai ? 3 : 2)) && rng() < (ai ? 0.6 : 0.75);
    }
    if (dash) metrics.dashes++; if (skill) metrics.skills++;
    frame = { seq: 0, move: [mx / length, my / length], aim: [Math.cos(angle), Math.sin(angle)], fire: true, dash, skill, source: 'keyboard' };
    return send(true);
  }) as PvpController;
  controller.metrics = metrics;
  return controller;
}
