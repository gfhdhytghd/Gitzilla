// Optional ▶ Run for the classroom editor: runs the student's Python in THEIR browser (Pyodide in a Web Worker,
// loaded lazily from cdn.jsdelivr.net). Never sent to or executed by the server, and never used for grading.
// One warm worker is reused between runs; a run that exceeds the time limit kills the worker (a fresh one loads
// next time). If Pyodide can't load (offline, blocked CDN, no Worker/WebAssembly), `available()` turns false and
// the UI hides Run.
import type { InAppFile } from "../../shared/classroom.ts";

export const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

export interface RunResult { stdout: string; stderr: string; timedOut: boolean; ms: number }

const WORKER_SRC = `
let py = null;
const out = [], err = [];
self.onmessage = async (e) => {
  const m = e.data;
  if (m.t === "load") {
    try {
      importScripts(m.url + "pyodide.js");
      py = await loadPyodide({ indexURL: m.url });
      py.setStdout({ batched: (s) => out.push(s) });
      py.setStderr({ batched: (s) => err.push(s) });
      self.postMessage({ t: "ready" });
    } catch (x) { self.postMessage({ t: "fail", error: String(x && x.message || x) }); }
    return;
  }
  if (m.t === "run") {
    out.length = 0; err.length = 0;
    const lines = (m.stdin || "").split("\\n");
    py.setStdin({ stdin: () => (lines.length ? lines.shift() : null), autoEOF: true });
    const t0 = performance.now();
    try {
      // fresh working dir per run with the student's files; the entry runs as __main__
      const root = "/home/pyodide/run" + m.id;
      for (const f of m.files) {
        const parts = (root + "/" + f.path).split("/"); parts.pop();
        let d = ""; for (const p of parts) { if (!p) continue; d += "/" + p; try { py.FS.mkdir(d); } catch (_) {} }
        py.FS.writeFile(root + "/" + f.path, f.content);
      }
      py.runPython("import os, sys\\nos.chdir(" + JSON.stringify(root) + ")\\nsys.path.insert(0, " + JSON.stringify(root) + ")\\nimport runpy\\n__g = None");
      py.globals.set("__entry", m.entry);
      py.runPython("import runpy, traceback, sys\\ntry:\\n    runpy.run_path(__entry, run_name='__main__')\\nexcept SystemExit:\\n    pass\\nexcept BaseException:\\n    tb = traceback.format_exc().splitlines()\\n    tb = [l for l in tb if 'runpy' not in l and '<frozen' not in l]\\n    print('\\\\n'.join(tb), file=sys.stderr)\\nfinally:\\n    sys.path.pop(0)");
    } catch (x) { err.push(String(x && x.message || x)); }
    self.postMessage({ t: "done", id: m.id, stdout: out.join("\\n"), stderr: err.join("\\n"), ms: performance.now() - t0 });
  }
};`;

let worker: Worker | null = null;
let ready: Promise<boolean> | null = null;
let broken = typeof Worker === "undefined" || typeof WebAssembly === "undefined";
let seq = 0;

function boot(): Promise<boolean> {
  if (broken) return Promise.resolve(false);
  if (ready) return ready;
  ready = new Promise<boolean>((resolve) => {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
    } catch {
      broken = true;
      return resolve(false);
    }
    const fail = () => { broken = true; worker?.terminate(); worker = null; ready = null; resolve(false); };
    const timer = setTimeout(fail, 45000); // first load downloads ~10 MB
    worker.onmessage = (e) => {
      if (e.data.t === "ready") { clearTimeout(timer); resolve(true); }
      else if (e.data.t === "fail") { clearTimeout(timer); fail(); }
    };
    worker.onerror = () => { clearTimeout(timer); fail(); };
    worker.postMessage({ t: "load", url: PYODIDE_URL });
  });
  return ready;
}

/** false once Pyodide failed to load in this tab (hide Run). */
export const runAvailable = () => !broken;

/** Start downloading Pyodide in the background (e.g. when the editor opens). */
export const warmUp = () => { void boot(); };

export async function runPython(files: InAppFile[], entry: string, opts: { timeoutMs?: number; stdin?: string } = {}): Promise<RunResult> {
  if (!(await boot()) || !worker) throw new Error("Python couldn't load in this browser.");
  const w = worker, id = ++seq, limit = opts.timeoutMs ?? 5000;
  return new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => {
      // runaway loop: kill the worker; the next run boots a fresh one
      w.terminate();
      if (worker === w) { worker = null; ready = null; }
      resolve({ stdout: "", stderr: `Stopped after ${limit / 1000}s: is there a loop that never ends?`, timedOut: true, ms: limit });
    }, limit);
    w.onmessage = (e) => {
      if (e.data.t !== "done" || e.data.id !== id) return;
      clearTimeout(timer);
      resolve({ stdout: e.data.stdout, stderr: e.data.stderr, timedOut: false, ms: Math.round(e.data.ms) });
    };
    w.postMessage({ t: "run", id, files, entry, stdin: opts.stdin ?? "" });
  });
}
