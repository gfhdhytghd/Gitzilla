# claude-settings progress

## 2026-10-25 · Settings → View: [ 2D | 3D ] sliding switch, 3D out of beta
- `client/app/settings.ts` `viewSwitch()`: the "3D view (beta)" checkbox became a segmented `[ 2D | 3D ]` switch with a sliding thumb
  (`role=radiogroup` labelled by the View heading, `role=radio` buttons with roving tabindex, ←/→/↑/↓/Home/End select, yellow `:focus-visible`
  ring, 44 px tall). Test ids: `settings-view`, `settings-view-2d`, `settings-view-3d` (old `settings-view3d` is gone). Same `kaiju.view25d`
  key; a `?view=` link pins it (buttons disabled, `aria-disabled`, "Set by this link.").
- `client/style.css` `.seg-switch / .seg-thumb / .seg-opt`: terminal palette, Press Start 2P labels, thumb transition off under reduced motion.
- `client/app/view25d.ts`: 3D stays the headset default, but a saved 2D choice is now respected there (before, a headset ignored the saved value,
  so picking 2D would have snapped back). `client/app/device.test.ts` updated: headset unset → 3D, headset saved 0 → 2D.
- i18n: "3D view (beta)" dropped from `shared/i18n` (sources, gemini-translations, messages.generated); "View" / "Set by this link." keep their
  en/zh/es/fr entries; `2D`/`3D` aren't translated. `tools/audit-i18n.ts`: 0 errors. The XR panel in game.ts never had a beta label (no edit there).
- Verified in WebKit against :5175 (desktop 1440, iPhone 15): tap/click, arrows + Home, focus follows selection, saved across reload, `?view=2d`
  pinned + disabled, zh/es/fr fit without overflow. Shots: `docs/shots/settings-view/{desktop,iphone15}-{2d,3d,3d-focus,pinned,zh,fr}.png`.
- Built on claude-ui's reverted draft (view-toggle.patch).
