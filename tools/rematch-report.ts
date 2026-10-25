/** Summarize saved observations without running a browser or changing any tested state. */
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarizeRematch(root: string) {
  const counters: any[] = [], findings: any[] = [], cases: any[] = [], heroFrames: any[] = [];
  for (const dir of readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory())) {
    const caseDir = join(root, dir.name), files = readdirSync(caseDir).filter(x => /^\d\d-.*\.json$/.test(x));
    const observations = files.filter(file => !file.endsWith('-first3s-hero.json')).map(file => ({ file, ...JSON.parse(readFileSync(join(caseDir, file), 'utf8')) }))
      .sort((a, b) => a.at.localeCompare(b.at));
    const first: Record<string, any> = {}, autopsies: any[] = [];
    for (const sample of observations) {
      const m = sample.metrics, cycle = Number(sample.file.slice(0, 2));
      const gl = m.contexts.filter((x: any) => /webgl/.test(x.kind));
      const squash = m.heroFrames.filter((x: any) => x.squash).map((x: any) => ({ ...x.squash, at: x.at, bounds: x.cssBounds }));
      const scales = squash.flatMap((x: any) => [Math.abs(x.sx), Math.abs(x.sy)]);
      const row = { case: dir.name, cycle, checkpoint: sample.name, documentId: m.documentId,
        canvases: m.canvases.length, glCreated: m.contextCounts?.byKind.webgl2 ?? gl.length,
        glReachableUnlost: gl.filter((x: any) => x.contextAlive && !x.lost).length, glLostEvents: m.contextCounts?.webglLostEvents ?? m.events.filter((x: any) => x.type === 'webglcontextlost').length,
        rafChains: m.raf.activeChains.length, pendingRAF: m.raf.pending,
        intervals: m.timers.active.filter((x: any) => x.kind === 'interval').length,
        timeouts: m.timers.active.filter((x: any) => x.kind === 'timeout').length,
        sockets: m.sockets.filter((x: any) => x.state === 1 && new URL(x.url).pathname === '/ws').length,
        audioActive: m.audio.filter((x: any) => x.state !== 'collected' && x.state !== 'closed').length,
        documentListeners: m.listeners.filter((x: any) => x.target === 'document').length,
        windowListeners: m.listeners.filter((x: any) => x.target === 'window').length,
        maxSquash: scales.length ? Math.max(...scales) : null,
        frameStartNonIdentity: m.frames.flatMap((x: any) => x.canvases).filter((x: any) => !x.identity).length,
        maxSaveDepthAtFrameStart: Math.max(0, ...m.frames.flatMap((x: any) => x.canvases).map((x: any) => x.saveDepth)),
        fullLuma: sample.luminance.mean, gameLuma: sample.gameLuminance?.mean ?? null,
        allBlack: !!(sample.luminance.allBlack || sample.gameLuminance?.allBlack), allWhite: !!(sample.luminance.allWhite || sample.gameLuminance?.allWhite),
        // HUD/minimap can remain visible over an otherwise black/white scene. Derive from retained raw statistics too.
        nearBlack: !!sample.gameLuminance && sample.gameLuminance.blackFraction > 0.90 && sample.gameLuminance.mean < 8,
        nearWhite: !!sample.gameLuminance && sample.gameLuminance.whiteFraction > 0.60 && sample.gameLuminance.mean > 220 };
      counters.push(row); if (sample.name === 'autopsy') autopsies.push(row);
      const record = (kind: string, evidence: any) => {
        if (first[kind]) return;
        const value = { case: dir.name, kind, cycle, file: sample.file, evidence }; first[kind] = value; findings.push(value);
      };
      const abnormal = squash.find((x: any) => Math.abs(x.sx) > 3 || Math.abs(x.sy) > 3);
      if (abnormal) record('unbounded-hero-animation', abnormal);
      const currentFx = m.fx;
      if (sample.snapshot?.status === 'fighting' && currentFx) {
        if (currentFx.victoryAt > currentFx.now + 1 || currentFx.defeatAt > currentFx.now + 1) record('inherited-fx-end-timestamp', currentFx);
        if (currentFx.limbBreak > currentFx.now + 1) record('negative-limb-break-age', currentFx);
        if ((currentFx.victoryAt > 0 && currentFx.now - currentFx.victoryAt > 1.75)
          || (currentFx.defeatAt > 0 && currentFx.now - currentFx.defeatAt > 0.6)) record('stale-postfx-end-overlay-eligible', currentFx);
        if (currentFx.victoryAt > 0 && currentFx.now - currentFx.victoryAt > 1.75) record('stale-postfx-victory-eligible', currentFx);
        if (currentFx.defeatAt > 0 && currentFx.now - currentFx.defeatAt > 0.6) record('stale-postfx-panic-eligible', currentFx);
      }
      if (row.allBlack || row.allWhite) record('blank-frame', { full: sample.luminance, game: sample.gameLuminance });
      const settledFight = sample.name.startsWith('wait-') || (sample.name.startsWith('fight-') && Number(sample.name.match(/fight-(\d+)/)?.[1]) >= 5);
      if (settledFight && (row.nearBlack || row.nearWhite)) record('scene-mostly-black-or-white', { full: sample.luminance, game: sample.gameLuminance });
      if (gl.some((x: any) => x.lost)) record('webgl-context-lost', { contexts: gl, events: m.events });
    }
    const summaryPath = join(caseDir, 'summary.json');
    const first3s = files.filter(file => file.endsWith('-first3s-hero.json')).map(file => {
      const data = JSON.parse(readFileSync(join(caseDir, file), 'utf8'));
      const frames = data.frames ?? [], squash = frames.filter((x: any) => x.squash);
      for (const frame of frames) heroFrames.push({ case: dir.name, cycle: data.cycle, epoch: data.epoch, ms: frame.sinceEpochMs,
        playerId: frame.id, memoryObjectId: frame.memory?.objectId, renderTime: frame.memory?.renderTime,
        previousMemTime: frame.memory?.previousT, hurtT: frame.memory?.hurtT, downT: frame.memory?.downT, reviveT: frame.memory?.reviveT,
        previousAlive: frame.memory?.alive, alive: frame.alive, facingX: frame.facing?.[0], facingY: frame.facing?.[1], flip: frame.squash?.flip,
        sx: frame.squash?.sx, sy: frame.squash?.sy, zoom: frame.game?.zoom,
        cssX: frame.cssBounds?.x, cssY: frame.cssBounds?.y, cssWidth: frame.cssBounds?.w, cssHeight: frame.cssBounds?.h });
      return { file, cycle: data.cycle, epoch: data.epoch, captureComplete: data.captureComplete, frames: frames.length,
        memoryObjectIds: [...new Set(frames.map((x: any) => x.memory?.objectId).filter((x: any) => x !== undefined))],
        first: frames[0], last: frames.at(-1), maxAbsSquash: squash.length ? Math.max(...squash.flatMap((x: any) => [Math.abs(x.squash.sx), Math.abs(x.squash.sy)])) : null };
    });
    cases.push({ case: dir.name, ...(existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : { completedCycles: autopsies.length, running: true }),
      autopsyCounters: autopsies, firstFindings: first, first3s });
  }
  const result = { generatedAt: new Date().toISOString(), root, cases, findings, counters };
  writeFileSync(join(root, 'diagnosis.json'), JSON.stringify(result, null, 2));
  if (counters.length) {
    const keys = Object.keys(counters[0]);
    const escape = (value: any) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    writeFileSync(join(root, 'counters.csv'), [keys.join(','), ...counters.map(row => keys.map(k => escape(row[k])).join(','))].join('\n') + '\n');
  }
  if (heroFrames.length) {
    const keys = Object.keys(heroFrames[0]);
    const escape = (value: any) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    writeFileSync(join(root, 'first3s-hero.csv'), [keys.join(','), ...heroFrames.map(row => keys.map(k => escape(row[k])).join(','))].join('\n') + '\n');
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2]); const result = summarizeRematch(root);
  console.log(JSON.stringify({ root, completed: result.cases.map(x => ({ case: x.case, cycles: x.completedCycles })), findings: result.findings }, null, 2));
}
