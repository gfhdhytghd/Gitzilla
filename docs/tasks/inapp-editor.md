# Classroom in-app Python editor (user: "add a simple in-app editor for the Python class, so GitHub submit isn't required")
Contract (committed): ClassroomStep.starter?: InAppFile[], ClassroomStep.language?: 'python', InAppFile,
ClientMsg classroomSubmitCode {files}, ClassroomReport.source.
- Student flow (phone + desktop): the step opens a simple editor preloaded with the step's starter files (file tabs if
  more than one). Line numbers, Python syntax colors (tiny tokenizer, no heavy deps), Tab = 4 spaces, auto-indent after
  ':', Shift+Tab dedent, bracket/quote pairing optional, monospace legible on phones (scroll horizontally inside the
  editor only), draft autosave per room+step in localStorage, "reset to starter". Submit → classroomSubmitCode.
  GitHub submit stays as a secondary option ("or submit a GitHub repo").
- Optional ▶ Run: runs the student's code in THEIR browser with Pyodide loaded lazily from cdn.jsdelivr.net in a Web
  Worker (timeout ~5s, kill worker on timeout, captured stdout/stderr shown in a console panel). Never sent to/executed by
  the server; not used for grading. If Pyodide fails to load, hide Run gracefully.
- Server: validate (≤20 files, ≤200 KB, safe relative paths, UTF-8), build an in-memory profile from the files (same
  analysis as a repo: components, DNA, quality signals), run the step's checks (file/contains) + rubric exactly like
  GitHub submissions; commit = "inapp:" + 8-hex content hash; source = 'in-app'. Static only — never execute code.
- Presets: every beginner Python preset step gets starter files (e.g. main.py with TODOs + a tests/test_main.py the
  checks look for) so the in-app path works out of the box.
## Owners
- claude-edu: editor UI + Run console in the classroom student screen (client/edu + client/app/classroom.ts), teacher
  view shows "in-app" submissions with a read-only code viewer. Verify WebKit iPhone + desktop.
- codex-repo: `analyzeFiles(files: InAppFile[], name): RepoProfile` reusing the analysis pipeline (no network).
- codex-net: classroomSubmitCode handler (validation, hashing, scoring via codex-rubric/analysis, reports, persistence).
- take-edu (Codex, owns the Python presets data): starter files for every preset step; no client UI edits.
