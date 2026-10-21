import { describe, it, expect } from 'vitest';
import { expandRoomDraft } from '../lib/room-draft';
import { analyzePhotos, type PreparedPhoto } from '../lib/photo-provider';
const photos: PreparedPhoto[] = [{ id: 'view-1', name: 'room.jpg', mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,mock', width: 1600, height: 1200 }];
const draft = () => ({ shape: 'rectangular', size: [5, 4, 2.7], furniture: [{ label: 'Meeting table', category: 'table', size: [2.4, 1, .75], center: [2.5, 2], angle: 90, movable: true, photos: [1] }], openings: [{ kind: 'door', wall: 'south', position: .8, width: .9, photos: [1] }], notes: ['Room scale is estimated.'] });
describe('compact photo draft', () => {
  it('constructs consistent IDs, evidence and boundaries without generated bookkeeping', () => {
    const result = expandRoomDraft(draft(), photos);
    expect(result.furniture[0]).toMatchObject({ id: 'item-1', rotation: Math.PI / 2, evidencePhotoIds: ['view-1'], dimensionProvenance: 'estimated' });
    expect(result.room.boundary).toEqual([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }]);
    expect(result.doors[0].swing).toBe('unknown');
  });
  it('keeps the room and valid detections if one object is malformed', () => {
    const value = draft(); value.furniture.push({ ...value.furniture[0], size: [-1, 1, 1] });
    const result = expandRoomDraft(value, photos);
    expect(result.furniture).toHaveLength(1);
    expect(result.observations.some(o => o.message.includes('omitted'))).toBe(true);
  });
  it('fits estimated openings to the wall with an explicit review note', () => {
    const value = draft(); value.openings[0].position = 5;
    const result = expandRoomDraft(value, photos);
    expect(result.doors[0].position + result.doors[0].width / 2).toBe(5);
    expect(result.observations.some(o => o.message.includes('fitted'))).toBe(true);
  });
  it('never accepts fabricated photo evidence or an invalid room', () => {
    const value = draft(); value.furniture[0].photos = [2];
    expect(() => expandRoomDraft(value, photos)).toThrow('missing photo');
    expect(() => expandRoomDraft({ ...draft(), size: [-1, 4, 3] }, photos)).toThrow();
  });
  it.each(['openai', 'anthropic'])('builds an editable provisional room through %s', async provider => {
    let sent: Record<string, any> = {};
    const fetcher: typeof fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json(provider === 'anthropic'
        ? { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(draft()) }] }
        : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft()) }] }] });
    };
    const env = { PHOTO_PROVIDER: provider, OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'gpt-5.6-sol', ANTHROPIC_API_KEY: 'mock', ANTHROPIC_MODEL: 'mock' };
    const project = await analyzePhotos(photos, { name: 'My meeting room' }, { width: 6 }, { draft: true, env, fetcher });
    expect(project.source).toBe('photos'); expect(project.room.width).toBe(6); expect(project.room.confirmedDepth).toBe(false);
    expect(project.furniture[0].provenance).toBe('estimated'); expect(project.furniture[0].x).toBe(3);
    expect(JSON.stringify(sent)).toContain('Ignore reflections');
    if (provider === 'openai') { expect(sent.reasoning.effort).toBe('low'); expect(sent.text.format.schema.properties).not.toHaveProperty('room'); }
    else expect(sent.output_config.format.schema.properties).toHaveProperty('size');
  });
});

it('keeps openings valid when a user measurement shrinks the estimated wall',async()=>{
 const value=draft();value.openings[0].position=.45;value.openings[0].width=.9;
 const fetcher:typeof fetch=async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 const project=await analyzePhotos(photos,{}, {width:2}, {draft:true,env:{OPENAI_API_KEY:'mock',OPENAI_MODEL:'mock'},fetcher});
 expect(project.room.doors[0].position-project.room.doors[0].width/2).toBeGreaterThanOrEqual(0);
 expect(project.observations?.some(o=>o.message.includes('measured wall'))).toBe(true);
 expect(project.measurements?.find(m=>m.targetId===project.room.doors[0].id&&m.dimension==='position')?.value).toBe(project.room.doors[0].position);
});
it('passes the capture height to Claude and stores it separately from inferred ceiling height',async()=>{
 let sent='';const fetcher:typeof fetch=async(_url,init)=>{sent=String(init?.body);return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(draft())}]});};
 const project=await analyzePhotos(photos,{}, {cameraHeight:1.72,cameraHeightSource:'provided'}, {draft:true,env:{PHOTO_PROVIDER:'anthropic',ANTHROPIC_API_KEY:'mock',ANTHROPIC_MODEL:'mock'},fetcher});
 expect(sent).toContain('cameraHeight');expect(sent).toContain('1.72');expect(project.room.captureCameraHeight).toBe(1.72);expect(project.room.cameraHeightSource).toBe('provided');expect(project.room.height).toBe(2.7);expect(project.measurements?.find(m=>m.targetId==='capture-camera')?.value).toBe(1.72);expect(project.furniture[0].provenance).toBe('estimated');
});
