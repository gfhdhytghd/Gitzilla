import type { ChainBoardEntry, ChainBoardProof, ChainBoardSnapshot } from '../../shared/types';
import { canonical } from '../../shared/receipt';
import { hash } from '../receipts/crypto';
export const compareEntries = (a: ChainBoardEntry, b: ChainBoardEntry) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
export function buildTree(entries: ChainBoardEntry[]) {
  const sorted = [...entries].sort(compareEntries);
  const levels = [sorted.map(entry => hash(canonical(entry)))];
  while (levels.at(-1)!.length > 1) {
    const previous = levels.at(-1)!;
    levels.push(previous.filter((_, i) => i % 2 === 0).map((left, i) => previous[i * 2 + 1] ? hash(Buffer.from(left + previous[i * 2 + 1], 'hex')) : left));
  }
  return { entries: sorted, levels, root: levels.at(-1)![0] ?? hash('') };
}
export function makeProof(snapshot: ChainBoardSnapshot, kind: string, key: string): ChainBoardProof | undefined {
  const tree = buildTree(snapshot.entries);
  let index = tree.entries.findIndex(entry => entry.kind === kind && entry.key === key);
  if (index < 0) return;
  const entry = tree.entries[index], leaf = tree.levels[0][index], path: ChainBoardProof['path'] = [];
  for (const level of tree.levels.slice(0, -1)) {
    const sibling = index % 2 ? index - 1 : index + 1;
    if (sibling < level.length) path.push({ hash: level[sibling], side: index % 2 ? 'left' : 'right' });
    index = Math.floor(index / 2);
  }
  return { snapshot: snapshot.id, root: snapshot.root, leaf, entry, path, status: snapshot.status, ...(snapshot.tx ? { tx: snapshot.tx } : {}) };
}
