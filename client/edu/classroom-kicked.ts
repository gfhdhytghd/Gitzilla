// The screen a student sees after the teacher removes them from a classroom (ServerMsg "kicked"). Calm, no auto
// reconnect, and their in-app code isn't lost: it can be downloaded before they go. claude-ui's generic kicked screen
// can call createClassroomKicked() for edu rooms.
import type { InAppFile } from "../../shared/classroom.ts";
import { h } from "../app/util.ts";
import "./classroom-kicked.css";

/** One download for the student's files: a single file as-is, several as one text file with a header per file. */
export function bundleFiles(files: InAppFile[], room: string): { name: string; text: string } | null {
  const real = files.filter((f) => f.content.trim());
  if (!real.length) return null;
  if (real.length === 1) return { name: real[0].path.split("/").pop() || "code.txt", text: real[0].content };
  return { name: `classroom-${room}-code.txt`, text: real.map((f) => `# ---- ${f.path} ----\n${f.content.replace(/\n?$/, "\n")}`).join("\n") };
}

export function createClassroomKicked(o: { by: string; room: string; files?: InAppFile[]; onHome(): void }): HTMLElement {
  const bundle = o.files ? bundleFiles(o.files, o.room) : null;
  const download = () => {
    if (!bundle) return;
    const url = URL.createObjectURL(new Blob([bundle.text], { type: "text/plain;charset=utf-8" }));
    h("a", { href: url, download: bundle.name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return h("section.ck", { role: "alert", "data-testid": "classroom-kicked" },
    h("div.ck-card", null,
      h("p.ck-icon", { "aria-hidden": "true" }, "👋"),
      h("h2", null, "Removed from this classroom"),
      h("p.ck-lead", null, o.by ? `${o.by} removed you from this classroom.` : "Your teacher removed you from this classroom."),
      h("p", null, "You can't rejoin this room. If this was a mistake, talk to your teacher."),
      bundle ? h("div.ck-code", null,
        h("p", null, "Your code is still on this device."),
        h("button.btn", { type: "button", "data-testid": "classroom-kicked-download", onclick: download }, "⇩ Download my code")) : null,
      h("button.btn.btn-primary", { type: "button", "data-testid": "classroom-kicked-home", onclick: o.onHome }, "Back to start")));
}
