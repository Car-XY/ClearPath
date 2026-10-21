import {it,expect} from 'vitest';
import {createManual} from '../lib/demo';
import {computeLightExposure,exposureSignature} from '../lib/light-exposure';
import {defaultDaylight} from '../lib/daylight';
import type {Furniture} from '../lib/model';
const settings={...defaultDaylight,enabled:true,heatmap:true,hour:13};
function scene(){const p=createManual(5,5);p.room.height=3;p.room.windows=[{id:'window',wall:'north',position:2.5,width:4.8,sillHeight:.1,height:2.7}];p.furniture=[];p.room.fixedObstacles=[];return p;}
const cabinet:Furniture={id:'cabinet',label:'Cabinet',category:'cabinet',x:2.5,z:.9,width:1.3,depth:.4,height:1.1,rotation:0,color:'#998877',movable:true,locked:false,provenance:'confirmed',evidencePhotoIds:[]};
it('changes actual exposure with selected time and sun rotation, and bounds the cell count',()=>{
 const p=scene(),noon=computeLightExposure(p,settings),dawn=computeLightExposure(p,{...settings,hour:6});expect(noon.cells.some(c=>c.score>.5)).toBe(true);expect(noon.cells).not.toEqual(dawn.cells);p.room.sunAzimuth=180;expect(computeLightExposure(p,settings).cells.every(c=>c.score===0)).toBe(true);expect(computeLightExposure(createManual(25,25),settings).cells.length).toBeLessThanOrEqual(1296);
});
it('responds to physical ceiling removal but ignores the editing visibility toggle',()=>{
 const p=scene();p.room.windows=[];expect(computeLightExposure(p,settings).cells.every(c=>c.score===0)).toBe(true);expect(exposureSignature(p,settings)).toBe(exposureSignature(p,{...settings,showRoof:true}));p.room.hasCeiling=false;expect(computeLightExposure(p,settings).cells.some(c=>c.score>.5)).toBe(true);
});
it('casts furniture shadows and recomputes when objects move, rotate, rise or disappear',()=>{
 const p=scene(),clear=computeLightExposure(p,settings);p.furniture=[{...cabinet}];const shadow=computeLightExposure(p,settings);expect(shadow.cells.some((c,i)=>c.score<clear.cells[i].score)).toBe(true);expect(shadow.objects.cabinet.score).toBeGreaterThan(0);
 p.furniture[0].x=1;expect(computeLightExposure(p,settings).cells).not.toEqual(shadow.cells);p.furniture[0].x=2.5;p.furniture[0].rotation=Math.PI/2;expect(computeLightExposure(p,settings).cells).not.toEqual(shadow.cells);p.furniture[0].rotation=0;p.furniture[0].elevation=1;expect(computeLightExposure(p,settings).cells).not.toEqual(shadow.cells);p.furniture=[];expect(computeLightExposure(p,settings).cells).toEqual(clear.cells);
});
it('whole-day totals ignore the display clock while updating for scene changes',()=>{
 const p=scene(),day={...settings,exposurePeriod:'day' as const};expect(exposureSignature(p,{...day,hour:6})).toBe(exposureSignature(p,{...day,hour:20}));expect(computeLightExposure(p,{...day,hour:6}).cells).toEqual(computeLightExposure(p,{...day,hour:20}).cells);const before=computeLightExposure(p,day);p.furniture=[cabinet];expect(computeLightExposure(p,day).cells).not.toEqual(before.cells);
});
it('invalidates physical changes and skips labels, colors, routes and roof visibility',()=>{
 const p=scene();p.furniture=[{...cabinet}];const before=exposureSignature(p,settings);p.furniture[0].label='Renamed';p.furniture[0].color='#112233';p.routes=[];expect(exposureSignature(p,{...settings,showRoof:true})).toBe(before);p.furniture[0].width+=.2;expect(exposureSignature(p,settings)).not.toBe(before);p.furniture[0].width-=.2;p.room.sunAzimuth=90;expect(exposureSignature(p,settings)).not.toBe(before);
});
