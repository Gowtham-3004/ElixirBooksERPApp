# Animated Storyset exports

Storyset renders animations in its editor (behind a free login), so these GIFs are exported by hand and dropped in
this folder. Every slot that expects a GIF falls back to the static SVG of the same name until the file exists,
under `prefers-reduced-motion`, and on the dark theme (transparent GIFs halo on dark surfaces) unless a
`<name>.dark.gif` sibling exists or the entry is marked `darkOk` in `scripts/storyset.manifest.json`.

## Recipe (per file)

1. Open the page below, click **Animate** (top right of the illustration).
2. Colour: `#3557CF` (the app accent). Style stays **Rafiki**.
3. Background: **none / transparent**. Turn off the "complete" background layer if the editor offers it.
4. Size: ~800 px. Format: **GIF**. Keep the file ≤ 1.5 MB (shorter loop or 600 px if it is heavier).
5. Save as `src/assets/storyset/animated/<name>.gif`, then run `pnpm storyset:check`.

Optional dark variant: colour `#6B85F2`, background `#171A1F`, saved as `<name>.dark.gif` — picked automatically in dark mode.

| name | export from | used for |
| --- | --- | --- |
| `finance.gif` | https://storyset.com/illustration/finance/rafiki | sign-in hero |
| `setup.gif` | https://storyset.com/illustration/setup/rafiki | dashboard first-run card |
| `celebration.gif` | https://storyset.com/illustration/celebration/rafiki | onboarding "You're all set" |
| `completed.gif` | https://storyset.com/illustration/completed/rafiki | all-caught-up states (approvals, collections) |
| `contact-us.gif` | https://storyset.com/illustration/contact-us/rafiki | Help & Support hero |
| `upgrade.gif` | https://storyset.com/illustration/upgrade/rafiki | module not in plan |
| `not-found.gif` | https://storyset.com/illustration/404-error/rafiki | page not found |
| `error.gif` | https://storyset.com/illustration/bug-fixing/rafiki | error boundary |
| `no-connection.gif` | https://storyset.com/illustration/no-connection/rafiki | offline (POS pause, failed chunk load) |
| `loading.gif` | https://storyset.com/illustration/loading/rafiki | `LoadingOverlay art` |

Licence: Storyset free licence, attribution required — the app credits Storyset under Help → About. Terms: https://storyset.com/terms
