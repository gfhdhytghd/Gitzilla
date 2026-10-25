import { browser, newPage, BASE, DESK, sleep, RAW } from "./rec.mjs";
const b = await browser(1);
const shots = [
  ["landing", "/", [3]],
  ["genesis-flask-boss", "/client/genesis/demo.html?repo=pallets/flask&kind=boss&layout=big", [2, 6, 10, 14, 18, 24]],
  ["genesis-rg-hero", "/client/genesis/demo.html?repo=burntsushi/ripgrep&kind=hero&layout=big", [3, 8, 14, 20]],
  ["match", "/r/ABCD?mock=match", [3, 8, 15, 25, 40]],
  ["review", "/r/ABCD?mock=review", [3, 8, 14]],
  ["autopsy", "/r/ABCD?mock=autopsy", [3, 8]],
  ["royale", "/r/ABCD?mock=royale", [3, 10, 20, 35]],
  ["royale-autopsy", "/r/ABCD?mock=royale-autopsy", [3, 8]],
  ["raid", "/r/ABCD?mock=raid&screen=1", [2, 6, 10]],
  ["edu", "/r/ABCD?mock=edu&screen=1", [3]],
];
await Promise.all(shots.map(async ([n, url, ts]) => {
  const p = await newPage(b, { viewport: { width: 1920, height: 1080 } }, "wilf");
  await p.goto(BASE + url);
  let last = 0;
  for (const t of ts) { await sleep((t - last) * 1000); last = t; await p.screenshot({ path: `${RAW}scout/${n}-${t}s.jpg`, type: "jpeg", quality: 70 }); }
  console.log(n, (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300))));
}));
await b.close();
