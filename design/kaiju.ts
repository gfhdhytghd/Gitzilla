import type { BossBody } from '../shared/types.ts';

/** Every enum decorates the same upright reptilian silhouette owned by claude-boss. */
export const kaijuVariants: Record<BossBody, string> = {
  blob: 'bulky, armored-bellied',
  serpent: 'long-necked, whip-tailed',
  spider: 'chitin-plated, extra-clawed',
  hydra: 'many-headed, branching-necked',
  golem: 'stone-scaled, fortress-plated',
  swarm: 'parasite-crowned, ember-shedding',
  eye: 'many-eyed, reactor-gazing',
  tree: 'bark-armored, root-spined',
  machine: 'mech-plated, reactor-powered',
};

export const kaijuBodyDirection = 'Always one upright, Godzilla-inspired reptilian kaiju silhouette: massive chest, two powerful legs, clawed arms, a distinct head and jaws, jagged dorsal plates, and a long heavy tail. BossDesign.body is variant flavor on this anatomy, never a replacement creature silhouette: blob=bulky armored belly; serpent=elongated neck and sweeping tail; spider=extra claws/chitin plates; hydra=multiple heads; golem=rock scales and heavy armor; swarm=parasites or ember swarms around the body; eye=extra eyes and an ocular reactor; tree=bark/root dorsal spines; machine=mech plating and reactor machinery. Keep the torso, legs, head, dorsal plates and tail readable for every variant.';
