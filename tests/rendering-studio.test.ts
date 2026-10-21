import {it,expect} from 'vitest';
import {createDemo,createManual} from '../lib/demo';
import {sunlightPatches,dailyExposure,sunAtHour} from '../lib/daylight';
import {validateProject} from '../lib/model';
import {suggestForTheme,ergonomicsPenalty} from '../lib/coach-suggestions';
it('keeps ceilings by default, persists an explicit open sky, and lights a windowless open-air floor',()=>{
 const p=createManual();expect(p.room.hasCeiling).toBeUndefined();expect(dailyExposure(p.room).every(c=>c.hours===0)).toBe(true);
 p.room.hasCeiling=false;expect(validateProject(p).room.hasCeiling).toBe(false);expect(sunlightPatches(p.room,13)[0].windowId).toBe('open-sky');expect(dailyExposure(p.room).some(c=>c.hours>0)).toBe(true);
});
it('rotates the arc toward south-facing windows instead of inventing exposure',()=>{
 const room=createDemo().room;room.windows[0].wall='south';expect(sunlightPatches(room,13)).toEqual([]);room.sunAzimuth=180;expect(sunlightPatches(room,13).length).toBeGreaterThan(0);expect(sunAtHour(13,180).direction.z).toBeGreaterThan(0);
});
it('themes remain placeholders until implemented and ergonomics can fix a backward chair without moving it',()=>{
 const p=createDemo();p.routes=[];p.furniture=p.furniture.filter(f=>['desk','desk-chair'].includes(f.id));p.furniture.find(f=>f.id==='desk-chair')!.rotation=Math.PI;
 expect(suggestForTheme(p,'patient-care')).toBeNull();expect(suggestForTheme(p,'game-room')).toBeNull();
 const suggestion=suggestForTheme(p,'ergonomics');expect(suggestion).not.toBeNull();expect(ergonomicsPenalty({...p,furniture:suggestion!.furniture})).toBeLessThan(ergonomicsPenalty(p));expect(suggestion!.reason).toContain('Ergonomics coach');
});
