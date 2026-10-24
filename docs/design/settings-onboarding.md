# Settings and first-run controls

The Settings button at the top right of each page’s content scrolls with that content and opens a secondary dialog containing language, control mode, sensitivity and practice. The classroom host's language choice is still server-authoritative; students see an explanation instead of a language picker. Classrooms and spectator screens do not request game-control permissions.

On first entry to the landing page or a battle lobby, onboarding offers the same preferences before a fight. Phones using motion also see it after a reload if fresh permission/readings are needed. Browser-native motion and orientation permission methods are called synchronously from the explicit enable button; visiting the page shows the invitation, since iOS does not allow an unprompted permission request. Denial leaves touch controls and retry available. No native grant is persisted.

Motion practice retains the existing gesture trainer. Touch practice uses the fight's shared gesture recognizer to teach drag, tap, double-tap and hold. A skipped trainer does not mark practice complete. Settings remain available to repeat it; only standard motion and touch are offered, with no seated mode option. While settings or practice are open, local battle input is neutral and the multiplayer match continues.

Unifont is self-hosted as WOFF2 with its upstream license, and preloaded before measuring canvas text. Interface body text, Chinese/extended glyphs and canvas fallbacks use it; existing display-brand fonts retain Unifont fallback.

Checks: `npm test`, `npm run typecheck`, `npm run build`, `npx tsx tools/settings-smoke.ts`, `npx tsx tools/i18n-smoke.ts`, `npx tsx tools/classroom-smoke.ts`, `npx tsx tools/pvp-smoke.ts`. Native iPhone permission dialogs and physical gestures still need device acceptance; browser checks use simulated permission results.
