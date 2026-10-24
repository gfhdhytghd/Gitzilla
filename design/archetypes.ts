import type { BossArchetype, BossBody, BossGrowth, BossKit, RepoProfile } from '../shared/types.ts';
import { artDNA } from './code.ts';

interface BossArt {
  bodies: readonly BossBody[];
  direction: string;
  creature: string;
  core: string;
  palette: string[];
  growths: BossGrowth[];
  intro: string;
  fatal: string;
  todo: string;
  commit: string;
  taunts: (target: string) => string[];
  titles: string[];
}

/** Describes the sim's selected preset. Art never chooses movement, poses, attacks or difficulty. */
export const bossArt: Record<BossArchetype, BossArt> = {
  kaiju: {
    bodies: ['golem', 'blob', 'tree', 'spider', 'swarm', 'eye'],
    direction: 'An upright saurian with a massive chest, two planted legs, clawed arms, a long heavy tail and tall bracket-shaped crystalline dorsal fins. Dark teal scales and cyan light. Stomp-walk, dorsal fins charging tail-to-head before </> breath, tail sweep, quake and roar. Idle sway, two-step walk, windup, attack, recovery and toppling death follow the sim pose. Body is a local armor hint: golem=rock scales; blob=heavy belly; tree=rooted bark; spider=chitin claws; swarm=parasites; eye=ocular core.',
    creature: 'A dorsal-crowned kaiju', core: 'chest reactor',
    palette: ['#09292c', '#346769', '#51f5df', '#207eac', '#fff4bd'], growths: ['crystals', 'spikes'],
    intro: '[##########] dorsal fins charged; kaiju rising', fatal: '</> breath',
    todo: 'Tail stomp', commit: 'Dorsal scars',
    taunts: target => [`ROAR! ${target} shakes beneath my feet.`, `Dorsal fins charging: ${target}`, `</> breath burns ${target}.`, 'STOMP! My tail will git push --force.'],
    titles: ['THE {noun} STOMPER', 'DORSAL KING OF {noun}', 'THE {noun} THUNDERJAW', 'TAILBREAKER OF {noun}', 'THE {noun} COLOSSUS', 'THE {noun} QUAKE', 'FIN-CROWNED {noun}', 'THE {noun} STACK CRUSHER', 'ROAR OF {noun}', 'THE {noun} SCALE TYRANT', 'THE {noun} BREATH', 'STORMBACK OF {noun}'],
  },
  hydra: {
    bodies: ['hydra'],
    direction: 'A winged golden hydra with two or three distinct long-necked heads, broad ribbed wings and a curling tail. Dark ochre scales, gold armor and pale lightning. Hovers in arcs, lands to rest, fires each head beam in turn, wing gusts and dive bombs. The sim pose.head selects the firing neck; animate fly/flap, per-head windup/attack, dive, landing recovery and heads dropping at death. Keep separated head silhouettes and wings readable.',
    creature: 'A gold-scaled winged hydra', core: 'shared heart between branching necks',
    palette: ['#302011', '#a97b22', '#ffdf68', '#f5b83e', '#fff3be'], growths: ['wings', 'horns', 'crystals'],
    intro: '[##########] branching necks awake; wings unfurl', fatal: 'head beam',
    todo: 'Wing gust', commit: 'Neck scars',
    taunts: target => [`Three throats call ${target} in turn.`, `Wings unfurl: ${target} takes the gust.`, `Dive bomb queued for ${target}.`, 'One head returns. Two more recurse.'],
    titles: ['THE {noun} SKY HYDRA', 'THREE THROATS OF {noun}', 'THE {noun} WINGSTORM', 'MANY MAWS OF {noun}', 'THE {noun} SKY COIL', 'GOLDEN HYDRA OF {noun}', 'THE {noun} DIVE TYRANT', 'WINGED KNOT OF {noun}', 'THE {noun} FORKED ROAR', 'BRANCHING JAWS OF {noun}', 'THE {noun} NECKSTORM', 'SKYBORNE {noun} DEVOURER'],
  },
  mecha: {
    bodies: ['machine'],
    direction: 'An armored machine kaiju with silver segmented panels, rivets, a red visor, mechanical jaw, missile shoulders, rocket fists and jet vents. Grounded servo steps with short jet hops and turret turns. Eye laser sweep, missile barrage and shoulder cannon; windup vents glow, attack recoils, recovery releases steam, stagger overheats, enrage opens panels and death explodes into code. Animate only the sim pose; do not invent airborne windows.',
    creature: 'A silver-armored mecha', core: 'red-visor reactor',
    palette: ['#202936', '#a3b3c2', '#ff5368', '#5ce5ef', '#ffaf8a'], growths: ['gears', 'pipes', 'servers'],
    intro: '[##########] red visor online; jet vents armed', fatal: 'missile barrage',
    todo: 'Rocket-fist fault', commit: 'Panel scars',
    taunts: target => [`Target lock: ${target}; rocket fist armed.`, `Eye laser compiling ${target}.`, `Missile barrage seeks ${target}.`, 'Vents open. Cooling with git reset --hard.'],
    titles: ['THE {noun} WARFRAME', 'STEEL WARDEN OF {noun}', 'THE {noun} OVERCLOCK', 'ROCKET FIST OF {noun}', 'THE {noun} IRON COLOSSUS', 'RED VISOR OF {noun}', 'THE {noun} SIEGE ENGINE', 'JET-FORGED {noun}', 'THE {noun} MISSILE KING', 'ARMORED {noun} EXECUTOR', 'THE {noun} STEEL JAW', 'REACTOR OF {noun}'],
  },
  abyssal: {
    bodies: ['serpent'],
    direction: 'A black crystalline serpent-dragon with a long segmented coiling body, jagged crystal ridges, low prowling head and glowing red/cyan veins. Distinct from an upright biped. Coils and slithers, burrows beneath the floor then emerges at the sim telegraph. Crystal eruption lines, tail lash and vein-pulse rings. Animate coil idle, slither, burrow/emerge, vein-glow windup, attack, stagger, red-veined enrage and shattering death. Never invent a burrow or untargetable window outside sim state.',
    creature: 'A black-crystalline abyssal serpent', core: 'veined coil core',
    palette: ['#100f1d', '#363349', '#ef426b', '#38dfef', '#aefaff'], growths: ['crystals', 'tentacles', 'spikes'],
    intro: '[##########] crystal coils stir beneath the floor', fatal: 'crystal eruption',
    todo: 'Buried debt', commit: 'Vein scars',
    taunts: target => [`I coil around ${target} beneath the floor.`, `Crystal eruption breaches ${target}.`, `Red veins pulse through ${target}.`, 'Burrow. Emerge. Shatter the call stack.'],
    titles: ['THE {noun} VOID SERPENT', 'THE {noun} COIL', 'BURROWER OF {noun}', 'THE {noun} CRYSTAL MAW', 'DEEP VEINS OF {noun}', 'THE {noun} ABYSS WYRM', 'BLACK COIL OF {noun}', 'THE {noun} SHATTERER', 'BURIED FANG OF {noun}', 'THE {noun} RIFT DRAGON', 'VEINBOUND {noun}', 'THE {noun} UNDERCURRENT'],
  },
};

export function bossBodyDirection(kit: BossKit): string {
  return `The simulation has already selected archetype=${kit.archetype}; keep that identity. ${bossArt[kit.archetype].direction} Follow the sim pose and airborne state. Across ALL archetypes phase 3 grows dark crystalline corruption and glowing veins. These are original creatures inspired by shape/material references, never copied sprites or named film characters. BossDesign.body is a cosmetic hint within this selected archetype. Describe its preset actions in flavor; never change attack kinds, movement, pose timing, airborne state or threat budget.`;
}

export function chooseBossBody(profile: RepoProfile, kit: BossKit): BossBody {
  const art = bossArt[kit.archetype];
  if (kit.archetype !== 'kaiju') return art.bodies[0];
  const dna = artDNA(profile, kit);
  const symbols = [...dna.identifiers, ...Object.values(dna.componentSymbols).flat(), profile.heart].join(' ');
  if (/root|tree|forest|garden|branch/i.test(symbols) || kit.theme === 'legacy' || profile.ageDays > 3650) return 'tree';
  return art.bodies[(profile.seed >>> 4) % art.bodies.length];
}
