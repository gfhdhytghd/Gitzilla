/** Classify the retained soak evidence, including intentional context loss at disposal. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { summarizeRematch } from '../tools/rematch-report';

const root = resolve(process.argv[2] ?? 'qa/artifacts/release-bdd177c-rematch-ready');
const raw = summarizeRematch(root);
const cases = raw.cases.map(c => {
  const rows = raw.counters.filter(r => r.case === c.case);
  const heroes = c.first3s.flatMap((s: any) => JSON.parse(readFileSync(join(root, c.case, s.file), 'utf8')).frames);
  const badHeroes = heroes.filter((f: any) => f.squash && (![f.squash.sx, f.squash.sy].every(Number.isFinite)
    || f.squash.sx <= 0 || f.squash.sy <= 0 || f.squash.sx > 3 || f.squash.sy > 3));
  const findings = raw.findings.filter(f => f.case === c.case && f.kind !== 'webgl-context-lost');
  const badGameTransforms: any[] = [], auxiliaryTransforms: Record<string, number> = {};
  // A disposed context's loss event is required by the fix. A lost connected context is a failure.
  const connectedLost = rows.flatMap(r => {
    const sample = JSON.parse(readFileSync(join(root, c.case, `${String(r.cycle).padStart(2, '0')}-${r.checkpoint}.json`), 'utf8'));
    for (const frame of sample.metrics.frames) for (const canvas of frame.canvases) if (!canvas.identity) {
      if (canvas.className.split(' ').includes('game-canvas')) badGameTransforms.push({ cycle: r.cycle, checkpoint: r.checkpoint, canvas });
      else { const key = JSON.stringify({ className: canvas.className, matrix: canvas.matrix, saveDepth: canvas.saveDepth }); auxiliaryTransforms[key] = (auxiliaryTransforms[key] ?? 0) + 1; }
    }
    return sample.metrics.contexts.filter((x: any) => /webgl/.test(x.kind) && x.connected && x.lost)
      .map((x: any) => ({ cycle: r.cycle, checkpoint: r.checkpoint, id: x.id }));
  });
  const range = (key: string, selected = rows) => selected.length
    ? [Math.min(...selected.map(r => r[key])), Math.max(...selected.map(r => r[key]))] : [];
  const autopsies = c.autopsyCounters;
  const summary = {
    case: c.case, completedCycles: c.completedCycles, failure: c.failure, errors: c.errors ?? [],
    first3sFrames: heroes.length, first3sPerCycle: c.first3s.map((s: any) => ({ cycle: s.cycle, frames: s.frames, memoryObjectIds: s.memoryObjectIds, maxAbsSquash: s.maxAbsSquash })),
    badHeroes: badHeroes.length, findings, connectedLost,
    liveUnlostWebGL: range('glReachableUnlost'), autopsyLiveUnlostWebGL: range('glReachableUnlost', autopsies),
    finalCreated: autopsies.at(-1)?.glCreated, finalDisposedLosses: autopsies.at(-1)?.glLostEvents,
    autopsyCounters: Object.fromEntries(['canvases', 'rafChains', 'pendingRAF', 'intervals', 'timeouts', 'sockets', 'audioActive', 'documentListeners', 'windowListeners'].map(k => [k, range(k, autopsies)])),
    nonIdentityFrameStarts: rows.reduce((n, r) => n + r.frameStartNonIdentity, 0),
    badGameTransforms, auxiliaryTransforms,
    pass: c.completedCycles === 6 && !c.failure && !(c.errors?.length) && !badHeroes.length && !findings.length && !connectedLost.length
      && rows.every(r => r.glReachableUnlost <= 1) && !badGameTransforms.length
      && autopsies.length === 6 && autopsies.every((r: any) => r.glReachableUnlost === 0),
  };
  return summary;
});
const result = { sha: process.env.RELEASE_SHA, pass: cases.length === 4 && cases.every(c => c.pass),
  interpretation: 'Six real natural rounds per case. Intentional forceContextLoss after disposal is expected; connected-context loss is forbidden. Horizontal facing flips are normal; positive finite squash axes <=3 are required. Game-canvas frame starts require identity; auxiliary transforms are retained separately (Genesis text intentionally uses DPR3 on iPhone, client/genesis/text.ts:42). Screenshot flags concern sampled frames, not continuous video.', cases };
writeFileSync(join(root, 'release-verdict.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
