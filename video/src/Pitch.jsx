import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame,
  continueRender, delayRender} from 'remotion';
import {useEffect, useState} from 'react';
import {C, F, FPS, W, H, FONT_CSS, easeOut, easeInOut, clamp01, s2f} from './theme';
import {FILM} from './film';
import CAPTIONS from './captions.json';

// ---------- fonts: block the render until the pixel fonts are in ----------
const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const fams = ['16px "Press Start 2P"', '16px Silkscreen', 'bold 16px Silkscreen', '16px Unifont', '16px VT323'];
    Promise.all(fams.map((f) => document.fonts.load(f))).then(() => continueRender(handle), () => continueRender(handle));
  }, [handle]);
};

// ---------- camera over one recorded take ----------
// keys: clip-local seconds (output time); x/y = view centre in source px; z = zoom over "cover".
const view = (keys, t) => {
  if (!keys?.length) return {x: null, y: null, z: 1};
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) {
      const span = b.move ?? Math.min(1.2, b.t - a.t);
      const p = easeInOut(clamp01((t - (b.t - span)) / span));
      return {x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, z: a.z + (b.z - a.z) * p};
    }
  }
  return keys[keys.length - 1];
};

export const Take = ({src, from = 0, rate = 1, keys, w = W, h = H, sw = 1920, sh = 1080, style}) => {
  const f = useCurrentFrame();
  const v = view(keys, f / FPS);
  const s = Math.max(w / sw, h / sh) * (v.z ?? 1);
  const halfW = w / 2 / s, halfH = h / 2 / s;
  const cx = Math.min(sw - halfW, Math.max(halfW, v.x ?? sw / 2));
  const cy = Math.min(sh - halfH, Math.max(halfH, v.y ?? sh / 2));
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: '#000', ...style}}>
      <OffthreadVideo src={staticFile(`raw/${src}.mp4`)} trimBefore={Math.round(from * FPS)} playbackRate={rate} muted
        style={{position: 'absolute', left: 0, top: 0, width: sw, height: sh, transformOrigin: '0 0', maxWidth: 'none',
          transform: `translate(${w / 2 - cx * s}px, ${h / 2 - cy * s}px) scale(${s})`}} />
    </div>
  );
};

// ---------- overlays ----------
const Scanlines = () => (
  <AbsoluteFill style={{pointerEvents: 'none',
    background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 3px)',
    boxShadow: 'inset 0 0 220px rgba(0,0,0,0.55)'}} />
);

// deterministic RGB-bar glitch across a cut (len frames, peaks in the middle)
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
export const Glitch = ({len = 8}) => {
  const f = useCurrentFrame();
  if (f >= len) return null;
  const k = 1 - Math.abs(f / (len - 1) * 2 - 1);
  const bars = Array.from({length: 9}, (_, i) => ({y: hash(f * 13 + i) * H, h: 6 + hash(f * 7 + i * 3) * 60,
    x: (hash(f * 5 + i) - 0.5) * 220 * k, c: [C.pink, C.green, C.cyan][i % 3]}));
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
      {bars.map((b, i) => <div key={i} style={{position: 'absolute', left: b.x, top: b.y, width: W, height: b.h,
        background: b.c, opacity: 0.55 * k}} />)}
      <AbsoluteFill style={{background: '#fff', opacity: 0.18 * k}} />
    </AbsoluteFill>
  );
};

const SectionTag = ({n, title}) => {
  const f = useCurrentFrame();
  const p = easeOut(clamp01((f - 6) / 10));
  return (
    <div style={{position: 'absolute', left: 48, top: 40, display: 'flex', alignItems: 'stretch',
      transform: `translateX(${(1 - p) * -40}px)`, opacity: p, filter: 'drop-shadow(4px 4px 0 rgba(0,0,0,0.7))'}}>
      <div style={{font: `16px/1 ${F.pix}`, background: C.green, color: C.bg, padding: '14px 14px 12px'}}>{n}</div>
      <div style={{font: `16px/1 ${F.pix}`, background: C.panel, color: C.green, padding: '14px 18px 12px',
        border: `3px solid ${C.green}`, borderLeft: 'none', letterSpacing: '0.04em'}}>{title}</div>
    </div>
  );
};

// one caption chunk, lower third, timed from the VO clip
const Captions = ({id, at, left = 0}) => {
  const f = useCurrentFrame();
  const t = f / FPS - at;
  const cap = CAPTIONS[id];
  if (!cap) return null;
  const cur = cap.chunks.find((c) => t >= c.from - 0.05 && t < c.to + 0.25);
  if (!cur) return null;
  const age = t - cur.from;
  const pop = easeOut(clamp01(age / 0.12));
  return (
    <div style={{position: 'absolute', left, right: 0, bottom: 64, display: 'flex', justifyContent: 'center'}}>
      <div style={{font: `52px/1.15 ${F.body}`, color: C.ink, background: 'rgba(4,7,10,0.86)', padding: '14px 30px 12px',
        borderLeft: `8px solid ${C.green}`, boxShadow: '6px 6px 0 rgba(0,0,0,0.6)', maxWidth: 1500, textAlign: 'center',
        transform: `translateY(${(1 - pop) * 12}px)`, opacity: 0.4 + 0.6 * pop}}>{cur.text}</div>
    </div>
  );
};

// pixel callout chips that pop in at a time (clip-local seconds)
const Chips = ({chips = []}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  return chips.map((c, i) => {
    const age = t - c.t;
    if (age < 0 || age > (c.len ?? 3)) return null;
    const p = easeOut(clamp01(age / 0.18)), out = clamp01(((c.len ?? 3) - age) / 0.2);
    return (
      <div key={i} style={{position: 'absolute', left: c.x, top: c.y, transform: `scale(${0.6 + 0.4 * p})`,
        transformOrigin: c.origin ?? '0 50%', opacity: p * out,
        font: `${c.size ?? 24}px/1.3 ${F.pix}`, color: C.bg, background: c.color ?? C.amber, padding: '12px 16px 10px',
        boxShadow: '5px 5px 0 rgba(0,0,0,0.7)', whiteSpace: 'pre'}}>{c.text}</div>
    );
  });
};

// ---------- phone frame (tilts with the synthetic sensor choreography of the capture) ----------
const PhoneFrame = ({src, from = 0, rate = 1, x, y, hgt = 940, tiltAt, keys}) => {
  const f = useCurrentFrame();
  const t = f / FPS * rate + from;
  const w = hgt * 780 / 1688;
  let ry = 0, rx = 0;
  if (tiltAt !== undefined) {
    const ct = t - tiltAt; // seconds since the choreography started
    if (ct > 0) { ry = 14 * Math.sin(2 * Math.PI * ct / 6) * 0.9; rx = -10 * Math.sin(2 * Math.PI * ct / 4.3) * 0.7; }
  }
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w + 36, height: hgt + 36, perspective: 1400}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: 54, background: '#11161c',
        border: '3px solid #2b3a33', boxShadow: `0 0 0 3px #000, 0 30px 60px rgba(0,0,0,0.7), 0 0 50px ${C.green}33`,
        transform: `rotateY(${ry}deg) rotateX(${rx}deg)`, transformStyle: 'preserve-3d'}}>
        <div style={{position: 'absolute', left: 18, top: 18, width: w, height: hgt, borderRadius: 38, overflow: 'hidden'}}>
          <Take src={src} from={from} rate={rate} keys={keys} w={w} h={hgt} sw={780} sh={1688} />
        </div>
        <div style={{position: 'absolute', left: '50%', top: 26, width: 110, height: 28, marginLeft: -55,
          borderRadius: 14, background: '#000'}} />
      </div>
    </div>
  );
};

const Label = ({x, y, text, color = C.green}) => (
  <div style={{position: 'absolute', left: x, top: y, font: `18px/1 ${F.pix}`, color, letterSpacing: '0.06em',
    textShadow: '3px 3px 0 #000'}}>{text}</div>
);

// ---------- brand ----------
const Lockup = ({scale = 1, at = 0}) => {
  const f = useCurrentFrame();
  const t = f / FPS - at;
  const m = easeOut(clamp01(t / 0.35)), wm = easeOut(clamp01((t - 0.15) / 0.4));
  const bob = Math.round(Math.sin(t * 6) * 3);
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 56 * scale}}>
      <Img src={staticFile('brand/gitzilla-mark.svg')} style={{width: 260 * scale, imageRendering: 'pixelated',
        transform: `translateY(${bob}px) scale(${0.4 + 0.6 * m})`, opacity: m}} />
      <Img src={staticFile('brand/gitzilla-wordmark.png')} style={{width: 900 * scale,
        transform: `scale(${0.85 + 0.15 * wm}) rotate(${(1 - wm) * -4}deg)`, opacity: wm,
        filter: 'drop-shadow(8px 8px 0 rgba(0,0,0,0.75))'}} />
    </div>
  );
};

const TitleCard = ({bg}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const sub = easeOut(clamp01((t - 0.7) / 0.4));
  return (
    <AbsoluteFill>
      <Take {...bg} style={{filter: 'blur(6px) brightness(0.35)'}} />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 56}}>
        <Lockup scale={1} at={0.05} />
        <div style={{font: `26px/1.5 ${F.pix}`, color: C.ink, opacity: sub, transform: `translateY(${(1 - sub) * 16}px)`,
          textShadow: '4px 4px 0 #000', textAlign: 'center'}}>
          A CO-OP BOSS FIGHT<br />MADE FROM <span style={{color: C.green}}>REAL GITHUB REPOS</span></div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const EndCard = ({bg}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const a = (d) => easeOut(clamp01((t - d) / 0.4));
  const fade = clamp01((8 - t) / 1.2);
  return (
    <AbsoluteFill style={{background: C.bg, opacity: fade}}>
      <Take {...bg} style={{filter: 'blur(8px) brightness(0.22)'}} />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 44}}>
        <Lockup scale={0.9} at={0.1} />
        <div style={{font: `54px/1 ${F.pix}`, color: C.green, opacity: a(0.8), textShadow: '6px 6px 0 #000'}}>gitzilla.wilflin.me</div>
        <div style={{font: `40px/1 ${F.body}`, color: C.ink, opacity: a(1.1)}}>github.com/gfhdhytghd/Gitzilla</div>
        <div style={{font: `bold 26px/1 ${F.small}`, color: C.amber, opacity: a(1.4), letterSpacing: '0.08em'}}>
          BUILT IN 24 HOURS AT HACKPSU</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const TechCards = ({bg, cards}) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  return (
    <AbsoluteFill>
      <Take {...bg} style={{filter: 'blur(5px) brightness(0.3)'}} />
      <div style={{position: 'absolute', left: 120, top: 150, right: 120, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40}}>
        {cards.map((c, i) => {
          const p = easeOut(clamp01((t - c.t) / 0.35));
          return (
            <div key={i} style={{background: C.panel, border: `4px solid ${c.color}`, padding: '34px 38px', minHeight: 250,
              boxShadow: '10px 10px 0 rgba(0,0,0,0.7)', opacity: p, transform: `translateY(${(1 - p) * 40}px)`}}>
              <div style={{font: `28px/1.2 ${F.pix}`, color: c.color, marginBottom: 22}}>{c.title}</div>
              <div style={{font: `36px/1.3 ${F.body}`, color: C.ink}}>{c.body}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- shot dispatcher ----------
const Shot = ({s}) => {
  switch (s.kind) {
    case 'title': return <TitleCard bg={s.bg} />;
    case 'end': return <EndCard bg={s.bg} />;
    case 'cards': return <TechCards bg={s.bg} cards={s.cards} />;
    case 'split': return (
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 70% 50%, #10241a 0%, ${C.bg} 70%)`}}>
        <PhoneFrame {...s.phone} />
        <div style={{position: 'absolute', left: s.big.x, top: s.big.y, width: s.big.w, height: s.big.w * 9 / 16,
          border: `4px solid ${C.green}`, boxShadow: '12px 12px 0 rgba(0,0,0,0.6)'}}>
          <Take {...s.big} w={s.big.w - 8} h={s.big.w * 9 / 16 - 8} />
        </div>
        {(s.labels ?? []).map((l, i) => <Label key={i} {...l} />)}
      </AbsoluteFill>
    );
    default: return <Take {...s} />;
  }
};

export const Pitch = () => {
  useFonts();
  const total = s2f(FILM.length);
  const f = useCurrentFrame();
  // music ducks under the voiceover
  const vo = FILM.sections.map((sec) => [sec.at + sec.voAt, sec.at + sec.voAt + (CAPTIONS[sec.vo]?.dur ?? 0)]);
  const musicVol = (fr) => {
    const t = fr / FPS;
    let duck = 0;
    for (const [a, b] of vo) duck = Math.max(duck, clamp01(Math.min((t - a + 0.3) / 0.3, (b + 0.4 - t) / 0.4)));
    const fadeOut = interpolate(fr, [total - 2 * FPS, total], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return (0.85 - 0.55 * duck) * fadeOut;
  };
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <style>{FONT_CSS}</style>
      <Audio src={staticFile('music/score.wav')} volume={musicVol} />
      {FILM.sections.map((sec) => (
        <Sequence key={sec.id} from={s2f(sec.at)} durationInFrames={s2f(sec.len)} name={sec.id}>
          {sec.shots.map((s, i) => (
            <Sequence key={i} from={s2f(s.at)} durationInFrames={s2f(s.len)} name={`${sec.id}:${s.src ?? s.kind}`}>
              <Shot s={s} />
              <Chips chips={s.chips} />
              {i > 0 && !s.noGlitch && <Glitch len={6} />}
            </Sequence>
          ))}
          {sec.tag && <Sequence from={s2f(sec.tagAt ?? 0)} durationInFrames={s2f(sec.len - (sec.tagAt ?? 0))}><SectionTag {...sec.tag} /></Sequence>}
          {sec.vo && <Sequence from={s2f(sec.voAt)}><Audio src={staticFile(`vo/${sec.vo}.wav`)} volume={1} /></Sequence>}
          {sec.vo && !sec.noCaptions && <Captions id={sec.vo} at={sec.voAt} left={sec.captionLeft ?? 0} />}
          <Glitch len={10} />
        </Sequence>
      ))}
      <Scanlines />
    </AbsoluteFill>
  );
};
