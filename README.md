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

Copy `.env.example` to `.env.local`, privately enter `OPENAI_API_KEY`, and leave `OPENAI_MODEL=gpt-5.6-sol` for GPT-5.6 Sol. Local environment files are loaded by the dev server. You can alternatively set these in the server process environment. Choose a model available to your account that supports image input and strict Structured Outputs in the Responses API. No model is hardcoded. An optional `PHOTO_ANALYSIS_TIMEOUT_MS` is clamped to 10–120 seconds, with a 75-second default.

For a local PowerShell session, set the environment before starting the server:

```powershell
$env:OPENAI_API_KEY = 'your-server-api-key'
$env:OPENAI_MODEL = 'gpt-5.6-sol'
npm run dev
```

Never prefix credentials with `NEXT_PUBLIC_`, put them in client components, or commit them. The adapter sends multiple photos together to `https://api.openai.com/v1/responses`; it asks for a strict semantic scene, reconciled object identity, evidence photo IDs, uncertainty observations, and measurement provenance. Provider responses are validated before becoming a project. Network failures, refusal, timeouts, malformed output and missing configuration produce recoverable errors. Missing credentials never substitute the demo for the user's photos.

JPEG and PNG are supported: 1–8 source photos, up to 20 MB and 64 megapixels each. The browser automatically prepares JPEG upload copies before the server receives them: a maximum 1600-pixel long edge and 300 KB each, with no upscaling. The server independently enforces its 5 MB/file, 20 MB/total and 12 MP/decoded-image safety limits on those prepared copies. Four to eight overlapping views are guidance, not a reconstruction guarantee. Convert HEIC or other formats before uploading.

The upload dialog discloses the external provider before sending. Images are processed in memory and are not logged or retained by the application server. The provider's own data policy still applies. By default, browser persistence and JSON export keep only photo references, evidence and the editable model; source image bytes are excluded. The persistence library supports explicit image-retention opt-in, but the current interface does not enable it. Export & privacy offers source-reference removal and complete project deletion.

**Live reconstruction remains unverified without configured credentials and representative room photos.** Passing mocked integration tests establishes adapter behavior, not reconstruction quality.

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

The initial model supports one rectangular, level-floor room. Unsupported boundaries are retained for correction, not silently treated as a verified rectangle. Furniture uses its actual rotated rectangular footprint. Objects are floor obstacles regardless of their height; under-furniture passage is unsupported.

The travel model is a circular envelope with radius **travel width / 2 + comfort margin + measurement uncertainty margin**. Each margin is per side. Obstacles and room edges use that radius once. The initial 5 cm grid conservatively includes the cell half-diagonal; borderline corridors get an exact swept-disc edge retry. A* forbids diagonal corner cutting. Every simplified segment is continuously validated against rotated polygons and boundaries. Anchors must be on usable interior floor; doorway width is checked separately. Paths cannot cross walls through an unmodeled opening.

Approximate route lengths and minimum available diameter are reported in 5 cm increments. Bottleneck markers locate a limiting point along the computed route. A blocked-object explanation names an object only when removing its footprint restores a checked path. The counterfactual checks up to eight plausible movable objects; no identified blocker does not prove that none exists. Improvement search is bounded to 180 candidate translation/rotation placements and moves one unlocked movable object at a time. No suggestion within that budget does not establish impossibility.

An enabled turning diameter checks a stationary circle at the destination. It does not simulate every wheelchair, walker or multi-step maneuver. Green means the current scene passes selected checks; amber means estimates or marginal/unresolved checks; red means blocked or invalid. These outcomes do not certify accessibility, guarantee maneuverability, replace professional assessment, or establish that furniture can physically be transported to the proposed arrangement.

## Verification and limitations

| Check | Recorded result |
| --- | --- |
| Automated geometry, model, persistence, history and provider tests | 63 tests passed across 7 suites after the bug review. Provider tests use labeled mocks; persistence unit tests use a deterministic IndexedDB adapter mock. |
| Demo geometry | Verified: original has 1/2 required routes, exact `DEMO_MOVE` has 2/2 green routes and no placement issues. |
| Type checking | `tsc --noEmit` passed. |
| Production build | Passed with the Sites build helper. A large client chunk warning remains because of the 3D libraries. |
| Desktop/mobile browser workflow and visual inspection | 14 Playwright tests passed, including unlock/movement, canceled drag, restoration/export regressions, plus computed transition, undo/redo, profile changes, persistence, coordinated views, walkthrough, compare, JSON export, top-down drag, missing-provider recovery, and labeled mock upload/duplicate/calibration. Desktop and phone rendering visually inspected. |
| Real provider/representative photos | Key/model access verified with HTTP 200. A synthetic-render live analysis attempt received HTTP 429. Successful real-room reconstruction remains unverified. |

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
PHOTO_ANALYSIS_TIMEOUT_MS=75000
```

Use a Claude API model available to your Anthropic account that supports image input and structured JSON output. Obtain the model ID from the Anthropic Console; a Claude chat subscription alone does not configure API access. The adapter uses `POST https://api.anthropic.com/v1/messages`, base64 image blocks, and `output_config.format` with the existing room schema. Returned dimensions, object IDs and photo references still pass the same local validation. No Anthropic credentials have been supplied, so live Claude reconstruction has not been verified; provider behavior is covered by mocked integration tests.

For OpenAI, set `PHOTO_PROVIDER=openai` (also the default when omitted), `OPENAI_API_KEY`, and `OPENAI_MODEL`. Existing OpenAI setups continue working. `/api/config` exposes the selected provider and readiness, never its secret. The photo consent names the selected provider before any photos are sent.

## Rotate furniture in the scene

Select furniture in the 3D scene or furniture list. The floating scene control shows its angle and buttons to rotate by 15 degrees in either direction. You can also drag the green rotation handle or press R. Locked or fixed objects must be unlocked first. Rotations use the same collision validation and undo/redo history as moving furniture; rejected rotations preserve the previous pose. Route checks update after a successful rotation.

## Automatic photo sizing

Choose up to eight JPEG or PNG photos. ClearPath prepares upload copies as soon as you select them, before applying server upload limits. It accepts source photos up to 20 MB and 64 megapixels (maximum 16000 pixels per side), including ordinary phone photos above 12 megapixels. HEIC must be converted to JPEG or PNG first.

Prepared copies preserve aspect ratio and never upscale. They target a maximum 1600-pixel long edge and 300000 bytes each; the encoder tries JPEG qualities 85%, 80% and 75% before reducing resolution further. The original files on disk are unchanged. Thumbnails report the prepared dimensions and size. Duplicate detection uses the original file bytes. Eight copies total at most 2.4 MB before multipart overhead. Analysis and retries reuse these copies rather than repeatedly compressing them. The server still validates all image bytes independently.

## Update from GitHub

Once this source is pushed to https://github.com/Car-XY/ClearPath, use a Git checkout instead of extracting new ZIPs. Keep `.env.local` beside `package.json`; Git ignores it.

From an existing checkout:

```powershell
git pull --ff-only
npm ci
npm run dev
```

Stop the development server with Ctrl+C before updating. For initial setup, clone the repository into a new folder, copy your private `.env.local` into that checkout, and run the commands above. Do not overwrite an existing folder or commit API keys. A GitHub push updates source only; a running local app still needs a pull and restart.
