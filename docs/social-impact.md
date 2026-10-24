# Repo Kaiju: Social Impact Add-ons

## The Problem

The world runs on open-source software, yet many critical modules are maintained by only one or two people. When those people burn out or disappear, everyone downstream is at risk. The xz backdoor and Log4Shell both happened in exactly this kind of project.

Repo Kaiju already makes a repository's structure visible. With one more step, it can also show **where a project needs help**, and turn the excitement of a monster fight into real contributions.

## Proposed Add-ons (in priority order)

### 1. Fragile Organs → "Adopt an Organ" ⭐ Top pick

- For each module, count how many people have contributed to it. Modules that depend on a single maintainer (a low *bus factor*) appear on the monster as **cracked, glowing, fragile organs**.
- In battle, fragile organs are weak points that take critical hits, so players notice them right away.
- In the post-fight autopsy, each fragile organ lists that module's open `good first issue` / `help wanted` issues, with a QR code: **"Adopt this organ."** Scanning it opens the GitHub issue directly.
- This turns excitement about the fight into an on-ramp for real open-source contributions.
- **Data:** the GitHub API (commits and contributors per path, plus issue labels).

### 2. Security: Vulnerabilities as Parasites

- Check the repository's dependencies against **publicly known** vulnerabilities on OSV.dev, and show them as parasites infecting the monster.
- Infected organs lose health over time, and the autopsy report lists each vulnerability's ID and the version that fixes it.
- **Rivalry twist (a "Cure Race"):** the first team to open a PR that upgrades the vulnerable dependency wins.
- **Scope:** we only read public advisory databases and never actively scan or attack anything. We'll state this clearly in the pitch.

### 3. Event-wide Raid Boss: Save a Critical Project Together

- For the whole event, a giant boss stays on the main screen. It's built from a real open-source project that is critical but under-maintained, chosen using sources like the OpenSSF Criticality Score.
- Damage from every match counts toward the boss, but only **real merged PRs** can deal the finishing blow.
- This turns team-vs-team rivalry into event-wide cooperation. At the end of the weekend, we can show something like "HackPSU contributed N PRs to project X."

### 4. Accessibility: Inclusive Motion Mode

- A **seated / low-motion mode** for players with limited mobility. Calibration lowers the gesture thresholds so that a small tilt or nod is enough.
- Motion games often leave these players out. This keeps the rivalry open to everyone.
- **Cost:** low. We already need a calibration step when players join.

### 5. Education: Classroom Mode

- For CS courses and high school coding clubs: the teacher loads students' course projects, teams battle them, and the autopsy works as a plain-language explanation of the architecture.
- Pitch this as part of the Vision. We won't build it during the hackathon.

## Recommendation

- **Build #1 and #4 for the MVP.** #1 is just a few more GitHub API calls, and #4 is a change to the calibration logic. Both are cheap.
- **Demo ending:** fight → autopsy → the big screen shows *"This organ has only one maintainer. Scan to adopt it."* That takes the judges from laughing to "oh, this is useful" to "I can help right now," which is a stronger finish than just being fun.
- **#2 and #3 go into the Vision section,** where they can earn extra points if there's a social-good track.
