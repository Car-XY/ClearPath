import {describe,it,expect} from 'vitest';
import {createManual} from '../lib/demo';
import {analyze,planFloorRoute,isSegmentNavigable,distance} from '../lib/geometry';
import {validateProject,type Furniture} from '../lib/model';
import {exportProject,importProject} from '../lib/persistence';
import {exposureColor,exposurePalette} from '../lib/daylight';
const box:Furniture={id:'block',label:'Island',category:'cabinet',x:3,z:3,width:1.4,depth:2.2,height:1,color:'#998877',rotation:Math.PI/12,movable:true,locked:false,provenance:'confirmed',evidencePhotoIds:[]};
function room(){const p=createManual(6,6);p.profile={width:.4,margin:.05,uncertainty:0,turningDiameter:null,units:'m'};p.routes=[];return p;}
describe('ordered floor routes',()=>{
 it('takes a direct shortest connection in an empty room',()=>{const p=room(),a={x:1,z:1},b={x:5,z:5},r=planFloorRoute(p,[a,b])!;expect(r.available).toBe(true);expect(r.path).toEqual([a,b]);expect(r.length).toBeCloseTo(Math.round(distance(a,b)*20)/20);});
 it('avoids rotated furniture and visits every clicked stop in order without shortcutting it',()=>{const p=room();p.furniture=[box];const stops=[{x:1,z:3},{x:5,z:3},{x:5,z:5}],r=planFloorRoute(p,stops)!;expect(r.available).toBe(true);expect(r.path.length).toBeGreaterThan(3);let last=-1;for(const stop of stops){const i=r.path.findIndex(point=>distance(point,stop)<.00001);expect(i).toBeGreaterThan(last);last=i;}for(let i=1;i<r.path.length;i++)expect(isSegmentNavigable(p,r.path[i-1],r.path[i])).toBe(true);expect(r.length).toBeGreaterThan(6);});
 it('rejects a stop inside furniture and cannot connect through a full partition',()=>{const p=room();p.furniture=[box];expect(planFloorRoute(p,[{x:1,z:1},{x:3,z:3},{x:5,z:5}])!.available).toBe(false);p.furniture=[{...box,width:.5,depth:6,rotation:0}];expect(planFloorRoute(p,[{x:1,z:3},{x:5,z:3}])!.path).toEqual([]);});
 it('recalculates the whole ordered route when a stop is blocked, and persists floor-only points',()=>{const p=room();p.routes=[{id:'drawn',name:'Via stop',required:true,start:{x:1,z:1},waypoints:[{x:3,z:3}],destination:{x:5,z:5}}];expect(analyze(p).routes[0].available).toBe(true);const restored=importProject(exportProject(p));expect(restored.routes).toEqual(p.routes);p.furniture=[box];const r=analyze(p).routes[0];expect(r.available).toBe(false);expect(r.reason).toContain('Stop 2');expect(r.path).toEqual([]);expect(validateProject(p).routes[0].waypoints).toEqual([{x:3,z:3}]);});
 it('bounds waypoints and works with legacy routes that have none',()=>{const p=room();p.routes=[{id:'old',name:'Old route',required:false,destination:{x:1,z:1}}];expect(()=>validateProject(p)).not.toThrow();p.routes[0].waypoints=Array.from({length:19},()=>({x:2,z:2}));expect(()=>validateProject(p)).toThrow();expect(planFloorRoute(p,[])).toBeNull();});
});
it('uses all five distinct heatmap colors at the declared stops',()=>{exposurePalette.forEach((color,i)=>expect(exposureColor(i/4)).toBe(color));expect(exposureColor(-1)).toBe(exposurePalette[0]);expect(exposureColor(3)).toBe(exposurePalette[4]);});
