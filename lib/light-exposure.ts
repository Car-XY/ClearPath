import type {Furniture,Project,Room} from './model';
import {resolveAnchors,elevation} from './anchors';
import {sunAtHour,wallFade,type DaylightSettings} from './daylight';
type Vector={x:number;y:number;z:number};
export type ExposureCell={x:number;z:number;width:number;depth:number;score:number;hours:number};
export type LightExposure={cells:ExposureCell[];objects:Record<string,{score:number;hours:number}>;columns:number;rows:number;width:number;depth:number;period:'instant'|'day';hour:number};
type Occluder={id:string;x:number;z:number;bottom:number;top:number;halfWidth:number;halfDepth:number;c:number;s:number};
const clampHour=(hour:number)=>Math.max(6,Math.min(20,Number.isFinite(hour)?hour:12));
/** Include physical lighting inputs only. Roof visibility, labels and routes do not alter exposure. */
export function exposureSignature(project:Project,settings:DaylightSettings){
 const room=project.room;
 return JSON.stringify([room.width,room.height,room.depth,room.hasCeiling!==false,room.sunAzimuth??0,room.windows.map(w=>[w.wall,w.position,w.width,w.height,w.sillHeight]),[...project.furniture,...room.fixedObstacles].map(f=>[f.id,f.x,f.z,f.width,f.depth,f.height,f.rotation,elevation(f),f.anchor]),settings.exposurePeriod??'instant',settings.exposurePeriod==='day'?20:clampHour(settings.hour)]);
}
function bounds(item:Furniture):Occluder{return {id:item.id,x:item.x,z:item.z,bottom:elevation(item),top:elevation(item)+item.height,halfWidth:item.width/2,halfDepth:item.depth/2,c:Math.cos(item.rotation),s:Math.sin(item.rotation)};}
/** Ray/rotated-box intersection, clipped at the room opening. */
function intersects(origin:Vector,direction:Vector,box:Occluder,limit:number){
 const x=origin.x-box.x,z=origin.z-box.z;
 const origins=[x*box.c+z*box.s,origin.y,-x*box.s+z*box.c],directions=[direction.x*box.c+direction.z*box.s,direction.y,-direction.x*box.s+direction.z*box.c];
 const low=[-box.halfWidth,box.bottom,-box.halfDepth],high=[box.halfWidth,box.top,box.halfDepth];let near=.002,far=limit;
 for(let axis=0;axis<3;axis++){
  if(Math.abs(directions[axis])<1e-9){if(origins[axis]<low[axis]||origins[axis]>high[axis])return false;continue;}
  let a=(low[axis]-origins[axis])/directions[axis],b=(high[axis]-origins[axis])/directions[axis];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;
 }
 return far>=near;
}
function incoming(room:Room,origin:Vector,d:Vector){
 if(origin.x<0||origin.z<0||origin.x>room.width||origin.z>room.depth||origin.y>=room.height)return 0;
 let exit=(room.height-origin.y)/d.y,wall:'north'|'south'|'east'|'west'|null=null;
 for(const [axis,bound,side] of [['x',0,'west'],['x',room.width,'east'],['z',0,'north'],['z',room.depth,'south']] as const){
  if((bound===0&&d[axis]>=0)||(bound!==0&&d[axis]<=0))continue;
  const t=(bound-origin[axis])/d[axis];if(t>=0&&t<exit){exit=t;wall=side;}
 }
 if(wall===null)return room.hasCeiling===false?exit:0;
 const along=(wall==='north'||wall==='south')?origin.x+d.x*exit:origin.z+d.z*exit,height=origin.y+d.y*exit;
 return room.windows.some(w=>w.wall===wall&&Math.abs(along-w.position)<=w.width/2+.00001&&height>=w.sillHeight&&height<=Math.min(room.height,w.sillHeight+w.height))?exit:0;
}
/** Bounded illustrative direct light. Furniture uses opaque rotated box bounds. */
export function computeLightExposure(input:Project,settings:DaylightSettings):LightExposure{
 const project=resolveAnchors(input),room=project.room,period=settings.exposurePeriod??'instant',hour=clampHour(settings.hour);
 const step=Math.max(.3,Math.max(room.width,room.depth)/36),columns=Math.ceil(room.width/step),rows=Math.ceil(room.depth/step);
 const objects=[...project.furniture,...room.fixedObstacles],occluders=objects.map(bounds);
 const samples=(period==='day'?Array.from({length:28},(_,i)=>6.25+i*.5):[hour]).map(time=>{const sun=sunAtHour(time,room.sunAzimuth);return {d:sun.direction,strength:sun.intensity/2.58*sun.direction.y,weight:period==='day'?.5:1};});
 const sample=(origin:Vector,ignoreId?:string)=>samples.reduce((sum,sun)=>{const exit=incoming(room,origin,sun.d);return sum+(exit>0&&!occluders.some(box=>box.id!==ignoreId&&intersects(origin,sun.d,box,exit-.002))?sun.strength*sun.weight:0);},0);
 const cells:ExposureCell[]=[];
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const width=Math.min(step,room.width-col*step),depth=Math.min(step,room.depth-row*step),x=col*step+width/2,z=row*step+depth/2,hours=sample({x,y:.015,z})*wallFade(room,{x,z});cells.push({x,z,width,depth,hours,score:0});
 }
 const objectValues=objects.map(item=>({id:item.id,hours:sample({x:item.x,y:elevation(item)+item.height+.005,z:item.z},item.id)}));
 // Instant colors use a fixed irradiance scale; daily colors compare the current scene's total exposure.
 const denominator=period==='day'?Math.max(.001,...cells.map(c=>c.hours),...objectValues.map(o=>o.hours)):1;
 return {cells:cells.map(c=>({...c,score:Math.min(1,c.hours/denominator)})),objects:Object.fromEntries(objectValues.map(o=>[o.id,{hours:o.hours,score:Math.min(1,o.hours/denominator)}])),columns,rows,width:room.width,depth:room.depth,period,hour};
}
