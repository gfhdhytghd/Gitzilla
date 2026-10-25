// The pitch, as data. Times in seconds: sections are absolute (bar-locked, 1 bar = 2 s), shots are section-local,
// camera keys and chips are shot-local. Camera x/y are the view centre in source px, z = zoom over "cover".
// Raw takes come from video/capture/shots.mjs (see STORYBOARD.md for the shot list).

const PANEL = {x: 1290, y: 600, z: 1.3};       // genesis demo: the right-hand creature panel
const cam = (t, x, y, z, move) => ({t, x, y, z, ...(move ? {move} : {})});
const chip = (t, text, o = {}) => ({t, text, x: 64, y: 130, len: 3.2, ...o});

const TILT_AT = -1.56; // raid-phone: sensor choreography started 1.56 s before the first recorded frame

export const FILM = {
  length: 136,
  sections: [
    {id: 'hook', at: 0, len: 8, vo: '00-hook', voAt: 0.4, shots: [
      {at: 0, len: 2.6, src: 'genesis-boss', from: 0.15, rate: 1, keys: [cam(0, 470, 330, 2.1), cam(2.6, 560, 400, 1.8)]},
      {at: 2.6, len: 2.4, src: 'genesis-boss', from: 5.7, rate: 0.95, keys: [cam(0, 1290, 640, 1.75), cam(2.4, 1290, 620, 1.5)]},
      {at: 5, len: 3, kind: 'title', noGlitch: false, bg: {src: 'genesis-boss', from: 9, rate: 1, keys: [cam(0, 1290, 620, 1.4)]}},
    ]},

    {id: 'genesis', at: 8, len: 16, vo: '01-genesis', voAt: 0.5, tag: {n: '01', title: 'REPO => MONSTER'}, shots: [
      {at: 0, len: 4.5, src: 'genesis-boss', from: 0.6, rate: 0.7, keys: [cam(0, 960, 620, 1.12), cam(2.2, PANEL.x, PANEL.y, PANEL.z, 1.4)],
        chips: [chip(0.4, 'pallets/flask', {color: '#7dffc0'}), chip(2.4, 'IMPORT GRAPH · HEART · CYCLES', {y: 210})]},
      {at: 4.5, len: 4, src: 'genesis-boss', from: 3.5, rate: 0.75, keys: [cam(0, 430, 600, 1.75), cam(1.8, 430, 600, 1.75), cam(3.2, PANEL.x, PANEL.y, PANEL.z, 1.2)],
        chips: [chip(0.3, 'PYTHON 100% => ABYSSAL', {x: 1180, y: 160, color: '#ff3d8b', len: 3.6})]},
      {at: 8.5, len: 2.5, src: 'genesis-boss', from: 8.4, rate: 1, keys: [cam(0, 1290, 560, 1.45), cam(2.5, 1290, 720, 1.5)],
        chips: [chip(0.5, '5 LIMBS · 6 ATTACKS\nSAME THREAT BUDGET FOR EVERY BOSS', {y: 160, len: 2})]},
      {at: 11, len: 5, src: 'genesis-hero', from: 1.6, rate: 1.3, keys: [cam(0, PANEL.x, PANEL.y, PANEL.z)],
        chips: [chip(2.6, 'burntsushi/ripgrep => REGEX RANGER', {color: '#7dffc0', y: 160, len: 2.4}), chip(3.3, 'WEAPON: alloc(name_long())', {y: 240, len: 1.7})]},
    ]},

    {id: 'raid', at: 24, len: 32, vo: '02-raid', voAt: 0.5, tag: {n: '02', title: 'BOSS RAID'}, captionLeft: 640, shots: [
      {at: 0, len: 8.2, kind: 'split',
        phone: {src: 'raid-phone', from: 5.6, rate: 1, x: 90, y: 92, hgt: 900, tiltAt: TILT_AT},
        big: {src: 'raid-big', from: 5.6, rate: 1, sw: 1280, sh: 720, x: 640, y: 150, w: 1210},
        labels: [{x: 640, y: 112, text: 'BIG SCREEN · ANY BROWSER'}, {x: 600, y: 846, text: '◀ YOUR PHONE IS THE CONTROLLER', color: '#ffd23d'}],
        chips: [chip(4.4, 'TILT = MOVE', {x: 640, y: 880, color: '#3dff8b', len: 3.8}), chip(5.5, 'SWING = ATTACK', {x: 990, y: 880, len: 2.7}),
          chip(6.8, 'TWIST = DASH', {x: 1400, y: 880, color: '#ff3d8b', len: 1.4})]},
      {at: 8.2, len: 7, src: 'match', from: 4.6, rate: 1, keys: [cam(0, 1000, 560, 1.08)],
        chips: [chip(1.4, 'EVERY LIMB IS A REAL MODULE', {len: 2.8}), chip(4.4, 'ATTACKS ARE NAMED AFTER ITS OWN FUNCTIONS', {color: '#ff3d8b', len: 2.6})]},
      {at: 15.2, len: 2, src: 'arch-kaiju', from: 9, keys: [cam(0, 1290, 590, 1.3), cam(2, 1290, 600, 1.38)], chips: [chip(0.1, 'KAIJU', {y: 160, size: 40, color: '#3dff8b', len: 1.9})]},
      {at: 17.2, len: 2, src: 'arch-hydra', from: 9, keys: [cam(0, 1290, 590, 1.3), cam(2, 1290, 600, 1.38)], chips: [chip(0.1, 'HYDRA', {y: 160, size: 40, color: '#ffd23d', len: 1.9})]},
      {at: 19.2, len: 2, src: 'arch-mecha', from: 9, keys: [cam(0, 1290, 590, 1.3), cam(2, 1290, 600, 1.38)], chips: [chip(0.1, 'MECHA', {y: 160, size: 40, color: '#4fd8ff', len: 1.9})]},
      {at: 21.2, len: 2, src: 'arch-abyssal', from: 9, keys: [cam(0, 1290, 590, 1.3), cam(2, 1290, 600, 1.38)], chips: [chip(0.1, 'ABYSSAL', {y: 160, size: 40, color: '#ff3d8b', len: 1.9})]},
      {at: 23.2, len: 8.8, src: 'review', from: 0, rate: 1, keys: [cam(0, 960, 540, 1.0)],
        chips: [chip(0.3, 'CODE REVIEW: THE SQUAD MERGES A PERK', {y: 870, len: 3.2}), chip(3.8, 'PHASE 2 · BOSS RECOMPILED WITH -O3', {y: 870, color: '#ff3d8b', len: 3.4})]},
    ]},

    {id: 'organ', at: 56, len: 12, vo: '03-organ', voAt: 0.5, tag: {n: '03', title: 'ADOPT AN ORGAN'}, shots: [
      {at: 0, len: 12, src: 'autopsy', from: 0.3, rate: 1,
        keys: [cam(0, 960, 540, 1.0), cam(3.2, 575, 640, 1.75, 1.3), cam(7.6, 575, 660, 1.75), cam(9, 1460, 650, 1.65, 1.2)],
        chips: [chip(9.4, 'SCAN => A REAL GOOD-FIRST ISSUE', {x: 64, y: 860, color: '#3dff8b', len: 2.6})]},
    ]},

    {id: 'royale', at: 68, len: 20, vo: '04-royale', voAt: 0.5, tag: {n: '04', title: 'PVP ROYALE'}, shots: [
      {at: 0, len: 4.6, src: 'royale', from: 30.6, rate: 1, keys: [cam(0, 900, 520, 1.15)],
        chips: [chip(1.6, '8 REPOS · LAST ONE STANDING', {len: 3})]},
      {at: 4.6, len: 4.2, src: 'royale-lobby', from: 1.5, rate: 1, keys: [cam(0, 960, 560, 1.55), cam(2.4, 960, 560, 1.55), cam(3.6, 330, 790, 1.8, 1.1)],
        chips: [chip(0.5, 'POWER = TESTS + STARS + MODULARITY', {y: 860, color: '#3dff8b', len: 3.6})]},
      {at: 8.8, len: 6.4, src: 'royale-zone', from: 18.6, rate: 1.15, keys: [cam(0, 960, 540, 1.0)],
        chips: [chip(0.8, 'GC SWEEP: THE GARBAGE COLLECTOR CLOSES IN', {y: 860, color: '#ff3d8b', len: 5})]},
      {at: 15.2, len: 4.8, src: 'royale-autopsy', from: 3.2, rate: 1, keys: [cam(0, 960, 540, 1.0), cam(1.6, 1470, 700, 1.7, 1.0)],
        chips: [chip(2.4, 'EVERY KNOCKOUT IS A COMMIT', {x: 64, y: 860, len: 2.4})]},
    ]},

    {id: 'class', at: 88, len: 28, vo: '05-class', voAt: 0.5, tag: {n: '05', title: 'CLASSROOM'}, shots: [
      {at: 0, len: 3, src: 'class-teacher', from: 1.4, rate: 1, keys: [cam(0, 860, 520, 1.3)],
        chips: [chip(0.6, '9 PYTHON LESSONS · READY TO RUN', {y: 860, color: '#3dff8b', len: 2.4})]},
      {at: 3, len: 2.6, src: 'class-projector', from: 0.6, rate: 1, keys: [cam(0, 640, 520, 1.25)],
        chips: [chip(0.4, 'PROJECTOR: QR + ROOM CODE', {x: 1220, y: 860, len: 2.2})]},
      {at: 5.6, len: 10.4, kind: 'split',
        phone: {src: 'class-phone', from: 0.5, rate: 1.1, x: 90, y: 92, hgt: 900},
        big: {src: 'class-phone', from: 0.5, rate: 1.1, sw: 780, sh: 1688, x: 640, y: 150, w: 1210,
          keys: [cam(0, 390, 400, 1), cam(3.0, 390, 400, 1), cam(3.9, 390, 1040, 1, 0.8), cam(9.2, 390, 1040, 1), cam(9.95, 390, 330, 1, 0.6)]},
        labels: [{x: 640, y: 112, text: 'THE STUDENT\'S SCREEN, ZOOMED IN'}, {x: 600, y: 846, text: '◀ STUDENT PHONE', color: '#ffd23d'}],
        chips: [chip(3.35, '> RUN: REAL PYTHON IN THE BROWSER', {x: 640, y: 880, color: '#3dff8b', len: 3.1}),
          chip(6.55, 'SUBMIT · NO GITHUB NEEDED', {x: 640, y: 880, len: 3.2}), chip(9.8, 'INSTANT FEEDBACK', {x: 640, y: 880, color: '#ffd23d', len: 0.6})]},
      {at: 16, len: 5.5, src: 'class-projector', from: 40.0, rate: 1, keys: [cam(0, 960, 540, 1.0)],
        chips: [chip(0.2, 'EVERY SUBMISSION HITS THE SHARED BOSS', {y: 960, color: '#ffd23d', len: 5.2})]},
      {at: 21.5, len: 6.5, src: 'class-teacher', from: 40.3, rate: 1, keys: [cam(0, 960, 560, 1.1), cam(2.6, 560, 560, 1.45, 1.2)],
        chips: [chip(1.4, 'TEACHER REVIEWS PRIVATELY: WORKS / NOT YET / ASK', {y: 860, color: '#3dff8b', len: 4.9})]},
    ]},

    {id: 'built', at: 116, len: 12, vo: '06-built', voAt: 0.5, tag: {n: '06', title: 'HOW IT WORKS'}, noCaptions: true, shots: [
      {at: 0, len: 12, kind: 'cards', bg: {src: 'match', from: 20, rate: 0.8, keys: [cam(0, 960, 540, 1.1)]},
        cards: [
          {t: 1.4, title: 'REAL ANALYSIS', color: '#3dff8b', body: 'Import graph, Tarjan cycles, tests and language DNA, read from the actual repo.'},
          {t: 3.4, title: 'GEMINI ART DIRECTION', color: '#ff3d8b', body: 'Names, palettes and taunts per repo. Pixel sprites drawn in the browser.'},
          {t: 5.3, title: 'CHIPTUNE ENGINE', color: '#ffd23d', body: 'A Web Audio synth: music and SFX for every arena, zero audio files.'},
          {t: 7.4, title: 'ANY PHONE', color: '#4fd8ff', body: 'Node + WebSockets, motion controls, GitHub sign-in, Python via Pyodide.'},
        ]},
    ]},

    {id: 'end', at: 128, len: 8, vo: '07-end', voAt: 0.6, noCaptions: true, shots: [
      {at: 0, len: 8, kind: 'end', bg: {src: 'arch-kaiju', from: 10, rate: 1, keys: [cam(0, 1290, 620, 1.3)]}},
    ]},
  ],
};
