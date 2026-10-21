# ClearPath

**Try the arrangement before moving the furniture.** A complete single-room planning application for Hack the Valley: photo estimates, an editable 3D room, a coordinated top-down editor, and deterministic movement-space checks.

## Run locally

Use Node.js 22.13 or newer and npm. From this directory:

```sh
npm install
npm run dev
```

Open http://localhost:5173. No account or provider credentials are needed for the bundled sample, manual creation, editing, geometric analysis, comparison, local saving, JSON import/export, or printable summaries. Local data belongs to the browser and origin; it will not transfer automatically to another device or URL.

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npx playwright test
```

Playwright starts or reuses the development server on port 5173 and runs desktop Chromium plus an iPhone-sized Chromium viewport. `npm run start` previews the built Cloudflare Worker locally through Wrangler. The project uses Next.js App Router conventions with the included Vite/Vinext runtime and Sites packaging scripts.

If a restricted Windows environment rejects Vitest's temporary-cache renames, use a writable project-local temporary directory in that shell:

```powershell
New-Item -ItemType Directory -Force .cache/vitest-temp | Out-Null
$env:TEMP = (Resolve-Path .cache/vitest-temp).Path
$env:TMP = $env:TEMP
npm test
```

## Configure real photo analysis

Copy `.env.example` to the private `.env.local` next to `package.json`. Select Claude explicitly:

```env
PHOTO_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_private_anthropic_api_key
ANTHROPIC_MODEL=your_claude_api_model_id
PHOTO_ANALYSIS_TIMEOUT_MS=110000
```

Use a Claude API model available to your account with image input and structured JSON output. Restart the dev server after changing configuration. The upload dialog names the selected provider before consent. No fallback request goes to another provider. With no explicit selection, an Anthropic-only key selects Anthropic, while an OpenAI-only key preserves the earlier OpenAI behavior. If both keys exist, selection must be explicit or analysis is disabled.

For OpenAI, use `PHOTO_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL` (the earlier configured model was `gpt-5.6-sol`). Credentials are server-only: never use `NEXT_PUBLIC_`, put keys in browser components, or commit them. Neither the ZIP nor the Git checkout includes private credentials.

The default request asks for a compact draft of visible floor furniture and openings. The server builds stable IDs and a rectangular boundary, validates sizes and evidence references, and attaches review warnings. Reflections, wall-mounted boards/screens and furniture outside the room are excluded by the prompt; this is an instruction to the model, not a guarantee of detection quality. Invalid individual detections may be omitted with an explicit review note, while an invalid room still fails validation. Geometry remains estimated until measured and confirmed.

The provider deadline defaults to 110 seconds, clamped to 10–110 seconds. Existing `.env.local` files with `PHOTO_ANALYSIS_TIMEOUT_MS=75000` retain that shorter setting until changed. The browser requests an NDJSON connection with keepalive updates, a visible elapsed timer, cancellation, and a 130-second connection deadline. Heartbeats indicate an active server connection, not a percentage of AI work completed; hosting platforms may still impose their own hard execution limits. JSON responses remain supported for other clients. There are no automatic billable retries. Quota, token-rate, rate-limit, incomplete-output, validation, and connection errors retain selected photos and report the applicable cause.

JPEG and PNG are supported: 1–8 source photos, up to 20 MB and 64 megapixels each. The browser automatically prepares JPEG upload copies before the server receives them: a maximum 1600-pixel long edge and 300 KB each, with no upscaling. The server independently enforces its 5 MB/file, 20 MB/total and 12 MP/decoded-image safety limits on those prepared copies. Three to four overlapping views are recommended; extra views remain optional. The guide suggests positions and records labels chosen by the user; it does not track camera location or prove scene coverage. Convert HEIC or other formats before uploading.

The upload dialog discloses the external provider before sending. Images are processed in memory and are not logged or retained by the application server. The provider's own data policy still applies. By default, browser persistence and JSON export keep only photo references, evidence and the editable model; source image bytes are excluded. The persistence library supports explicit image-retention opt-in, but the current interface does not enable it. Export & privacy offers source-reference removal and complete project deletion.

Live Anthropic verification with five supplied room photos completed successfully in both the installed and compact-draft adapters. This establishes those requests completed; it does not verify measured reconstruction accuracy or guarantee every room will work. Mocked tests cover deterministic recovery behavior.

## A 60–90 second judging flow

1. Choose **Explore sample room**. Explain that this is a bundled, measured fixture. The desk route is red, while the seating route is already clear; one clear destination cannot hide another blocked destination.
2. Select **Coffee table**. The current model identifies it through a geometric counterfactual: omitting its footprint restores the desk route.
3. Drag it to the lower-right clear floor, ending at **X 4.40 m, Z 4.00 m, rotation 0°**. To demonstrate numeric controls with valid intermediate placements, set **Z 3.30**, then **X 4.40**, then **Z 4.00**. The shelf prevents moving directly to X 4.40 at the original Z, so an invalid intermediate move is correctly rejected.
4. Both required routes now compute green. Undo restores the blocked arrangement; redo opens it again. **Suggest improvements** also searches actual geometry and previews a checked move; its shortest solution may remain amber when clearance is marginal.
5. Switch between **Top-down**, **3D**, and **Walkthrough**. Walkthrough is a spatial preview with a visible exit, not proof of a real maneuver.
6. Open **Compare** to see original and proposed outcomes under the same movement profile. Save a named layout and wait for **Saved on this device**. Refresh and choose **Pick up where you left off**.
7. If time permits, mark an object dimension estimated or unconfirm a room dimension to demonstrate amber provenance. Try moving an object into the entrance to demonstrate rejected doorway/swing interference. Export a project or printable visual summary.

The original coffee table center is (2.90, 2.55) m in a 6 × 5 m room. `lib/demo.ts` exports `DEMO_MOVE`, `createDemo()` and `improvedDemo()`. No route status is hardcoded to a furniture ID or a demonstration coordinate.

## Live-photo demonstration procedure

1. Configure the server provider and confirm the capture dialog reports it available. Use an ordinary, rectangular, single-level room.
2. Capture overlapping views from different positions, including floor-wall boundaries, entrance and major furniture. Avoid changing furniture positions between images. Existing photos or help from another person are valid alternatives.
3. Measure the room width, the other room dimension, doorway width and the important furniture footprints. One measured dimension establishes approximate scale; it does not verify every other estimate.
4. Upload, review the real processing stages, and inspect evidence and uncertainty. Confirm the entrance wall, door center, hinge/swing and rectangular boundary. Unsupported or uncertain shapes stay provisional until explicitly corrected.
5. Confirm each important dimension separately. Correct furniture positions and choose usable floor beside the furniture for destinations. Associated approach offsets follow the furniture when it moves.
6. Rearrange, compare and export. Record the actual model, photos, measurements, observed errors and route behavior. Do not describe an untested estimate as a measured reconstruction.

## Architecture

- `lib/model.ts`: version 1 Zod project schema, validation, unit conversion and shared scene types. Imported and provider-generated input is untrusted. Stable furniture IDs, evidence, openings, original snapshots and saved layouts are stored; analytical results are recomputed.
- `lib/photo-provider.ts` and `app/api/{config,analyze}`: server-only multimodal adapter, strict provider schema, decoded image validation, response reconciliation, timeouts and recoverable error mapping.
- `components/PhotoWizard.tsx`: capture/upload, camera input, previews, provider disclosure, cancellation/retry, and explicit demo/manual alternatives.
- `lib/geometry.ts`: rotated footprints, SAT collision checks, boundary/door/swing checks, occupancy grid, A*, swept-envelope path validation, turning-circle checks and bounded improvement search.
- `components/RoomCanvas.tsx` and `TopDown.tsx`: shared scene data drives both views. Separate procedural furniture objects support selection and floor-plane dragging; invalid previews are shown and rejected. A usable top-down fallback handles WebGL failure. Walkthrough movement respects collision geometry.
- `components/ClearPath.tsx` and `lib/editor-state.ts`: editing, accessible numerical/keyboard controls, immutable history snapshots, debounced analysis with revision checks, comparison, named layouts and printable export.
- `lib/persistence.ts`: IndexedDB autosave/load/delete and validated JSON import/export. Storage failures preserve the in-memory room and advise exporting a backup.

Meters are internal, Y is vertical, and X/Z define the floor. Room coordinates span X 0…width and Z 0…depth. North is Z=0; south is Z=depth. Opening positions are centers along their wall. Plan rotation is radians; Three.js applies its negative on Y so the rendered footprint exactly matches analysis. Display units convert using 1 ft = 0.3048 m and never rescale geometry.

## Geometry and movement assumptions

The initial model supports one rectangular, level-floor room. Unsupported boundaries are retained for correction, not silently treated as a verified rectangle. Furniture uses its actual rotated rectangular footprint. Objects whose base is below the selected headroom (default 2 m) block floor routes using their full footprint. Higher objects are excluded from floor routing; vertical collisions still use overlapping height intervals. The engine does not model passage between table legs or other gaps inside an object. Overhead scenes remain provisional until room height is reviewed.

The travel model is a circular envelope with radius **travel width / 2 + comfort margin + measurement uncertainty margin**. Each margin is per side. Obstacles and room edges use that radius once. The initial 5 cm grid conservatively includes the cell half-diagonal; borderline corridors get an exact swept-disc edge retry. A* forbids diagonal corner cutting. Every simplified segment is continuously validated against rotated polygons and boundaries. Anchors must be on usable interior floor; doorway width is checked separately. Paths cannot cross walls through an unmodeled opening.

Approximate route lengths and minimum available diameter are reported in 5 cm increments. Bottleneck markers locate a limiting point along the computed route. A blocked-object explanation names an object only when removing its footprint restores a checked path. The counterfactual checks up to eight plausible movable objects; no identified blocker does not prove that none exists. Improvement search is bounded to 180 candidate translation/rotation placements and moves one unlocked movable object at a time. No suggestion within that budget does not establish impossibility.

An enabled turning diameter checks a stationary circle at the destination. It does not simulate every wheelchair, walker or multi-step maneuver. Green means the current scene passes selected checks; amber means estimates or marginal/unresolved checks; red means blocked or invalid. These outcomes do not certify accessibility, guarantee maneuverability, replace professional assessment, or establish that furniture can physically be transported to the proposed arrangement.

## Verification and limitations

| Check | Recorded result |
| --- | --- |
| Automated geometry, model, persistence, history and provider tests | 97 tests passed across 12 suites after the guided capture update. Provider tests use labeled mocks; persistence unit tests use a deterministic IndexedDB adapter mock. |
| Demo geometry | Verified: original has 1/2 required routes, exact `DEMO_MOVE` has 2/2 green routes and no placement issues. |
| Type checking | `tsc --noEmit` passed. |
| Production build | Passed with the Sites build helper. A large client chunk warning remains because of the 3D libraries. |
| Desktop/mobile browser workflow and visual inspection | 24 Playwright tests passed, including guided capture and streamed recovery, plus unlock/movement, canceled drag, restoration/export regressions, plus computed transition, undo/redo, profile changes, persistence, coordinated views, walkthrough, compare, JSON export, top-down drag, missing-provider recovery, and labeled mock upload/duplicate/calibration. Desktop and phone rendering visually inspected. |
| Real provider/representative photos | The local test folder lacked Claude credentials. An inherited OpenAI configuration returned HTTP 429 during a supplied-photo smoke test; this cannot diagnose a Claude deployment. Successful live Claude reconstruction remains unverified. |

A standalone Node.js measurement used an Intel Core Ultra 7 258V, Node 24.19.0, a 10 × 8 m room, 20 objects, the 5 cm grid and one clear required route. Seven warmed analysis runs were 22.2, 15.5, 21.2, 15.5, 14.7, 18.9 and 15.0 ms (median 15.5 ms). This measures geometry computation only, not browser rendering or end-to-end interaction. The initial blocked sample was substantially heavier because it performs counterfactual checks: the initial blocked and improved analyses together took about 274 ms cold; the suggestion search took about 586 ms in that smoke run. These figures do not establish a universal 250 ms refresh guarantee.

Photo geometry is semantic estimation, not photogrammetric measurement. Multi-room layouts, sloped floors, arbitrary wall geometry, physical moving logistics, exact mobility-aid kinematics, authentication and collaboration are outside this initial product. Local storage can be cleared by the browser; JSON export is the portable backup. No formal accessibility audit has been performed.



Private Site publication was attempted but blocked by the execution environment's automatic approval review: sending input to the required source-publication helper requires a sandbox approval category that is disabled. A narrow network/Git-write permission grant did not resolve that control. No deployed URL is claimed. The tested source and local production build are delivered.



## Bug review

See AUDIT.md for the reproduced defects, fixes and test evidence. Unlock now permits moving previously fixed furniture; Escape cancels a drag; original/named restoration reconciles object destinations; doorway widths bound displayed clearance; provider rate-limit and quota messages are separated. The real key is stored only in ignored .env.local and is excluded from source downloads. The key/model read check passed, but live synthetic photo analysis was blocked by HTTP 429; no real-room reconstruction success is claimed.


## Choose OpenAI or Claude

Photo analysis supports either provider. Configure the private `.env.local` next to `package.json`, then restart `npm run dev`. Keys stay on the server and are excluded from source ZIPs. Provider selection is explicit; ClearPath never silently sends photos to the other provider.

For Claude:

```env
PHOTO_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_private_anthropic_api_key
ANTHROPIC_MODEL=your_claude_api_model_id
PHOTO_ANALYSIS_TIMEOUT_MS=110000
```

Use a Claude API model available to your Anthropic account that supports image input and structured JSON output. Obtain the model ID from the Anthropic Console; a Claude chat subscription alone does not configure API access. The adapter uses `POST https://api.anthropic.com/v1/messages`, base64 image blocks, and `output_config.format` with the existing room schema. Returned dimensions, object IDs and photo references still pass the same local validation. No Anthropic credentials have been supplied, so live Claude reconstruction has not been verified; provider behavior is covered by mocked integration tests.

For OpenAI, set `PHOTO_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. Existing OpenAI setups continue working. `/api/config` exposes the selected provider and readiness, never its secret. The photo consent names the selected provider before any photos are sent.

## Rotate furniture in the scene

Select furniture in the 3D scene or furniture list. The floating scene control shows its angle and buttons to rotate by 15 degrees in either direction. You can also drag the green rotation handle or press R. Locked or fixed objects must be unlocked first. Rotations use the same collision validation and undo/redo history as moving furniture; rejected rotations preserve the previous pose. Route checks update after a successful rotation.

## Automatic photo sizing

Choose up to eight JPEG or PNG photos. ClearPath prepares upload copies as soon as you select them, before applying server upload limits. It accepts source photos up to 20 MB and 64 megapixels (maximum 16000 pixels per side), including ordinary phone photos above 12 megapixels. HEIC must be converted to JPEG or PNG first.

Prepared copies preserve aspect ratio and never upscale. They target a maximum 1600-pixel long edge and 300000 bytes each; the encoder tries JPEG qualities 85%, 80% and 75% before reducing resolution further. The original files on disk are unchanged. Thumbnails report the prepared dimensions. Duplicate detection uses the original file bytes. Eight copies total at most 2.4 MB before multipart overhead. Analysis and retries reuse these copies rather than repeatedly compressing them. The server still validates all image bytes independently.

## Update from GitHub

Once this source is pushed to https://github.com/Car-XY/ClearPath, use a Git checkout instead of extracting new ZIPs. Keep `.env.local` beside `package.json`; Git ignores it.

From an existing checkout:

```powershell
git pull --ff-only
npm ci
npm run dev
```

Stop the development server with Ctrl+C before updating. For initial setup, clone the repository into a new folder, copy your private `.env.local` into that checkout, and run the commands above. Do not overwrite an existing folder or commit API keys. A GitHub push updates source only; a running local app still needs a pull and restart.

### Multipart server limit fix

`next.config.ts` explicitly sets `experimental.serverActions.bodySizeLimit` to `21mb`, aligned with the API's bounded request reader. The pinned Vinext runtime applies its progressive form-action gate to multipart API requests before route dispatch. Its default 1 MiB gate rejected four otherwise valid optimized room photos. This configuration fixes that earlier rejection without forcing smaller images or removing the server's own validation. Restart the development server after changing this configuration. A regression test exercises the installed framework gate, since browser mocks of `/api/analyze` bypass it.

## Guided capture and draft update

The capture dialog offers four suggested viewpoints: doorway, left, opposite and right. Use the camera or existing files, label positions if known, and optionally enter measured width and depth. Missing positions do not block generation. Keep the camera in the intended room, include floor-wall edges and overlapping furniture, and mention glass or reflections in notes. Walking is optional; use accessible positions or help from another person. There is no sensor-based camera tracking, LiDAR measurement, or automatic coverage verification in this browser workflow.

This update preserves the framework multipart limit fix from local base commit `d16c7fc`. The prepared Git checkout and downloadable source are synchronized. Live Claude reconstruction has not been reproduced here because this local test environment has no Anthropic key/model. A smoke test using the previously inherited OpenAI configuration returned HTTP 429; that result cannot diagnose a Claude-configured deployment. All claims about Claude request/response behavior below refer to mocked integration and browser fixtures.

## Subsequent live Claude verification

A later verification used the actual private Anthropic configuration from the user’s installed copy and all five supplied room photos. Both the older installed generation adapter and the latest compact-draft adapter received HTTP 200 with normal completion from `claude-sonnet-5-5` (53.1 and 29.6 seconds respectively, one request per version). The generated projects passed schema validation and were imported and rendered in ClearPath’s 3D and top-down views. These single successful runs do not establish repeatability or measured geometric accuracy. Prior statements above that live Claude reconstruction was unverified describe the earlier test state. The actual room JSON files, screenshots and verification report are private local deliverables outside the repository. Credentials and original photos remain excluded from source archives.

## Product furniture, height, anchors and spacing

Choose **Add furniture → Add from a product link**. The server uses `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` for Claude product generation, independently of the photo-provider selection. Review dimensions and the 3D preview before inserting. Automatic reading supports the listed retailers, including Amazon and IKEA; a blocked page has a pasted title/dimensions/description recovery path. This produces a validated procedural approximation, not manufacturer CAD. Only bounded boxes, cylinders, cones and spheres are accepted; provider output cannot execute code. Requests, redirects, page bodies, images and provider responses are bounded.

**Height & attachment** in Object details supports free placement, another furniture object, a wall, ceiling or fixed 3D point. Height and anchor offsets are editable. Parent translation/rotation/elevation carries attached children. Deleting a parent preserves children at their resolved world poses and removes invalid spacing references. Original/saved restoration reconciles references; JSON and local persistence retain all new fields. X/Z remain floor axes; Y is height.

**Layout constraints** supports minimum/optional maximum horizontal edge gaps or 3D center distances between two objects. Required rules reject edits that worsen any individual rule; preferences affect suggestion scores. Suggestions check moving assemblies, including children, within a bounded translation/rotation search. Some valid layouts may remain undiscovered. Required headroom is adjustable from 0.5–3 m. Review room height in Review room when placing overhead objects.

Chair backrests now use positive local Z in both views. Zero rotation faces north/negative Z; positive PI/2 faces east. Photo and product prompts use this convention. Rotations that preserve an already imperfect estimate’s footprint are allowed, including turning a chair 180 degrees.

Verification for this update: 116 unit/integration tests across 14 suites, 28 desktop/mobile browser tests, two additional visual-render checks, TypeScript and a production build. A real IKEA product-page/image fetch and Claude request returned HTTP 200/end_turn in 11.9 seconds, producing a five-part 0.55 × 0.55 × 0.45 m LACK table. Private verification outputs are outside the source tree and all private environment files are excluded from archives.

## Daylight and room customization

The **Customizability** tab adds a client-side daylight simulator and ergonomics coach. The toolbar’s **☀ Daylight** button opens the same controls. Enable the simulator and scrub 06:00–20:00: an illustrative east-to-west sun arc across the north sky drives a directional light, warm/dim ends, and floor polygons projected from each front-facing window’s width, sill and height. Polygons are clipped and faded at walls. The optional relative heatmap samples daily window exposure on a bounded grid and is memoized; it does not model real location/date, weather, blinds, neighboring buildings or furniture occlusion. Window openings can be added, edited or removed in this section.

The coach registry in `lib/ergonomics.ts` contains eight rules. Findings re-evaluate on layout changes; expanding a finding shows a one-sentence fix, pulses its furniture and focuses the camera. Adjust seated eye height under **Coach assumptions**. Monitor checks use the desk’s assumed monitor and a seat-height approximation; these are planning heuristics. **Patient Care** and **Game Room** are explicit coming-soon placeholders. Room-type placeholders use an extensible section registry, and rules are data objects. Monitor guidance is linked to OSHA in the panel.

Selection controls now occupy a collapsible footer dock outside the 3D canvas. They retain rotation, height changes, locking and undo. Walkthrough supports mouse/touch dragging, Page Up/Page Down or I/K, on-screen tilt controls and Level reset. Pitch clamps at ±80°. Existing WASD/arrow movement, yaw, eye-height controls and collision behavior are preserved.

The photo creator accepts optional camera lens height in meters; blank uses an explicit 1.50 m default. The existing photo request includes this reference in the measurement logic and prompt. Room state and the measurement record keep it separately from ceiling height; review and estimated furniture details show height ratios relative to it. It persists in JSON/device storage. It does not silently rescale confirmed measurements or establish a measured reconstruction. Old projects without the optional fields remain valid.

Verification of these five improvements: **131 unit/integration tests across 15 suites passed; all 38 desktop/mobile browser scenarios passed across the full run and focused reruns; TypeScript and the production build passed.** Browser checks verify sunlight render changes, heatmap/window controls, live coach fixes/focus, unobscured and collapsible controls, mouse/button/keyboard tilt with fixed eye height, and camera-height submission/review. Additional walkthrough regressions verify scene controls remain visible and save/reload/view switching still work. The existing large 3D client-chunk warning remains.

## Room Studio, visible exposure and fullscreen

Customizability now lives in the right-hand **Room Studio**, alongside an **Object details** tab. On phones, use the **Room studio** bottom button. Choose a planning theme: Ergonomics coach evaluates live warnings and influences improvement candidates; Patient Care and Game Room are explicitly unavailable placeholders. Suggestions remain client-side and deterministic, using the existing geometry engine plus ergonomics penalties; they do not call Claude. Locks, anchors and required distance constraints remain enforced. The bounded search now includes rotations in place, including 180° chair corrections.

The daily heatmap is applied to actual opaque room/furniture materials, rather than a faint floor overlay hidden under furniture. Blue represents low/no exposure; cyan through yellow/red represents more exposure. Furniture receives the exposure score at its horizontal floor position, not a measured solar-energy estimate. A zero-exposure room shows an explanation instead of silently displaying an empty layer. Sun arc rotation can align the illustrative arc with windows on any wall.

Rooms have a physical ceiling by default. **Show roof** controls visibility only; a hidden roof and full-height shadow walls still block the sun. Transparent window panes no longer cast opaque shadows. Uncheck **Room has a ceiling** only for an open-air space; this setting persists with the project. Walkthrough shows the ceiling by default; the roof visibility toggle also works in that view.

Use **Fullscreen map** in the viewport toolbar to expand the map, retaining view switching, roof controls, walkthrough and the editing dock. Exit with the same button or Escape. Browsers without native fullscreen use an expanded viewport fallback. The Daylight button returns to Room Studio to edit the full set of controls.

Verification for the Room Studio/rendering update: **134 unit/integration tests across 16 suites passed; 44 unique desktop/mobile browser scenarios passed across the complete regression run and focused fullscreen/rendering checks; TypeScript passed.** Rendering checks count visible heatmap pixels, capture roof visibility, catch shader errors, verify native/fullscreen fallback sizing and Escape selection preservation, and verify an ergonomics-focused chair correction. Existing provider, upload resizing, capture, attachment, distance-rule, undo, export and walkthrough regressions pass.
Production build passed. The existing large 3D client chunk warning remains.

## Click-to-draw floor routes and heatmap spectrum

Choose **Draw route** in the map toolbar, or **Routes → Draw a route**. Drawing opens top-down view. Click/tap a start, optional stops and an end on clear floor, name the route and choose **Save route**. Each ordered pair uses the existing 5 cm A* grid, then continuous swept-disc checks safely simplify the path. Connections avoid rotated furniture, fixed obstacles and walls, using the current movement width/margins. This approximates the shortest clear path on that grid, not the exact continuous Euclidean optimum. A blocked click is rejected rather than connected through an object. Points store X/Z only and remain at floor level. Limits are 20 points per route and 20 routes per room.

Use **Undo point**, Backspace or Ctrl/Cmd+Z while drawing to remove the latest point. Escape/Cancel discards the draft. The routes sidebar offers **Edit route points** for saved custom routes. Save is one undoable change. Required-route status remains editable; routes, start/stop coordinates and names persist in project JSON and local storage. Geometry recomputes all ordered legs after layout/profile changes; a blocked saved route reports unavailable and does not draw a straight line across furniture. Entrance-based routes keep their previous behavior.

Heatmaps now use a shared five-stop blue/cyan/green/yellow/red palette in both views. The 3D shader maps scalar daily exposure to this palette after lighting/tone mapping and before display color conversion. Current-hour sunlight patches are hidden during heatmap mode to avoid bleaching or blending the diagnostic colors. Zero exposure stays blue, and relative maximum exposure reaches red. Furniture still uses daily exposure at its floor position; this is an approximate relative map, not a local solar-energy model. The object editing dock now aligns with the left edge beneath the map.

Verification for floor routes and the heatmap spectrum: **140 unit/integration tests across 17 suites, all 50 desktop/mobile browser scenarios, and TypeScript passed.** Route checks cover shortest direct connections, rotated obstacle detours, ordered stops, blocked partitions, later stop obstruction, persistence, undo/redo, editing and tap/click placement. Render checks verify warm/green heatmap pixels and left-edge dock alignment; all previous upload, provider, attachment, distance-rule, walkthrough, roof, theme and fullscreen scenarios pass.
Production build also passed. The existing large 3D client chunk warning remains.

## Reactive heatmaps and grouped map toolbar

Heatmaps now refresh after changes to furniture/fixed-obstacle positions, rotation, dimensions, elevation, anchors, additions/removals, room dimensions, physical ceiling presence, windows and sun arc rotation. The default **At selected time** view also follows the time slider. **Whole day (06:00–20:00)** integrates the entire sun arc and intentionally ignores the display clock. Both use the current scene. A shared, bounded CPU calculation is debounced by 100 ms and reused in the 2D/3D views; the map shows Updating/Updated status. Labels, colors, routes and roof visibility do not trigger unnecessary exposure calculations.

Direct-light sampling traces rays through room windows or the open roof and tests rotated opaque furniture/fixed-obstacle box bounds for occlusion. Furniture colors estimate direct exposure at each object's top center. This is illustrative: detailed model holes/legs, reflections, weather and neighboring buildings are not simulated. Hiding the roof for editing preserves the ceiling; uncheck Room has a ceiling to physically remove it.

The renderer keeps stable uniform bindings per material and updates their texture/object-score values even when Three.js reuses an existing shader program. Explicit invalidation requests a frame in the planning canvas's demand-render mode. This fixes stale GPU textures after a valid recalculation. The shared palette remains independent of current-hour sunlight overlays.

The top map toolbar groups 3D view, Top-down and Walkthrough on the left. Draw route, Daylight, Show/Hide roof and Fullscreen form a separate group aligned to the right. On phones the groups wrap onto separate rows with the same left/right alignment.
Drag previews and Original/Proposed comparisons use exposure calculations for their displayed layout; unchanged views reuse the shared calculation.

Validation: 145 unit/integration tests across 18 suites, TypeScript, and all 54 unique desktop/mobile scenarios passed across the complete regression run and focused final reruns. New render checks verify actual warm pixels vanish and return after rotation/time edits, furniture shadow cells refresh after moving objects, physical roof removal opens light, whole-day totals ignore the clock, comparison layouts compute separate maps, and toolbar groups align in normal/fullscreen layouts.
Production build passed; the existing large 3D client chunk warning remains.
