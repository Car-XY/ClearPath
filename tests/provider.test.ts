import { afterEach, describe, expect, it, vi } from 'vitest';
import { encode } from 'fast-png';
import { analyzePhotos, photoConfiguration, preparePhotos, readAnalysisForm, type PreparedPhoto } from '../lib/photo-provider';
import { POST } from '../app/api/analyze/route';
import { GET } from '../app/api/config/route';

// All provider responses in this suite are mocks, not evidence of live reconstruction quality.
const env = { OPENAI_API_KEY: 'mock-secret-key', OPENAI_MODEL: 'mock-vision-model' };
const photos: PreparedPhoto[] = [{ id: 'photo-1', name: 'room.png', dataUrl: 'data:image/png;base64,mock', mime: 'image/png', width: 2, height: 2 }];
const fixture = () => ({ units: 'm', shape: 'rectangular', room: { width: 5, depth: 4, height: 2.5, boundary: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }], evidencePhotoIds: ['photo-1'] }, doors: [{ id: 'entrance', wall: 'south', position: 1, width: .9, hinge: 'start', swing: 'unknown', evidencePhotoIds: ['photo-1'] }], windows: [], furniture: [{ id: 'desk-1', label: 'Desk', category: 'desk', width: 1.3, depth: .6, height: .75, x: 3.5, z: 1, rotation: 0, movable: true, dimensionProvenance: 'category', placementProvenance: 'estimated', evidencePhotoIds: ['photo-1'], identityExplanation: 'One desk seen in the east corner; no duplicate sightings.' }], observations: [{ kind: 'missing', message: 'Door swing is not visible.', evidencePhotoIds: ['photo-1'] }] });
const providerResponse = (estimate: unknown = fixture()) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(estimate) }] }] });
const image = () => new File([new Uint8Array(encode({ width: 2, height: 2, data: new Uint8Array(16).fill(255), channels: 4 }))], 'room.png', { type: 'image/png' });

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('mock photo provider integration', () => {
  it('converts valid structured output to an editable, provisional project with evidence', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(providerResponse());
    const project = await analyzePhotos(photos, { name: 'My study' }, {}, { env, fetcher });
    expect(project.source).toBe('photos'); expect(project.name).toBe('My study');
    expect(project.furniture[0]).toMatchObject({ id: 'desk-1', provenance: 'category', placementProvenance: 'estimated', evidencePhotoIds: ['photo-1'] });
    expect(project.room.confirmedWidth).toBe(false); expect(project.room.doors[0].confirmed).toBe(false);
    expect(project.original).toEqual(project.furniture); expect(project.original).not.toBe(project.furniture);
    expect(project.photos[0]).not.toHaveProperty('dataUrl'); expect(project.routes).toEqual([]);
    expect(project.observations?.[0].message).toContain('Door swing');
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.store).toBe(false); expect(body.model).toBe(env.OPENAI_MODEL);
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body.input[0].content.some((part: { type: string }) => part.type === 'input_image')).toBe(true);
  });
  it('marks only supplied room dimensions confirmed', async () => {
    const project = await analyzePhotos(photos, {}, { width: 6 }, { env, fetcher: vi.fn<typeof fetch>().mockResolvedValue(providerResponse()) });
    expect(project.room.width).toBe(6); expect(project.room.confirmedWidth).toBe(true); expect(project.room.confirmedDepth).toBe(false);
    expect(project.furniture[0].provenance).toBe('category'); expect(project.furniture[0].width).toBe(1.3);
    expect(project.furniture[0].x).toBeCloseTo(4.2);
  });
  it.each([{}, { ...fixture(), units: 'ft' }, { ...fixture(), room: { ...fixture().room, width: -1 } }])('rejects malformed structured output', async (value) => {
    await expect(analyzePhotos(photos, {}, {}, { env, fetcher: vi.fn<typeof fetch>().mockResolvedValue(providerResponse(value)) })).rejects.toMatchObject({ code: 'INVALID_PROVIDER_OUTPUT', retryable: true });
  });
  it('rejects duplicate stable identities and fabricated evidence photo IDs', async () => {
    const duplicate = fixture(); duplicate.furniture.push({ ...duplicate.furniture[0] });
    await expect(analyzePhotos(photos, {}, {}, { env, fetcher: vi.fn<typeof fetch>().mockResolvedValue(providerResponse(duplicate)) })).rejects.toMatchObject({ code: 'INCONSISTENT_PROVIDER_OUTPUT' });
    const fabricated = fixture(); fabricated.furniture[0].evidencePhotoIds = ['unseen-photo'];
    await expect(analyzePhotos(photos, {}, {}, { env, fetcher: vi.fn<typeof fetch>().mockResolvedValue(providerResponse(fabricated)) })).rejects.toMatchObject({ code: 'INCONSISTENT_PROVIDER_OUTPUT' });
  });
  it('preserves detections but flags unsupported boundaries', async () => {
    const estimate = { ...fixture(), shape: 'unsupported' };
    const project = await analyzePhotos(photos, {}, {}, { env, fetcher: vi.fn<typeof fetch>().mockResolvedValue(providerResponse(estimate)) });
    expect(project.furniture).toHaveLength(1); expect(project.observations?.[0].message).toContain('boundary');
    expect(project.room.confirmedWidth).toBe(false);
  });
  it('never silently activates a demo when credentials are absent', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(analyzePhotos(photos, {}, {}, { env: {}, fetcher })).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED', status: 503 });
    expect(fetcher).not.toHaveBeenCalled(); expect(photoConfiguration({}).configured).toBe(false);
  });
  it('sanitizes provider failure and offers recovery without echoing raw responses', async () => {
    await expect(analyzePhotos(photos, {}, {}, { env, fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive upstream details', { status: 500 })) })).rejects.toMatchObject({ code: 'PROVIDER_FAILURE', retryable: true, status: 502 });
    await expect(analyzePhotos(photos, {}, {}, { env, fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('mock-secret-key')) })).rejects.toMatchObject({ code: 'PROVIDER_UNREACHABLE', message: expect.not.stringContaining('mock-secret-key') });
  });
  it('rejects incomplete and refused responses instead of returning a partial scene', async () => {
    await expect(analyzePhotos(photos, {}, {}, { env, fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'incomplete', output: [] })) })).rejects.toMatchObject({ code: 'INCOMPLETE_ANALYSIS' });
    await expect(analyzePhotos(photos, {}, {}, { env, fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] })) })).rejects.toMatchObject({ code: 'ANALYSIS_REFUSED' });
  });
  it('distinguishes exhausted API quota from temporary rate limits without leaking upstream text',async()=>{
    const quota=Response.json({error:{code:'insufficient_quota',message:'private upstream account details'}},{status:429});
    await expect(analyzePhotos(photos,{},{},{env,fetcher:vi.fn<typeof fetch>().mockResolvedValue(quota)})).rejects.toMatchObject({code:'PROVIDER_QUOTA',retryable:false,message:expect.not.stringContaining('private upstream')});
    const rate=Response.json({error:{code:'rate_limit_exceeded'}},{status:429});
    await expect(analyzePhotos(photos,{},{},{env,fetcher:vi.fn<typeof fetch>().mockResolvedValue(rate)})).rejects.toMatchObject({code:'PROVIDER_RATE_LIMIT',retryable:true});
  });
  it('aborts timed-out requests and returns an actionable retry error', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const pending = analyzePhotos(photos, {}, {}, { env: { ...env, PHOTO_ANALYSIS_TIMEOUT_MS: '10000' }, fetcher });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', status: 504, retryable: true });
    await vi.advanceTimersByTimeAsync(10001); await assertion;
  });
});

describe('upload validation', () => {
  it('decodes a genuine PNG and preserves binary multipart bytes', async () => {
    const form = new FormData(); form.append('photos', image()); form.append('metadata', JSON.stringify({ photos: [{ id: 'my-photo' }] }));
    const parsed = await readAnalysisForm(new Request('https://clearpath.test/api/analyze', { method: 'POST', body: form }));
    const prepared = await preparePhotos(parsed.files, parsed.metadata);
    expect(prepared[0]).toMatchObject({ id: 'my-photo', mime: 'image/png', width: 2, height: 2 });
  });
  it('rejects wrong signatures, empty files and duplicate uploads', async () => {
    await expect(preparePhotos([new File(['not a png'], 'fake.png', { type: 'image/png' })], {})).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(preparePhotos([new File([], 'empty.png', { type: 'image/png' })], {})).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    await expect(preparePhotos([image(), image()], {})).rejects.toMatchObject({ code: 'DUPLICATE_PHOTO' });
  });
  it('rejects disallowed MIME and malformed metadata', async () => {
    await expect(preparePhotos([new File(['x'], 'photo.svg', { type: 'image/svg+xml' })], {})).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' });
    const form = new FormData(); form.append('photos', image()); form.append('measurements', '{invalid');
    await expect(readAnalysisForm(new Request('https://clearpath.test', { method: 'POST', body: form }))).rejects.toMatchObject({ code: 'INVALID_METADATA' });
  });
  it('rejects oversized content length before reading request bytes', async () => {
    await expect(readAnalysisForm(new Request('https://clearpath.test', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '50000000' }, body: 'x' }))).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 });
  });
  it('returns a sanitized 503 from API and configuration without credentials', async () => {
    vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('OPENAI_MODEL', '');
    const config = await GET().json(); expect(config).toMatchObject({ configured: false, provider: 'OpenAI' }); expect(config).not.toHaveProperty('model');
    const response = await POST(new Request('https://clearpath.test/api/analyze', { method: 'POST' }));
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ error: { code: 'PROVIDER_NOT_CONFIGURED' } });
  });
});


describe('Anthropic provider', () => {
  const claudeEnv = { PHOTO_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'mock-claude-secret', ANTHROPIC_MODEL: 'mock-claude-model' };
  const claudeResponse = (stop_reason = 'end_turn', value: unknown = fixture()) => Response.json({ stop_reason, content: [{ type: 'text', text: JSON.stringify(value) }] });
  it('selects only the configured provider and rejects unknown selections', () => {
    expect(photoConfiguration(claudeEnv)).toMatchObject({ configured: true, provider: 'Anthropic' });
    expect(photoConfiguration({ ...env, PHOTO_PROVIDER: 'anthropic' }).configured).toBe(false);
    expect(photoConfiguration({ ...env, PHOTO_PROVIDER: 'typo' }).configured).toBe(false);
  });
  it('uses Messages authentication, image blocks and structured room output', async () => {
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(claudeResponse());
    const project=await analyzePhotos(photos,{name:'Claude room'},{},{env:claudeEnv,fetcher});
    expect(project.name).toBe('Claude room');
    expect(project.furniture[0].id).toBe('desk-1');
    const [url,init]=fetcher.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.headers).toMatchObject({'x-api-key':'mock-claude-secret','anthropic-version':'2023-06-01'});
    expect(init?.headers).not.toHaveProperty('Authorization');
    const body=JSON.parse(String(init?.body));
    expect(body.model).toBe('mock-claude-model');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.messages[0].content).toContainEqual({type:'image',source:{type:'base64',media_type:'image/png',data:'mock'}});
    expect(body).not.toHaveProperty('store');
  });
  it('rejects truncated, refused and invalid room responses', async()=>{
    for(const [stop,code] of [['max_tokens','INCOMPLETE_ANALYSIS'],['refusal','ANALYSIS_REFUSED']]) {
      await expect(analyzePhotos(photos,{},{},{env:claudeEnv,fetcher:vi.fn<typeof fetch>().mockResolvedValue(claudeResponse(stop))})).rejects.toMatchObject({code});
    }
    await expect(analyzePhotos(photos,{},{},{env:claudeEnv,fetcher:vi.fn<typeof fetch>().mockResolvedValue(claudeResponse('end_turn',{}))})).rejects.toMatchObject({code:'INVALID_PROVIDER_OUTPUT'});
  });
  it('sanitizes billing, rate and authentication failures',async()=>{
    for(const [status,code] of [[402,'PROVIDER_QUOTA'],[429,'PROVIDER_RATE_LIMIT'],[401,'PROVIDER_CONFIGURATION']] as const) {
      await expect(analyzePhotos(photos,{},{},{env:claudeEnv,fetcher:vi.fn<typeof fetch>().mockResolvedValue(new Response('private billing information',{status}))})).rejects.toMatchObject({code,message:expect.not.stringContaining('private billing')});
    }
  });
});
