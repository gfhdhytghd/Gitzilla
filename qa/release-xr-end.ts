/** Real game on the clean private server; public IWER hand pinch is the only synthetic input. */
import { chromium, type Page } from 'playwright';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createBattle, startBattle, observe, delay, until, releaseBase } from './release-common';
import { completeLandingOnboarding } from '../tools/onboarding';

const output = resolve(process.env.RELEASE_XR_OUTPUT ?? 'qa/artifacts/release-bdd177c-xr-end'); mkdirSync(output, { recursive: true });
const angle = process.env.RELEASE_ANGLE ?? 'swiftshader';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: [`--use-angle=${angle}`, ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist']), '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let failure: string | undefined, pass = false;
let diagnosticPage: Page | undefined, monitor: ReturnType<typeof setInterval> | undefined;
const evidence: any = { sha: process.env.RELEASE_SHA, base: releaseBase, angle, sources: [], phases: [] };
try {
  const ownerContext = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const xrContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const owner = await ownerContext.newPage(), viewer = await xrContext.newPage();
  diagnosticPage = viewer;
  const ownerTraffic = observe(owner), viewerTraffic = observe(viewer);
  await viewer.route('**/client/app/view25d.ts*', async route => {
    const response = await route.fetch(); const original = await response.text();
    const marker = 'dev.installRuntime({ forceInstall: true });';
    if (!original.includes(marker) || !original.includes('new XRDevice(metaQuest3)')) throw new Error('IWER installation seam changed');
    const hook = `
globalThis.__qaXRDevice=dev;
const proto=globalThis.XRReferenceSpace.prototype;
const rawOffset=proto.getOffsetReferenceSpace;
proto.getOffsetReferenceSpace=function(offset){return rawOffset.call(this,offset.matrix??offset);};
globalThis.__qaXREnded=0;globalThis.__qaXRSelects=[];
const nativeRequest=navigator.xr.requestSession.bind(navigator.xr);
navigator.xr.requestSession=(...args)=>nativeRequest(...args).then(session=>{
  globalThis.__qaXRSession=session;
  session.addEventListener('end',()=>{globalThis.__qaXREnded++;});
  session.addEventListener('select',e=>globalThis.__qaXRSelects.push({hand:!!e.inputSource.hand,mode:e.inputSource.targetRayMode,at:performance.now()}));
  return session;
});`;
    evidence.sources.push({ path: '/client/app/view25d.ts', sha256: createHash('sha256').update(original).digest('hex'), hook: 'Public VR-only emulator profile (same mode as xr-check); normalize IWER offset matrix; read-only session event counters' });
    const vrProfile = original.replace('new XRDevice(metaQuest3)', 'new XRDevice({...metaQuest3,supportedSessionModes:["inline","immersive-vr"]})');
    await route.fulfill({ response, body: vrProfile.replace(marker, marker + hook) });
  });
  await viewer.route('**/client/render/stage25d/index.ts*', async route => {
    const response = await route.fetch(); const original = await response.text(); const at = original.lastIndexOf('return api;');
    if (at < 0) throw new Error('Stage API observation seam changed');
    evidence.sources.push({ path: '/client/render/stage25d/index.ts', sha256: createHash('sha256').update(original).digest('hex'), hook: 'Expose actual stage and ending for read-only observations' });
    const exposed = original.slice(0, at) + 'globalThis.__qaXRStage=api;globalThis.__qaXRLook=look;\n' + original.slice(at);
    await route.fulfill({ response, body: exposed.replace('const { state } = src;', 'const { state } = src;globalThis.__qaXRState={t:state.t,status:state.status,bossPose:state.boss?.pose,bossHp:state.boss?.hp};') });
  });
  const room = await createBattle(owner, ownerTraffic, '2d', 7); evidence.room = room;
  await viewer.goto(`${releaseBase}/r/${room}?screen=1&view=xr&xr=emulate`);
  await completeLandingOnboarding(viewer);
  await startBattle(owner, ownerTraffic);
  await viewer.getByTestId('game-canvas').waitFor();
  await viewer.waitForFunction(() => (window as any).__qaXRStage && (window as any).__qaXRDevice, null, { polling: 100 });
  await viewer.getByTestId('xr-enter').click();
  await viewer.waitForFunction(() => (window as any).__qaXRStage.xrActive, null, { polling: 100 });
  evidence.xrMode = await viewer.evaluate(() => (window as any).__qaXRStage.xrMode);
  if (evidence.xrMode !== 'immersive-vr') throw new Error(`Expected VR profile, received ${evidence.xrMode}`);
  console.log(`XR room ${room}: actual immersive session entered; waiting for natural victory`);
  monitor = setInterval(() => {
    void viewer.evaluate(() => ({ state: (window as any).__qaXRState, ending: (window as any).__qaXRStage?.debugEnding,
      active: (window as any).__qaXRStage?.xrActive, mode: (window as any).__qaXRStage?.xrMode, placement: (window as any).__qaXRStage?.debugPlacement, frames: (window as any).__kaijuXrFrames,
      ended: (window as any).__qaXREnded, selects: (window as any).__qaXRSelects,
      autopsy: !!document.querySelector('[data-testid="autopsy"]') }))
      .then(value => { appendFileSync(join(output, 'timeline.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value, errors: viewerTraffic.errors }) + '\n'); })
      .catch(() => {});
  }, 3000);
  await owner.keyboard.down('KeyJ');
  await owner.keyboard.down('KeyD'); await delay(2200); await owner.keyboard.up('KeyD');
  await viewer.waitForFunction(() => (window as any).__qaXRStage?.debugEnding?.kind === 'victory', null, { polling: 50, timeout: 180_000 });
  await owner.keyboard.up('KeyJ');
  const phase = async (label: string) => {
    const value = await viewer.evaluate(() => {
      const w = window as any, e = w.__qaXRLook.ending;
      return { kind: e.kind, ready: w.__qaXRStage.debugEnding.ready, cubes: e.cubes.count,
        wipeRadius: e.wipeMat.uniforms.uR.value, promptVisible: e.prompt.visible, promptOpacity: e.promptMat.opacity,
        active: w.__qaXRStage.xrActive, state: w.__qaXRState,
        hidden2D: ![...document.querySelectorAll('[data-testid="bsod-continue"]')].some(n => n.getClientRects().length > 0) };
    });
    evidence.phases.push({ label, ...value });
    await viewer.screenshot({ path: join(output, `${label}.png`) }); return value;
  };
  const dissolve = await phase('01-dissolve');
  await viewer.waitForFunction(() => (window as any).__qaXRLook.ending.wipeMat.uniforms.uR.value > 0, null, { polling: 50, timeout: 10_000 });
  await delay(700); const blue = await phase('02-blue-table');
  await viewer.waitForFunction(() => (window as any).__qaXRStage.debugEnding.ready, null, { polling: 50 });
  await delay(650); const prompt = await phase('03-prompt');
  evidence.visualAssertions = { dissolve: dissolve.cubes > 0, blueTable: blue.wipeRadius > 0,
    prompt: prompt.promptVisible && prompt.promptOpacity > 0, noDuplicate2DPrompt: prompt.hidden2D };
  await viewer.evaluate(() => { (window as any).__qaXRDevice.primaryInputMode = 'hand'; });
  await viewer.waitForFunction(() => [...(window as any).__qaXRSession.inputSources].some((s: any) => !!s.hand), null, { polling: 100 });
  // This generates IWER's real XR select event from a hand pinch; no onContinue/end-session calls.
  await viewer.evaluate(() => {
    const w = window as any;
    // The hand release ends the XR session, so IWER's queued action promise may never receive another XR tick.
    // Observe native select/end + visible autopsy instead of awaiting that emulator bookkeeping promise.
    void w.__qaXRDevice.remote.dispatch('select', { device: 'hand-right', duration: 0.15 }).catch((e: unknown) => { w.__qaPinchError = String(e); });
  });
  await viewer.getByTestId('autopsy').waitFor({ timeout: 15_000 });
  evidence.after = await viewer.evaluate(() => ({ ended: (window as any).__qaXREnded, selects: (window as any).__qaXRSelects,
    active: !!(window as any).__qaXRStage?.xrActive, autopsyCount: document.querySelectorAll('[data-testid="autopsy"]').length,
    visible2DPrompt: [...document.querySelectorAll('[data-testid="bsod-continue"]')].some(n => n.getClientRects().length > 0) }));
  await viewer.screenshot({ path: join(output, '04-autopsy-after-pinch.png') });
  await until(() => !!ownerTraffic.autopsy?.victory, 'authoritative natural victory');
  evidence.ownerOutcome = { victory: ownerTraffic.autopsy?.victory, duration: ownerTraffic.autopsy?.duration };
  evidence.errors = [...ownerTraffic.errors, ...viewerTraffic.errors];
  evidence.pinchPass = evidence.after.ended === 1 && evidence.after.selects.some((s: any) => s.hand) && !evidence.after.active
    && evidence.after.autopsyCount === 1 && !evidence.after.visible2DPrompt && !evidence.errors.length;
  pass = evidence.pinchPass && Object.values(evidence.visualAssertions).every(Boolean);
  if (!pass) throw new Error(`XR assertions failed: ${JSON.stringify({ visual: evidence.visualAssertions, pinch: evidence.pinchPass })}`);
} catch (error) {
  failure = String(error); console.error(failure);
  if (diagnosticPage && !diagnosticPage.isClosed()) {
    await diagnosticPage.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    evidence.failureState = await diagnosticPage.evaluate(() => ({ state: (window as any).__qaXRState,
      ending: (window as any).__qaXRStage?.debugEnding, active: (window as any).__qaXRStage?.xrActive, mode: (window as any).__qaXRStage?.xrMode, placement: (window as any).__qaXRStage?.debugPlacement,
      frames: (window as any).__kaijuXrFrames, ended: (window as any).__qaXREnded,
      autopsy: !!document.querySelector('[data-testid="autopsy"]') })).catch(() => null);
  }
}
finally {
  if (monitor) clearInterval(monitor);
  await browser.close();
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ pass, failure, ...evidence,
    proof: 'Clean private product server; real UI creates/starts room and enters XR; public VR-only IWER2.5 profile (same mode as xr-check); natural server victory; hand-generated select continues through real game.ts wiring. Read-only stage hooks and the same IWER matrix compatibility adapter as xr-check. No artificial ending or direct callback/session-exit invocation.' }, null, 2));
}
console.log(`XR END ${pass ? 'PASS' : 'FAIL'} ${output}`); process.exitCode = pass ? 0 : 1;
