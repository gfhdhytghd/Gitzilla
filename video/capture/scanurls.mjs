// Which takes would show the room origin? Load each and look for it in visible text and QR/link targets.
import { browser, newPage, BASE, DESK, PHONE, sleep } from "./rec.mjs";
const b = await browser(1);
const urls = ["/r/ABCD?mock=match", "/r/ABCD?mock=review", "/r/ABCD?mock=autopsy", "/r/ABCD?mock=royale-lobby", "/r/ABCD?mock=royale", "/r/ABCD?mock=royale-autopsy",
  "/client/genesis/demo.html?repo=pallets/flask&kind=boss&layout=desktop"];
for (const u of urls) {
  const p = await newPage(b, DESK, "hackpsu"); await p.goto(BASE + u); await sleep(5000);
  const hits = await p.evaluate(() => {
    const out = []; const re = /wilflin|localhost|\/r\/[A-Z]{4}/;
    if (re.test(document.body.innerText)) out.push("text: " + document.body.innerText.match(/.{0,30}(wilflin|localhost|\/r\/[A-Z]{4}).{0,20}/)?.[0]);
    for (const i of document.querySelectorAll("img")) if (/qr/i.test(i.src)) out.push("qr: " + decodeURIComponent(i.src).slice(0, 120));
    return out;
  });
  console.log(u, JSON.stringify(hits)); await p.close();
}
await b.close();
