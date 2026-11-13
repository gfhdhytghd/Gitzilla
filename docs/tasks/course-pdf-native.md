# Course generation: send PDFs to Gemini natively

Dispatch after `question-sets.md` is merged (both touch `server/course-generation.ts`).

User decision: let the model read the PDF itself (text, images, charts, formulas, tables, scanned pages) instead of
only `pdftotext` output.

## Requirements

- PDF uploads go to Gemini `generateContent` as an `inline_data` part (`mime_type: application/pdf`, base64) next to
  the text prompt. Upload limit stays 8 MB (Gemini's limit is 50 MB / 1000 pages).
- Replace the 80000-byte extracted-text limit for this path with a page limit (default 100 pages, configurable by env).
  Count pages without trusting the client; reject over-limit files with 413 and a clear message.
- Fallback: when Gemini fails or is not configured, extract text with `pdftotext` and use the current text prompt
  with DeepSeek, keeping the 80000-byte text limit for that path. Scanned PDFs without text then fail with the current
  422 message.
- `.md` and `.txt` are unchanged.
- The prompt still treats the document as untrusted reference data.
- Report which path ran (`provider` already exists; add e.g. `gemini:<model>:pdf`).
- Update the upload help text and README to describe the new limits.
- Tests use mocked providers only. Assert the request shape (inline PDF part present, no text extraction on the
  native path) and the fallback.

## Rules

- Do not commit, push or deploy. Report to `docs/tasks/course-pdf-native-report.md`, last line `STATUS: DONE` or
  `STATUS: BLOCKED <reason>`.
