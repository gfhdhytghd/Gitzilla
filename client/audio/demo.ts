import type { GameEvent, SkillKind, WeaponKind } from '../../shared/types';
import { createAudio } from './index';
import { MUSIC_PROFILES } from './synth';
import type { MusicTheme } from './synth';
import type { AudioHit } from './events';

const audio = createAudio();
const status = document.querySelector<HTMLDivElement>('#status')!;
const phaseSelect = document.querySelector<HTMLSelectElement>('#phase')!;
const personal = document.querySelector<HTMLInputElement>('#personal')!;
let theme: MusicTheme | null = null;
const self = () => personal.checked ? 'me' : 'teammate';
const phase = () => Number(phaseSelect.value) as 1 | 2 | 3;
const report = (message: string) => { status.textContent = `${new Date().toLocaleTimeString()} // ${message}`; };

async function audition(label: string, action: () => void) {
  try { await audio.unlock(); action(); report(label); }
  catch (error) { report(`ERROR: ${String(error)}`); console.error(error); }
}

function button(parent: string, label: string, action: () => void, id: string) {
  const el = document.createElement('button');
  el.textContent = label;
  el.dataset.testid = id;
  el.addEventListener('click', () => { void audition(label, action); });
  document.querySelector(parent)!.append(el);
  return el;
}

document.querySelector('#unlock')!.addEventListener('click', () => {
  void audition('UNLOCKED // audio output is running', () => audio.onUi());
});
// Keyboard-clack is explicit, so the app can attach it only to its own UI actions.
document.addEventListener('pointerdown', () => { void audio.unlock().then(() => audio.onUi()).catch(error => report(String(error))); }, { capture: true });
document.querySelector<HTMLInputElement>('#muted')!.addEventListener('change', event => {
  const muted = (event.target as HTMLInputElement).checked;
  audio.setMuted(muted);
  report(muted ? 'MUTED // loops and effects stopped; selection retained' : 'UNMUTED');
});
document.querySelector<HTMLInputElement>('#volume')!.addEventListener('input', event => {
  const volume = Number((event.target as HTMLInputElement).value);
  audio.setVolume(volume);
  document.querySelector('#volume-value')!.textContent = `${Math.round(volume * 100)}%`;
});

for (const [key, profile] of Object.entries(MUSIC_PROFILES)) {
  const musicTheme = key as MusicTheme;
  const el = button('#music', key.toUpperCase(), () => {
    theme = musicTheme;
    audio.music(musicTheme, phase());
    document.querySelectorAll('#music button').forEach(button => button.classList.toggle('active', button === el));
  }, `music-${key}`);
  const caption = document.createElement('small');
  caption.textContent = `${profile.bpm} BPM / ${profile.label}`;
  el.append(caption);
}
phaseSelect.addEventListener('change', () => {
  if (theme) void audition(`${theme} // phase ${phase()}`, () => audio.music(theme!, phase()));
});

for (const weapon of ['blaster', 'smg', 'shotgun', 'cannon', 'staff', 'laser', 'blade'] as WeaponKind[]) {
  button('#weapons', weapon.toUpperCase(), () => audio.onFire(weapon), `fire-${weapon}`);
}
button('#weapons', 'DASH', () => audio.onDash(), 'dash');

const hit = (): AudioHit => ({ type: 'hit', target: 'boss', source: self(), amount: 12, x: 200, y: 120 });
const eventFactories: Record<string, () => GameEvent[]> = {
  hit: () => [hit()],
  crit: () => [{ ...hit(), crit: true } as AudioHit],
  combo: () => [{ ...hit(), combo: 4 }],
  hurt: () => [{ ...hit(), target: self(), source: 'boss' } as AudioHit],
  telegraph: () => [{ type: 'telegraph', attackId: 'rm-rf', name: 'FATAL: rm -rf /', targetPlayer: self() }],
  limbBroken: () => [{ type: 'limbBroken', limb: 'router-claw', by: self() }],
  downed: () => [{ type: 'downed', player: self() }],
  revived: () => [{ type: 'revived', player: self(), by: 'ally' }],
  'pickup-energy': () => [{ type: 'pickup', player: self(), kind: 'energy', x: 80, y: 90 }],
  'pickup-heart': () => [{ type: 'pickup', player: self(), kind: 'heart', x: 80, y: 90 }],
  'pickup-armor': () => [{ type: 'pickup', player: self(), kind: 'armor', x: 80, y: 90 }],
  obstacleBroken: () => [{ type: 'obstacleBroken', id: 1, label: 'router.ts', x: 80, y: 90 }],
  perk: () => [{ type: 'perk', player: self(), perk: 'Merge Approved' }],
  phase: () => [{ type: 'phase', phase: phase() }],
  victory: () => [{ type: 'victory' }],
  defeat: () => [{ type: 'defeat' }],
};
for (const [label, events] of Object.entries(eventFactories)) {
  button('#events', label.toUpperCase(), () => audio.onEvents(events(), 'me'), `event-${label}`);
}
for (const skill of ['firewall', 'fork', 'hotfix', 'overclock', 'rollback'] as SkillKind[]) {
  button('#skills', skill.toUpperCase(), () => audio.onEvents([{ type: 'skill', player: self(), skill }], 'me'), `skill-${skill}`);
}
button('#skills', 'MODEM INTRO', () => audio.onBossIntro(), 'intro');
button('#skills', 'KEYBOARD CLACK', () => audio.onUi(), 'ui-tick');
button('#skills', '8-PLAYER BURST', () => {
  const events: GameEvent[] = [];
  for (let player = 0; player < 8; player++) {
    events.push({ ...hit(), source: player === 0 ? 'me' : `friend-${player}`, crit: player % 3 === 0, combo: player + 1 } as AudioHit);
    events.push({ type: 'skill', player: `friend-${player}`, skill: (['firewall', 'fork', 'hotfix', 'overclock', 'rollback'] as SkillKind[])[player % 5] });
    audio.onFire('smg');
  }
  audio.onEvents(events, 'me');
}, 'stress-burst');

window.addEventListener('pagehide', () => audio.dispose(), { once: true });
