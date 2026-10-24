/** Bounded raw sensor capture. No names, repo, player IDs or room codes are included. */
export interface TraceSample { type: 'orientation' | 'motion' | 'gesture' | 'input'; at: number; [field: string]: unknown }
export function createTraceBuffer(now = () => performance.now()) {
  let started = 0, active = false;
  let samples: TraceSample[] = [];
  const last: Record<string, number> = {};
  return {
    get active() { return active; },
    start() { started = now(); samples = []; active = true; for (const key of Object.keys(last)) delete last[key]; },
    add(sample: TraceSample) {
      if (!active) return;
      if (sample.at - started > 20_000) { active = false; return; }
      // At most 60Hz per raw stream + gesture edges, <= ~2400 raw records/20s.
      const bucket = Math.floor((sample.at - started) * 60 / 1000);
      if (sample.type !== 'gesture' && last[sample.type] === bucket) return;
      if (samples.length >= 4000) { active = false; return; }
      last[sample.type] = bucket; samples.push({ ...sample, at: Math.round((sample.at - started) * 100) / 100 });
    },
    stop() { active = false; },
    data(meta: { userAgent: string; platform: string }) { return { version: 3, durationMs: Math.min(20_000, Math.max(0, now() - started)), ...meta, samples: [...samples] }; },
  };
}
export type TraceSource = 'fight' | 'training' | 'debug';
let latestTrace = { source: 'debug' as TraceSource, status: 'idle', error: null as string | null };
export const readSensorTraceStatus = () => latestTrace;
export function createSensorTrace(source: TraceSource = 'debug') {
  const buffer = createTraceBuffer();
  let timer: number | undefined;
  let pending: Promise<boolean> | null = null;
  let status: 'idle' | 'recording' | 'uploading' | 'uploaded' | 'queued' | 'failed' = 'idle';
  let error: string | null = null;
  const publish = () => { latestTrace = { source, status, error }; };
  const payload = () => ({ ...buffer.data({ userAgent: navigator.userAgent, platform: navigator.platform }), source,
    automated: navigator.webdriver === true, syntheticSensors: (window as Window & { __kaijuSyntheticSensors?: boolean }).__kaijuSyntheticSensors === true });
  const onPageHide = () => {
    if (status !== 'recording') return;
    buffer.stop(); window.clearTimeout(timer);
    const data = payload();
    // Safari caps queued unload data at64KiB; keep a representative compact trace.
    let body = JSON.stringify(data);
    while (new TextEncoder().encode(body).byteLength > 58_000 && data.samples.length > 1) {
      data.samples = data.samples.filter((sample, i) => sample.type === 'gesture' || i % 2 === 0);
      body = JSON.stringify(data);
      if (data.samples.every(sample => sample.type === 'gesture')) { data.samples = data.samples.slice(-100); body = JSON.stringify(data); break; }
    }
    try {
      if (navigator.sendBeacon?.('/api/trace', new Blob([body], { type: 'application/json' }))) { status = 'queued'; publish(); return; }
      void fetch('/api/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch { /* Normal20s upload still reports errors in the debug panel. */ }
  };
  window.addEventListener?.('pagehide', onPageHide);
  const api = {
    get active() { return buffer.active; }, get status() { return status; }, get error() { return error; },
    start() { if (buffer.active || pending) return; buffer.start(); status = 'recording'; error = null;
      publish(); window.clearTimeout(timer); timer = window.setTimeout(() => { void api.upload(); }, 20_000); },
    add: buffer.add,
    async upload(): Promise<boolean> {
      if (pending) return pending;
      if (status !== 'recording' && status !== 'failed') return status === 'uploaded';
      buffer.stop(); window.clearTimeout(timer); status = 'uploading';
      const body = JSON.stringify(payload()); publish();
      pending = (async () => {
        try {
          if (new TextEncoder().encode(body).byteLength > 1_900_000) throw new Error('Trace exceeds size cap');
          const response = await fetch('/api/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60_000 });
          if (!response.ok) throw new Error(`Trace upload HTTP ${response.status}`);
          status = 'uploaded'; error = null; return true;
        } catch (e) { status = 'failed'; error = String(e); return false; }
      })();
      try { return await pending; }
      finally { pending = null; publish(); }
    },
    dispose() { window.removeEventListener?.('pagehide', onPageHide); window.clearTimeout(timer); if (status === 'recording') void api.upload(); },
  };
  return api;
}
export type SensorTrace = ReturnType<typeof createSensorTrace>;

const automaticStarts = new WeakMap<Window, Partial<Record<TraceSource, number>>>();
/** Automatic capture: at most one start per source/minute per page. No stored identity. */
export function startAutomaticTrace(trace: SensorTrace, source: TraceSource): boolean {
  const starts = automaticStarts.get(window) ?? {};
  const now = Date.now();
  if (now - (starts[source] ?? -Infinity) < 60_000) return false;
  starts[source] = now; automaticStarts.set(window, starts); trace.start(); return true;
}
