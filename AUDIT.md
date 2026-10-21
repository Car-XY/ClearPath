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

## Guided capture update and provider correction

The next iteration preserves local base `d16c7fc`, including its 21 MB framework multipart gate. It adds an optional four-position capture guide, labelled existing photos, optional room width/depth measurements, a compact draft schema, deterministic IDs/boundaries, and review warnings for unusable individual detections. The model is instructed to exclude reflections, wall-mounted screens, and furniture outside the camera's room. Those instructions do not establish geometric accuracy.

Analysis requests now use a streaming NDJSON response with server heartbeats, retained photo selection, user cancellation, a 110-second default provider deadline and a 130-second client deadline. Hosting platform hard limits still apply. Distinct messages cover rate limits, token limits, credits/quota, malformed output, and connection failures. Provider configuration is explicit when both keys are present; Claude-only credentials select Anthropic, and an explicit Anthropic setting never falls back to OpenAI. The upload dialog displays the selected service before consent.

Verification: **97 unit/integration tests across 12 suites passed; 24 desktop/mobile browser tests passed; TypeScript and the production build passed.** A final focused four-test capture run verifies the phone action-bar layout and screenshots. Provider request/response fixtures are mocked and do not establish reconstruction quality.

**Correction to the live diagnosis:** five supplied originals decoded and resized successfully. The live smoke test used an inherited local OpenAI configuration and received HTTP 429; it was not a reproduction of the user's Claude-configured web environment. No Anthropic credentials/model were available in this local checkout, so successful live Claude reconstruction has not been verified. The user reports Claude works in their web environment. No assertion that Claude has a rate, quota or depth-perception failure is supported by that OpenAI test. No further live provider attempts were made after identifying the mismatch.

Private `.env.local` files and supplied photos are excluded from Git and source ZIPs. Mock screenshots show the capture guide; private live-test results stay in the workspace's intermediate work directory.

## Subsequent actual Claude run

Using the user-provided installed configuration, both installed and latest adapters completed one real five-photo request through Anthropic with HTTP 200 and `end_turn`. The configured/returned model was `claude-sonnet-5-5`; elapsed times were 53.1 seconds for the installed adapter and 29.6 seconds for the latest compact draft. Both validated projects were imported and rendered in 3D and top-down views. Earlier failures were not reproduced in these two attempts. The source file containing the key was read in memory only and was not copied or modified. Generated geometry remained explicitly estimated and included model warnings about glass-wall/door placement and chair identity. Detailed private results are separate local deliverables, not source fixtures or a universal reliability claim.

## Product models, attachments, spacing and chair direction

Added a Claude-only product adapter with retailer/image allowlists, validated redirects, bounded bodies and deadlines, explicit consent, safe error states and pasted-specification recovery for blocked stores. Strict declarative geometry uses at most 48 bounded primitives; no model scripts or remote scene code are accepted. Dimensions and source provenance are reviewed before insertion.

Elevated object bases, parent/wall/ceiling/point anchors and editable offsets resolve deterministically. Moving assemblies share authoritative collision checks with both editors. Floor routing respects adjustable headroom; vertical overlap and ceiling/floor limits are checked. Unconfirmed room height keeps overhead layouts provisional. Anchor graphs are checked in active, original and named layouts. Deleted/missing parents detach children at current poses, and restored snapshots reconcile distance references.

Distance rules support minimum/maximum floor-edge gaps and 3D center distances. Each required rule cannot worsen during an edit or suggested move; preferences affect bounded layout search. A new chair mesh/symbol convention matches generated angles, with backrests on positive local Z. Existing imperfect placements may turn around when collision bounds are unchanged.

Verification: 116 unit/integration tests in 14 suites; 28 desktop/mobile browser tests; two visual render checks using the prior real five-photo room and the captured live product response; TypeScript and production build passed. The real IKEA fetch and Anthropic request returned HTTP 200/end_turn and five valid parts with listed 55 × 55 × 45 cm dimensions in 11.9 seconds. Source archives exclude private configuration, uploaded photos, dependencies and runtime caches. These results do not establish arbitrary retailer availability, exact CAD reconstruction, complete constraint solving, or measured real-world clearance.

## Five planner improvements

Implemented a browser-side daylight arc with clipped, wall-faded window floor projections and a bounded relative-exposure heatmap; an eight-rule ergonomics registry with live findings, fixes, pulses and camera focus; clearly marked Patient Care/Game Room placeholders; a compact collapsible selection dock outside the canvas; and first-person pitch with mouse/touch, keyboard and on-screen controls, ±80° clamps and a level reset. The coach excludes desk chairs from workstation detection and discloses assumed screen/seat geometry.

Camera height is an optional validated input/reference in the existing photo-analysis measurement pipeline. It defaults explicitly to 1.50 m, remains separate from inferred ceiling height, and persists in room/measurement state. Review and estimated furniture properties display relative heights. No extra provider request is introduced. The reference guides semantic inference; it is not an independent depth measurement or a reason to mark inferred geometry confirmed.

Tests cover solar movement and warmth, clipped projections, wall fade, bounded exposure grids, front/back-facing windows, pitch bounds, live coach findings and corrected chair orientation, camera-reference validation/persistence, and a mocked Anthropic request that keeps camera and ceiling heights distinct. Existing product, anchor, spacing, upload, editor, route, lock and persistence regressions remain in the suite.

Final verification for the five-feature update: 131 unit/integration tests in 15 suites passed, all 38 desktop/mobile browser scenarios passed across full and focused runs, and TypeScript/production build passed. Focused reruns corrected legacy assertions for the new default camera measurement and lock message, and verified the responsive walkthrough/corner dock. Source screenshots show moved sunlight patches, live object focus and first-person ceiling tilt; they use sample/mocked rooms and do not claim measured reconstruction accuracy. No extra live provider request was needed for this update.
