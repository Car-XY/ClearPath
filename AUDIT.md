# ClearPath bug review — October 17, 2026

This was a fresh code and browser review of the existing application. The review used regression tests that failed against the original behavior, then tested the corrections. It is a scoped software review, not a claim that the app has no remaining defects or a formal accessibility audit.

## Findings and corrections

| Priority | Finding | Evidence and correction |
| --- | --- | --- |
| P1 | Unlocking fixed furniture did not permit movement. | The sample bookcase had `locked:true` and `movable:false`. Unlock changed only the first flag. A browser regression attempted to set Z from 2.55 to 3.5 and observed that it remained 2.55. Unlock now explicitly permits movement, and the movable checkbox synchronizes both flags. Structural obstacles remain separate. |
| P1 | The displayed bottleneck could overstate entrance clearance. | A 0.95 m doorway produced a 1.15 m clearance result because the route began inside the room. The new regression failed with those values. Minimum clearance now includes the entrance width; doorway checks remain separate from interior path connectivity. |
| P2 | Escape during top-down dragging committed the preview. | A browser test held a drag, pressed Escape, and released. The original app opened the blocked route, proving that the move had been committed. Escape, pointer cancellation, lost capture, and window blur now discard the preview. The final pointer position is read from a ref rather than potentially stale React state. |
| P1 | Restoring original or named layouts could break persistence/export. | A restored furniture collection could omit an object still referenced by a route, violating scene validation. Restoration now reconciles associations: missing-object approaches become independent anchors at their previous world position. Browser tests restore an imported project and validate the exported JSON. Named-layout and original-layout reconciliation also have unit coverage. |
| P2 | Temporary throttling and exhausted API quota shared an unhelpful retry message. | HTTP 429 responses now distinguish recognized quota/billing error codes from temporary rate limits. Raw provider response text is never returned to the client. Tests cover both cases. |
| P3 | Leaving an unchanged project-name field created a redundant undo entry. | Renaming now commits only a changed, nonempty name. |

## Verification

- 63 unit/integration tests passed across seven suites.
- 14 Playwright tests passed across desktop Chromium and a phone-sized Chromium viewport.
- TypeScript checking passed.
- Production build passed. The existing large client-chunk warning for 3D dependencies remains.
- Manually verified unlocking the sample bookcase and dragging it in the 3D view. Coordinates changed from X 4.9/Z 2.55 to X 4.8/Z 3.65; placement remained valid.
- Regression coverage includes unlock/move/undo, Escape cancellation, route reconciliation after restoration, validated export, rotated geometry, doorway clearance, state/persistence, duplicate uploads, mocked photo reconstruction, view switching, walkthrough, comparison, and local reload.

## Provider configuration and actual live check

The supplied key is stored only in ignored local `.env.local` as `OPENAI_API_KEY`. The selected API model is `gpt-5.6-sol`, the official identifier for [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol). The example environment file includes that model and an empty key. The downloadable source excludes the real key and all private environment files.

The local `/api/config` endpoint reported the provider configured. A real authenticated GET to `/v1/models/gpt-5.6-sol` returned HTTP 200. A live request through `/api/analyze`, using a synthetic app-generated room render rather than a real home photo, received HTTP 429. The app returned its sanitized rate-limit recovery state. Successful live reconstruction is therefore still unverified. Representative real-room photos were not supplied. [OpenAI error-code documentation](https://developers.openai.com/api/docs/guides/error-codes) explains rate-limit and quota responses.

For a newly extracted source ZIP, copy `.env.example` to `.env.local` and privately enter the API key. The configured `.env.local` in the existing local project is deliberately not bundled. No key belongs in browser code or `NEXT_PUBLIC_` variables.

## Files changed

- `lib/editor-actions.ts`: consistent unlocking and validated layout restoration.
- `components/ClearPath.tsx`: connects mobility and restore controls to those actions; avoids redundant rename history.
- `components/TopDown.tsx`: complete drag cancellation and current-pointer handling.
- `components/RoomCanvas.tsx`: cancellation on blur/pointer cancellation; consistent provisional-boundary previews.
- `lib/geometry.ts`: doorway bottleneck reporting.
- `lib/photo-provider.ts`: sanitized, actionable HTTP 429 handling.
- `tests/editor-actions.test.ts`, `tests/geometry.test.ts`, `tests/provider.test.ts`, `tests/browser/audit.spec.ts`: regressions.
- `playwright.config.ts`: configurable audit port, avoiding an existing user server on port 5173.
- `.env.example`, README: selected model and configuration instructions.

The original planning limitations still apply: one level rectangular room, estimated photo geometry, circular movement envelope, simplified stationary turning checks, no under-furniture travel, and no certification or real-world maneuverability guarantee.
