'use client';
/* eslint-disable @next/next/no-img-element -- These previews use private, temporary browser object URLs. */

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, ImagePlus, LoaderCircle, RotateCcw, ShieldCheck, Trash2, TriangleAlert, X } from 'lucide-react';
import { validateProject, type Project } from '../lib/model';
import './photo-wizard.css';
import { readPhotoResponse } from '../lib/photo-response';
import { prepareUploadPhoto, SOURCE_PHOTO_LIMITS } from '../lib/photo-upload';
import { captureHeightReference, withCameraReference } from '../lib/camera-calibration';
import CaptureGuide, { captureSteps, type CaptureViewpoint } from './CaptureGuide';

type Props = { onComplete(project: Project): void; onDemo(): void; onManual(): void; onClose(): void };
type LocalPhoto = { id: string; file: File; url: string; hash: string; width: number; height: number; viewpoint?: CaptureViewpoint };
type Configuration = { configured: boolean; provider: 'OpenAI' | 'Anthropic'; reason?: string };
type Stage = 'capture' | 'preparing' | 'analyzing' | 'checking';
const LIMIT = { count: 8 };

async function decodeSize(file: File, url: string) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return size;
  }
  const image = new Image(); image.src = url; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight };
}

export default function PhotoWizard({ onComplete, onDemo, onManual, onClose }: Props) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [configError, setConfigError] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [name, setName] = useState('My room');
  const [notes, setNotes] = useState('');
  const [measuredWidth, setMeasuredWidth] = useState('');
  const [measuredDepth, setMeasuredDepth] = useState('');
  const [cameraHeight,setCameraHeight]=useState('');
  const [consent, setConsent] = useState(false);
  const [stage, setStage] = useState<Stage>('capture');
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const uploadInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const capturePosition = useRef<CaptureViewpoint | undefined>(undefined);
  const objectUrls = useRef(new Set<string>());
  const pending = useRef<AbortController | null>(null);
  const run = useRef(0);
  const photosRef = useRef(photos);
  const preparingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  const busy = stage !== 'capture';
  useEffect(() => {
    if (!busy) return;
    const began = Date.now(); setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  function startCapture(position: CaptureViewpoint, camera: boolean) {
    capturePosition.current = position;
    (camera ? cameraInput : uploadInput).current?.click();
  }
  function labelPhoto(id: string, viewpoint: string) {
    photosRef.current = photosRef.current.map(photo => photo.id === id ? { ...photo, viewpoint: (viewpoint || undefined) as CaptureViewpoint | undefined } : photo);
    setPhotos(photosRef.current);
  }

  useEffect(() => {
    const urls = objectUrls.current;
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not check the photo service.');
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object') throw new Error('The photo service configuration could not be read.');
      const config = value as Record<string, unknown>;
      if (typeof config.configured !== 'boolean' || !['OpenAI', 'Anthropic'].includes(String(config.provider))) throw new Error('The photo service configuration could not be read.');
      setConfiguration({ configured: config.configured, provider: config.provider as Configuration['provider'], ...(typeof config.reason === 'string' ? { reason: config.reason } : {}) });
    }).catch(reason => { if (!controller.signal.aborted) setConfigError(reason instanceof Error ? reason.message : 'Could not check the photo service.'); });
    return () => controller.abort();
  }, [configAttempt]);

  function discardUrl(url: string) { URL.revokeObjectURL(url); objectUrls.current.delete(url); }
  async function addFiles(files: FileList | null, replaceId?: string) {
    if (!files?.length || preparingRef.current || busy) return;
    preparingRef.current = true;
    setPreparingFiles(true); setError(''); setErrorCode('');
    const viewpoint = capturePosition.current; capturePosition.current = undefined;
    const current = photosRef.current;
    const retained = replaceId ? current.filter(photo => photo.id !== replaceId) : [...current];
    const accepted: LocalPhoto[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      if (retained.length + accepted.length >= LIMIT.count) { errors.push('A room can include up to 8 photos. Remove a photo to add another.'); break; }
      if (!['image/jpeg', 'image/png'].includes(file.type)) { errors.push(`${file.name}: use JPEG or PNG. Convert HEIC or other formats first.`); continue; }
      if (!file.size || file.size > SOURCE_PHOTO_LIMITS.bytes) { errors.push(`${file.name}: use a nonempty photo no larger than 20 MB.`); continue; }
      const url = URL.createObjectURL(file); objectUrls.current.add(url);
      let preparedUrl: string | undefined;
      try {
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map(value => value.toString(16).padStart(2, '0')).join('');
        if ([...retained, ...accepted].some(photo => photo.hash === hash)) throw new Error('This exact photo is already included. Choose a different view.');
        const prepared = await prepareUploadPhoto(file, url);
        if (!mounted.current) break;
        preparedUrl = URL.createObjectURL(prepared); objectUrls.current.add(preparedUrl);
        const size = await decodeSize(prepared, preparedUrl);
        accepted.push({ id: replaceId ?? crypto.randomUUID(), file: prepared, url: preparedUrl, hash, ...size, ...(viewpoint ? { viewpoint } : {}) });
      } catch (reason) { if (preparedUrl) discardUrl(preparedUrl); errors.push(`${file.name}: ${reason instanceof Error && reason.message.includes('photo') ? reason.message : 'This image could not be decoded. Re-export it as JPEG or PNG.'}`); }
      finally { discardUrl(url); }
      if (replaceId) break;
    }
    preparingRef.current = false;
    if (!mounted.current) { accepted.forEach(photo => discardUrl(photo.url)); return; }
    if (accepted.length) {
      if (replaceId) { const old = current.find(photo => photo.id === replaceId); if (old) discardUrl(old.url); }
      photosRef.current = [...retained, ...accepted];
      setPhotos(photosRef.current);
    }
    setError(errors.join(' ')); setPreparingFiles(false);
    if (uploadInput.current) uploadInput.current.value = '';
    if (cameraInput.current) cameraInput.current.value = '';
  }
  function removePhoto(id: string) { const photo = photos.find(item => item.id === id); if (photo) discardUrl(photo.url); photosRef.current = photosRef.current.filter(item => item.id !== id); setPhotos(photosRef.current); setError(''); }
  function cancelAnalysis() { run.current++; pending.current?.abort(); pending.current = null; setStage('capture'); setError('Analysis cancelled. Your selected photos are ready when you are.'); }
  async function analyze() {
    if (!configuration?.configured || !consent || !photos.length || busy || preparingFiles) return;
    const width = measuredWidth.trim() ? Number(measuredWidth) : undefined;
    if (width !== undefined && (!Number.isFinite(width) || width < 1 || width > 25)) { setError('Enter a measured room width between 1 and 25 meters, or leave it empty.'); return; }
    const depth = measuredDepth.trim() ? Number(measuredDepth) : undefined;
    if (depth !== undefined && (!Number.isFinite(depth) || depth < 1 || depth > 25)) { setError('Enter a measured room depth between 1 and 25 meters, or leave it empty.'); return; }
    let cameraReference:ReturnType<typeof captureHeightReference>;try{cameraReference=captureHeightReference(cameraHeight);}catch(reason){setError((reason as Error).message);return;}
    const currentRun = ++run.current; const controller = new AbortController(); pending.current = controller;
    setError(''); setErrorCode(''); setStage('preparing');
    let timedOut = false;
    const deadline = window.setTimeout(() => { timedOut = true; controller.abort(); }, 130000);
    try {
      const form = new FormData();
      photos.forEach(photo => form.append('photos', photo.file));
      form.append('metadata', JSON.stringify({ name: name.trim() || 'My room', captureNotes: notes.trim(), photos: photos.map(photo => ({ id: photo.id, name: photo.file.name.slice(0, 160), ...(photo.viewpoint ? { viewpoint: photo.viewpoint } : {}) })) }));
      form.append('measurements', JSON.stringify({ width, depth, cameraHeight:cameraReference.meters,cameraHeightSource:cameraReference.source }));
      setStage('analyzing');
      const response = await fetch('/api/analyze', { method: 'POST', headers: { Accept: 'application/x-ndjson' }, body: form, signal: controller.signal });
      const value: unknown = await readPhotoResponse(response);
      if (run.current !== currentRun) return;
      if (!value || typeof value !== 'object') throw new Error('Photo analysis returned an unreadable response. Retry or create the room manually.');
      const result = value as { project?: unknown; error?: { message?: unknown; code?: unknown } };
      if (!response.ok || result.error) {
        if (typeof result.error?.code === 'string') setErrorCode(result.error.code);
        throw new Error(typeof result.error?.message === 'string' ? result.error.message : 'The room service could not finish. Your photos are still selected. Retry or create the room manually.');
      }
      setStage('checking');
      const project = validateProject(result.project);
      if (run.current !== currentRun) return;
      onComplete(withCameraReference(project,cameraReference.meters,cameraReference.source));
    } catch (reason) {
      if (run.current !== currentRun || (controller.signal.aborted && !timedOut)) return;
      if (timedOut) { setError('The connection took too long to return a room draft. Your photos are still selected. Retry once, or create the room manually.'); setErrorCode('CONNECTION_TIMEOUT'); setStage('capture'); return; }
      setError(reason instanceof Error && reason.name !== 'ZodError' ? reason.message : 'The returned room could not be validated. Try again or create the room manually.'); setStage('capture');
    } finally { window.clearTimeout(deadline); if (run.current === currentRun) pending.current = null; }
  }
  return <div className="ph-dialog ph-body">
    <header className="ph-header"><div><div className="ph-eyebrow">YOUR ROOM, A NEW PERSPECTIVE</div><h2>A simple start to your room.</h2><p>Add a few views, then review an editable draft. Measurements stay estimated until you confirm them.</p></div></header>
    <div className="ph-content">
      {busy ? <div className="ph-processing" aria-live="polite"><div className="ph-processing-icon"><LoaderCircle className="ph-spin" size={36}/></div><h3>{stage === 'preparing' ? 'Preparing your photos' : stage === 'checking' ? 'Checking the editable model' : 'Finding the room in your photos'}</h3><p>{stage === 'analyzing' ? 'The photo service is identifying room structure and furniture together. A draft usually takes 30–110 seconds; you can cancel without losing your photos.' : stage === 'checking' ? 'Validating dimensions, object identities and the room data.' : 'Your photos are already optimized. Preparing the room request.'}</p><p className="ph-processing-time">{elapsed} seconds elapsed · waiting for the room service</p><ol className="ph-stages"><li className={stage !== 'preparing' ? 'is-done' : 'is-active'}>{stage !== 'preparing' ? <Check size={18}/> : <LoaderCircle size={18}/>}Preparing photos</li><li className={stage === 'analyzing' ? 'is-active' : stage === 'checking' ? 'is-done' : ''}>{stage === 'checking' ? <Check size={18}/> : <Camera size={18}/>}Identifying structure & furniture</li><li className={stage === 'checking' ? 'is-active' : ''}><ShieldCheck size={18}/>Building & checking the editable model</li></ol><p className="ph-small">Photos provide estimates. You’ll review the entrance, boundary and measurements next.</p><button className="ph-secondary" onClick={cancelAnalysis}><X size={16}/>Cancel analysis</button></div> : <>
        <div className="ph-columns"><section className="ph-main" aria-label="Room photos"><CaptureGuide positions={photos.map(photo => photo.viewpoint)} disabled={preparingFiles || photos.length >= 8} onAdd={startCapture}/><div className="ph-section-heading"><h3>Your photos</h3><span>{photos.length} / 8</span></div>
          {!photos.length ? <div className="ph-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}><div className="ph-upload-icon"><ImagePlus size={30}/></div><h3>Bring your room into focus</h3><p>Drop photos here, or choose them below.<br/>JPEG or PNG · up to 20 MB each · resized automatically</p><button className="ph-primary" onClick={() => uploadInput.current?.click()} disabled={preparingFiles}><ImagePlus size={18}/>Choose photos</button><button className="ph-text-button" onClick={() => cameraInput.current?.click()} disabled={preparingFiles}><Camera size={17}/>Take a photo</button></div> : <><div className="ph-photo-grid">{photos.map((photo, index) => <article className="ph-photo" key={photo.id}><img src={photo.url} alt={`Room view ${index + 1}: ${photo.file.name}`}/><div className="ph-photo-index">{index + 1}</div><div className="ph-photo-actions"><label className="ph-icon ph-replace" title="Replace photo"><RotateCcw size={15}/><span className="ph-sr-only">Replace photo {index + 1}</span><input type="file" accept="image/jpeg,image/png" disabled={preparingFiles} onChange={event => void addFiles(event.target.files, photo.id)}/></label><button className="ph-icon" aria-label={`Remove photo ${index + 1}`} disabled={preparingFiles} onClick={() => removePhoto(photo.id)}><Trash2 size={15}/></button></div><div className="ph-photo-caption">{photo.file.name}<small>{photo.width} × {photo.height} · optimized</small><select aria-label={`Photo ${index + 1} position`} disabled={preparingFiles} value={photo.viewpoint ?? ''} onChange={event=>labelPhoto(photo.id,event.target.value)}><option value="">Position not specified</option>{captureSteps.map(step=><option key={step.id} value={step.id}>{step.label}</option>)}</select></div></article>)}</div><p className="ph-small">Upload copies are resized to a maximum 1600-pixel long edge and 300 KB per photo. Your original files stay unchanged.</p><div className="ph-add-buttons"><button className="ph-secondary" onClick={() => uploadInput.current?.click()} disabled={photos.length >= 8 || preparingFiles}><ImagePlus size={17}/>Add photos</button><button className="ph-secondary" onClick={() => cameraInput.current?.click()} disabled={photos.length >= 8 || preparingFiles}><Camera size={17}/>Use camera</button></div></>}
          <input ref={uploadInput} className="ph-sr-only" tabIndex={-1} type="file" accept="image/jpeg,image/png" multiple onChange={event => void addFiles(event.target.files)}/><input ref={cameraInput} className="ph-sr-only" tabIndex={-1} type="file" accept="image/jpeg,image/png" capture="environment" onChange={event => void addFiles(event.target.files)}/>
          {preparingFiles && <p className="ph-small" role="status">Optimizing photos for upload and checking for exact duplicates…</p>}
          <div className="ph-details"><label>Room name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="My living room"/></label><label>Measured room width <span>(optional, meters)</span><input type="number" inputMode="decimal" min={1} max={25} step="0.01" value={measuredWidth} onChange={event => setMeasuredWidth(event.target.value)} placeholder="e.g. 4.20"/></label><label>Measured room depth <span>(optional, meters)</span><input type="number" inputMode="decimal" min={1} max={25} step="0.01" value={measuredDepth} onChange={event => setMeasuredDepth(event.target.value)} placeholder="e.g. 3.50"/></label><label className="ph-camera-height">Camera height <span>(optional, meters above the floor)</span><input aria-label="Capture camera height (m)" type="number" inputMode="decimal" min={.3} max={3} step=".01" value={cameraHeight} onChange={e=>setCameraHeight(e.target.value)} placeholder="Default: 1.50"/><small aria-live="polite">{cameraHeight.trim()?`Using entered camera height: ${cameraHeight} m`:'Using default camera height: 1.50 m'}. Measure from the floor to the lens; use a similar height for every photo.</small></label><label className="ph-notes">Anything we should know? <span>(optional)</span><textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} rows={2} placeholder="Which doorway is the entrance? Any furniture hidden from view?"/></label></div>
        </section><aside className="ph-guidance"><div className="ph-guide-symbol"><Camera size={23}/></div><h3>A little overlap helps.</h3><p>Aim for 3–4 overlapping views of this room. More photos are optional. A measured width or depth helps establish scale.</p><ul><li>Include the floor-wall edges and doorways.</li><li>Show large furniture from more than one angle.</li><li>Keep furniture in the same place between shots.</li><li>Use clear, even lighting.</li><li>Keep the camera inside this room. Glass may show reflections or another room; mention that in your notes.</li></ul><div className="ph-alternative"><strong>Work with the views you have.</strong><p>One photo is enough to start. Upload existing images, ask someone to help, or fill in missing details during review.</p></div><p className="ph-small">Initial support: a single, level-floor rectangular room. Uncertain shapes need boundary correction.</p></aside></div>
        {error && <div className="ph-alert" role="alert"><TriangleAlert size={20}/><div><p>{error}</p>{errorCode && <details className="ph-error-detail"><summary>Error details</summary><code>{errorCode}</code></details>}<button className="ph-text-button" onClick={onManual}>Create the room manually</button></div></div>}
        {!configuration && !configError && <p className="ph-small" role="status">Checking the live photo service…</p>}
        {configuration?.configured && <p className="ph-small" role="status">Photo analysis service: <strong>{configuration.provider === 'Anthropic' ? 'Claude by Anthropic' : 'OpenAI'}</strong>. Photos go only to this selected provider.</p>}
        {configError && <div className="ph-alert" role="alert"><TriangleAlert size={20}/><div><p>{configError}</p><button className="ph-text-button" onClick={() => { setConfigError(''); setConfiguration(null); setConfigAttempt(value => value + 1); }}>Check again</button></div></div>}
        {configuration && !configuration.configured && <div className="ph-unavailable"><TriangleAlert size={22}/><div><strong>Live photo analysis isn’t configured yet.</strong><p>{configuration.reason}</p><div><button className="ph-secondary" onClick={onDemo}>Explore sample room</button><button className="ph-secondary" onClick={onManual}>Create room manually</button></div></div></div>}
        {configuration?.configured && <label className="ph-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>I agree to send these room photos, notes and measurements to <strong>{configuration.provider}</strong> for analysis. ClearPath does not retain uploads on its server. Provider data handling follows <a href={configuration.provider === 'Anthropic' ? 'https://privacy.claude.com/' : 'https://platform.openai.com/docs/guides/your-data'} target="_blank" rel="noreferrer">{configuration.provider}’s policy</a>. Photos remain in this browser session until closed.</span></label>}
      </>}
    </div>
    {!busy && <footer className="ph-footer"><button className="ph-back" onClick={onClose}><ArrowLeft size={17}/>Back</button><div><span>{photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} selected` : 'Your room starts here'}</span><button className="ph-primary" onClick={() => void analyze()} disabled={!configuration?.configured || !photos.length || !consent || preparingFiles}>Create room estimate<ArrowRight size={18}/></button></div></footer>}
  </div>;
}
