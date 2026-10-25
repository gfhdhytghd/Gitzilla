// Browser-only diagnostic observers. Weak references avoid keeping disposed canvases/contexts alive.
export function installRematchProbe() {
  const w = window as any;
  const started = performance.now();
  const doc = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stack = () => new Error().stack?.split('\n').slice(2, 7).join('\n') ?? '';
  const bounded = (items: any[], value: any, max = 40) => { items.push(value); if (items.length > max) items.shift(); };
  const matrix = (ctx: CanvasRenderingContext2D) => {
    const m = ctx.getTransform(); return [m.a, m.b, m.c, m.d, m.e, m.f];
  };
  const timers = new Map<number, any>();
  let timeoutCreated = 0, intervalCreated = 0;
  const nativeTimeout = w.setTimeout.bind(w), nativeInterval = w.setInterval.bind(w);
  const nativeClearTimeout = w.clearTimeout.bind(w), nativeClearInterval = w.clearInterval.bind(w);
  w.setTimeout = (fn: any, ms?: number, ...args: any[]) => {
    timeoutCreated++;
    let id: number;
    id = nativeTimeout((...values: any[]) => { timers.delete(id); if (typeof fn === 'function') fn.apply(w, values); else (0, eval)(fn); }, ms, ...args);
    timers.set(id, { kind: 'timeout', ms, source: stack() }); return id;
  };
  w.setInterval = (fn: any, ms?: number, ...args: any[]) => {
    intervalCreated++; const id = nativeInterval(fn, ms, ...args);
    timers.set(id, { kind: 'interval', ms, source: stack() }); return id;
  };
  w.clearTimeout = (id: number) => { timers.delete(id); nativeClearTimeout(id); };
  w.clearInterval = (id: number) => { timers.delete(id); nativeClearInterval(id); };

  const nativeRAF = w.requestAnimationFrame.bind(w), nativeCancel = w.cancelAnimationFrame.bind(w);
  const callbacks = new WeakMap<Function, number>();
  const pending = new Map<number, number>(), chains = new Map<number, any>();
  let currentChain = 0, nextChain = 0, rafCreated = 0, rafCalls = 0;
  let lastFrameSample = 0, frameSerial = 0;
  const contexts: any[] = [];
  const contextIds = new WeakMap<object, number>();
  const canvasContexts = new WeakMap<HTMLCanvasElement, any>();
  const frames: any[] = [], gameFrames: any[] = [], heroFrames: any[] = [], stageFrames: any[] = [];
  let heroCapture: any = null, lastHero = 0, lastStage = 0;
  let epoch = 0, epochAt = 0, lastVisTime = NaN, gameAtDraw: any = null;
  let first3sHeroFrames: any[] = [];
  const memIds = new WeakMap<object, number>(); let nextMemId = 0;
  const events: any[] = [];
  const frameStart = (now: number) => {
    if (now - lastFrameSample < 250) return;
    lastFrameSample = now; frameSerial++;
    const canvasFrames = [];
    for (const cv of document.querySelectorAll('canvas')) {
      const entry = canvasContexts.get(cv), ctx = entry?.context.deref();
      if (!entry || entry.kind !== '2d' || !ctx) continue;
      const m = matrix(ctx);
      canvasFrames.push({ id: entry.id, className: cv.className, matrix: m, identity: m.every((n, i) => Math.abs(n - [1, 0, 0, 1, 0, 0][i]) < 1e-8),
        saveDepth: entry.depth, maxSaveDepth: entry.maxDepth });
    }
    bounded(frames, { at: now, canvases: canvasFrames });
  };
  w.requestAnimationFrame = (fn: FrameRequestCallback) => {
    rafCreated++;
    let chain = callbacks.get(fn);
    if (!chain) { chain = currentChain || ++nextChain; callbacks.set(fn, chain); }
    if (!chains.has(chain)) chains.set(chain, { id: chain, source: stack(), calls: 0, last: 0 });
    const id = nativeRAF((now: number) => {
      pending.delete(id); const old = currentChain; currentChain = chain!;
      const info = chains.get(chain!); info.calls++; info.last = performance.now(); rafCalls++;
      frameStart(now);
      try { fn.call(w, now); } finally { currentChain = old; }
    });
    pending.set(id, chain); return id;
  };
  w.cancelAnimationFrame = (id: number) => { pending.delete(id); nativeCancel(id); };

  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  const callbackIds = new WeakMap<object, number>(); let callbackNumber = 0;
  const globalListeners = new Map<string, any>();
  EventTarget.prototype.addEventListener = function(type: string, callback: any, options?: any) {
    if ((this === document || this === window) && callback) {
      if (!callbackIds.has(callback)) callbackIds.set(callback, ++callbackNumber);
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      const key = `${this === document ? 'document' : 'window'}:${type}:${callbackIds.get(callback)}:${capture}`;
      if (!globalListeners.has(key)) {
        const info: any = { target: this === document ? 'document' : 'window', type, capture, source: stack(), signal: options?.signal };
        // once listeners are decremented when delivered; preserve original removeEventListener identity.
        if (options?.once) info.wrapper = function(this: EventTarget, event: Event) {
          globalListeners.delete(key);
          if (typeof callback === 'function') callback.call(this, event); else callback.handleEvent(event);
        };
        globalListeners.set(key, info);
      }
      return add.call(this, type, globalListeners.get(key).wrapper ?? callback, options);
    }
    return add.call(this, type, callback, options);
  };
  EventTarget.prototype.removeEventListener = function(type: string, callback: any, options?: any) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    const key = `${this === document ? 'document' : 'window'}:${type}:${callbackIds.get(callback)}:${capture}`;
    const info = globalListeners.get(key); globalListeners.delete(key);
    return remove.call(this, type, info?.wrapper ?? callback, options);
  };

  const getContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = function(kind: string, ...args: any[]) {
    const ctx = (getContext as any).call(this, kind, ...args);
    if (ctx && !contextIds.has(ctx)) {
      const id = contexts.length + 1; contextIds.set(ctx, id);
      const info = { id, kind, canvas: new WeakRef(this), context: new WeakRef(ctx), source: stack(), lost: false, depth: 0, maxDepth: 0,
        createdAt: performance.now(), firstReset: null as any, resetFrame: -1, losses: 0 };
      contexts.push(info);
      canvasContexts.set(this, info);
      if (/webgl/.test(kind)) {
        add.call(this, 'webglcontextlost', () => { info.lost = true; info.losses++; bounded(events, { type: 'webglcontextlost', id, at: performance.now() }); });
        add.call(this, 'webglcontextrestored', () => { info.lost = false; bounded(events, { type: 'webglcontextrestored', id, at: performance.now() }); });
      }
    }
    return ctx;
  };
  const proto = CanvasRenderingContext2D.prototype as any;
  const rawSave = proto.save, rawRestore = proto.restore, rawSetTransform = proto.setTransform;
  proto.save = function(...args: any[]) { const e = contexts[(contextIds.get(this) ?? 0) - 1]; if (e) { e.depth++; e.maxDepth = Math.max(e.maxDepth, e.depth); } return rawSave.apply(this, args); };
  proto.restore = function(...args: any[]) { const e = contexts[(contextIds.get(this) ?? 0) - 1]; if (e) e.depth = Math.max(0, e.depth - 1); return rawRestore.apply(this, args); };
  proto.setTransform = function(...args: any[]) {
    const result = rawSetTransform.apply(this, args), e = contexts[(contextIds.get(this) ?? 0) - 1];
    if (e && this.canvas.isConnected && e.resetFrame !== frameSerial) { e.resetFrame = frameSerial; e.firstReset = matrix(this); }
    return result;
  };
  const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    if (!heroCapture || heroCapture.ctx !== ctx || ![x, y, width, height].every(Number.isFinite)) return;
    // Whole draw footprint, including weapon/ring/text; not a CSS box or an inferred simulation hitbox.
    const m = ctx.getTransform();
    for (const [a, b] of [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]) {
      const px = m.a * a + m.c * b + m.e, py = m.b * a + m.d * b + m.f;
      heroCapture.minX = Math.min(heroCapture.minX, px); heroCapture.maxX = Math.max(heroCapture.maxX, px);
      heroCapture.minY = Math.min(heroCapture.minY, py); heroCapture.maxY = Math.max(heroCapture.maxY, py);
    }
    heroCapture.draws++;
  };
  for (const method of ['fillRect', 'strokeRect', 'clearRect', 'drawImage']) {
    const original = proto[method];
    proto[method] = function(...args: any[]) {
      if (heroCapture && method === 'drawImage') {
        if (args.length === 3) rect(this, args[1], args[2], args[0].width, args[0].height);
        else if (args.length === 5) rect(this, args[1], args[2], args[3], args[4]);
        else rect(this, args[5], args[6], args[7], args[8]);
      } else if (heroCapture && method !== 'clearRect') rect(this, args[0], args[1], args[2], args[3]);
      return original.apply(this, args);
    };
  }
  const sockets: any[] = [], audio: any[] = [];
  const NativeWS = w.WebSocket;
  w.WebSocket = class extends NativeWS {
    constructor(...args: any[]) { super(...args); sockets.push({ socket: new WeakRef(this), url: String(args[0]).replace(/\?.*$/, ''), source: stack() }); }
  };
  for (const key of ['AudioContext', 'webkitAudioContext']) {
    const Constructor = w[key]; if (!Constructor) continue;
    w[key] = class extends Constructor {
      constructor(...args: any[]) { super(...args); audio.push({ context: new WeakRef(this), source: stack() }); }
    };
  }
  w.__rematchProbe = {
    fx: null,
    squash(id: string, value: any) { if (heroCapture?.id === id) heroCapture.squash = value; },
    memory(p: any, m: any, t: number) {
      if (heroCapture?.id !== p.id) return;
      if (!memIds.has(m)) memIds.set(m, ++nextMemId);
      heroCapture.memory = { objectId: memIds.get(m), renderTime: t, previousT: m.t, hurtT: m.hurtT, dashT: m.dashT, reviveT: m.reviveT,
        downT: m.downT, kbT: m.kbT, shotT: m.shotT, moveT: m.moveT, flip: m.flip, alive: m.alive, hp: m.hp,
        history: m.hist.length, ghosts: m.ghosts.length, particles: m.parts.length };
    },
    game(value: any) {
      const now = performance.now();
      if (!epoch || value.visTime < lastVisTime - 0.5) { epoch++; epochAt = now; first3sHeroFrames = []; }
      lastVisTime = value.visTime; gameAtDraw = { at: now, ...value };
      if (!gameFrames.length || now - gameFrames.at(-1).at >= 250) bounded(gameFrames, gameAtDraw);
    },
    beginHero(ctx: CanvasRenderingContext2D, p: any, isYou: boolean) {
      const dense = epoch > 0 && performance.now() - epochAt <= 3000;
      if (!isYou || (!dense && performance.now() - lastHero < 750)) return;
      lastHero = performance.now();
      const previous = heroCapture;
      const sample = heroCapture = { ctx, at: lastHero, epoch, sinceEpochMs: lastHero - epochAt, id: p.id, alive: p.alive,
        facing: [...p.facing], pos: [p.x, p.y], game: gameAtDraw, matrix: matrix(ctx), minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, draws: 0 };
      return () => {
        const { ctx: _, ...value } = sample, cv = ctx.canvas as HTMLCanvasElement, r = cv.getBoundingClientRect();
        const measured = { ...value, connected: cv.isConnected, backingSize: [cv.width, cv.height],
          cssBounds: cv.isConnected && sample.draws ? { x: r.x + sample.minX * r.width / cv.width, y: r.y + sample.minY * r.height / cv.height,
            w: (sample.maxX - sample.minX) * r.width / cv.width, h: (sample.maxY - sample.minY) * r.height / cv.height } : null };
        bounded(heroFrames, measured);
        if (dense) first3sHeroFrames.push(measured);
        heroCapture = previous;
      };
    },
    stage(renderer: any, look: any, rig: any, state: any, extras: any) {
      if (performance.now() - lastStage < 750) return; lastStage = performance.now();
      const players = state.players.filter((p: any) => !p.eliminated), index = players.findIndex((p: any) => p.id === extras.you);
      const mesh = look.heroMeshes[index];
      if (!mesh || !rig?.camera) return;
      const box = mesh.geometry.boundingBox; if (!box) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox, cv = renderer.domElement, r = cv.getBoundingClientRect();
      mesh.updateWorldMatrix(true, false); const points = [];
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const v = mesh.position.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld).project(rig.camera);
        points.push([r.x + (v.x + 1) * r.width / 2, r.y + (1 - v.y) * r.height / 2]);
      }
      bounded(stageFrames, { at: lastStage, hero: extras.you, meshScale: mesh.scale.toArray(), camera: rig.camera.position.toArray(),
        projectedGeometryBounds: { x: Math.min(...points.map(p => p[0])), y: Math.min(...points.map(p => p[1])),
          w: Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])), h: Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])) },
        rendererInfo: { memory: { ...renderer.info.memory }, render: { ...renderer.info.render } } });
    },
    sample() {
      const now = performance.now(), activeListeners = [...globalListeners.values()].filter(x => !x.signal?.aborted);
      const contextCounts: Record<string, any> = { created: contexts.length, byKind: {}, reachableByKind: {}, connectedByKind: {}, webglLostEvents: 0 };
      for (const e of contexts) {
        contextCounts.byKind[e.kind] = (contextCounts.byKind[e.kind] ?? 0) + 1;
        if (e.context.deref()) contextCounts.reachableByKind[e.kind] = (contextCounts.reachableByKind[e.kind] ?? 0) + 1;
        if (e.canvas.deref()?.isConnected) contextCounts.connectedByKind[e.kind] = (contextCounts.connectedByKind[e.kind] ?? 0) + 1;
        contextCounts.webglLostEvents += e.losses;
      }
      return { documentId: doc, ageMs: now - started, url: location.pathname + location.search,
        canvases: [...document.querySelectorAll('canvas')].map(cv => ({ className: cv.className, width: cv.width, height: cv.height, css: [cv.clientWidth, cv.clientHeight] })),
        contextCounts,
        // Preserve every GPU context and connected 2D context; bound verbose offscreen 2D examples. Totals above are exact.
        contexts: contexts.filter(e => /webgl/.test(e.kind) || e.canvas.deref()?.isConnected || e.id > contexts.length - 48).map(e => ({ id: e.id, kind: e.kind, canvasAlive: !!e.canvas.deref(), contextAlive: !!e.context.deref(),
          connected: !!e.canvas.deref()?.isConnected, lost: e.lost, depth: e.depth, maxDepth: e.maxDepth, firstReset: e.firstReset, source: e.source })),
        raf: { created: rafCreated, calls: rafCalls, pending: pending.size, activeChains: [...chains.values()].filter(c => now - c.last < 1500 || [...pending.values()].includes(c.id)) },
        timers: { created: { timeout: timeoutCreated, interval: intervalCreated }, active: [...timers.values()] },
        sockets: sockets.map(x => ({ url: x.url, state: x.socket.deref()?.readyState ?? null })),
        audio: audio.map(x => ({ state: x.context.deref()?.state ?? 'collected', source: x.source })),
        listeners: activeListeners.map(({ wrapper, signal, ...info }) => info), events: [...events], frames: [...frames], gameFrames: [...gameFrames],
        heroFrames: [...heroFrames], first3sHeroFrames: [...first3sHeroFrames], epoch, sinceEpochMs: now - epochAt,
        stageFrames: [...stageFrames], fx: this.fx?.() ?? null };
    },
  };
}
