# Gitzilla renderer variety baseline

Baseline renderer revision: `67cb5a9619e56be9c2018d134458e1d20b73b760` (pre-variety task commit).

The contact sheets contain 15 public fallback repos with their bundled Gemini designs, followed by 30 explicitly synthetic profiles. Synthetic inputs vary language, LOC, age, cycles, component count, tests and contributors;15 exercise seed-only rendering and 15 exercise deterministic designs. Six hero classes and four boss archetypes are represented. All images use actual existing 2D renderer functions in headless Chromium, fixed idle time 0.35s, phase 1 and portrait frame 0. Labels are outside scored canvases. This is a static appearance proxy, not 3D/animation/gameplay or hardware acceptance.

Art owners started modifying the shared renderers while the tool was being built. The final baseline therefore reads unchanged renderer/shared modules from the committed pre-variety revision using a browser-only source overlay. Product files and the DEV server are untouched. Vite strips TypeScript; Chromium executes the original draw functions. Every renderer dependency must be pinned. Source hashes and the exact45 profile+kit inputs are saved.

## All 45 inputs (990 pairs per view)

| Sheet | Min distance ↑ | Mean distance ↑ | Look-alike pairs ↓ | Clusters ↓ | Shape-only pairs ↓ | Palette entropy bits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [heroes-portraits](baseline/heroes-portraits.png) | 0.01410 | 0.44753 | 10 | 10 | 43 | 5.4861 |
| [heroes-fight](baseline/heroes-fight.png) | 0.01917 | 0.36255 | 11 | 9 | 55 | 5.3256 |
| [bosses-portraits](baseline/bosses-portraits.png) | 0.01365 | 0.41421 | 68 | 8 | 144 | 4.9532 |
| [bosses-fight](baseline/bosses-fight.png) | 0.01554 | 0.41145 | 67 | 8 | 150 | 4.9722 |

## Public fallback15 only

| View | Min distance | Look-alike pairs | Clusters |
| --- | ---: | ---: | ---: |
| heroes-portraits | 0.17747 | 0 | 0 |
| heroes-fight | 0.11084 | 0 | 0 |
| bosses-portraits | 0.07916 | 8 | 4 |
| bosses-fight | 0.07206 | 10 | 4 |

## Metric definitions

- Foreground bounds: alpha≥128; normalize the bounding box into 60×60 pixels centered in 64×64. dHash compares luminance horizontally on 9×8 pixels (64 bits), composited on a fixed neutral matte. RGB histogram uses 8 bins per channel (512 bins), counting only foreground pixels. No contact-sheet label/background enters the scores.
- Combined distance =0.5×normalized dHash Hamming +0.5×histogram total variation; range0–1, higher means more different. JSON contains min/p10/median/mean/max for each constituent and combined distance, nearest pairs, fallback/synthetic subsets and every class/archetype group.
- Look-alike edges require the same class/archetype, dHash≤8/64 AND histogram distance≤0.20. Clusters are connected components of at least 2 samples, not necessarily cliques. Clustered sample counts and pair counts are also reported because splitting a cluster can increase the component count while reducing similarity.
- Supplemental shape-only matches retain the same 8-bit threshold but omit colour. This distinguishes repeated silhouettes from palette diversity; the original combined thresholds were not tuned to the result.
- Palette entropy is Shannon entropy of actual rendered, quantized foreground colours, not declared kit.palette. JSON includes pooled entropy, mean per-image entropy and their difference (between-image palette diversity). `features[].palette` is declared metadata only; it is not used to compute the scores.
- S16 hero portrait touches the canvas edge in the existing renderer (potential duck/prop clipping); the tool records edge touches and does not change product framing. All other outputs have nonempty foreground; figures/labels were visually inspected.

## Re-run after the owners finish

```sh
npx tsx tools/variety-sheet.ts --label after \
  --fixtures docs/variety/baseline/fixtures.json \
  --compare docs/variety/baseline/summary.json
```

This defaults to the current working-tree renderer source snapshot. It writes `docs/variety/after/*.png`, its summary and fixtures, plus the latest `docs/variety/summary.json`. The baseline directory stays unchanged. The comparison refuses different fixtures or metric definitions. For an exact before-source repeat, add `--source-ref 67cb5a9` and choose a different label/output directory. Never re-run new artwork with `--label baseline`. Only the existing localhost:5175 DEV origin is allowed; the tool never starts/stops servers, contacts providers or visits 5173.

Initial creation command (baseline capture):

```sh
npx tsx tools/variety-sheet.ts --label baseline --source-ref 67cb5a9
```

The browser fallback is the installed `/usr/bin/chromium` when Playwright’s bundled revision is absent. Override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed.
