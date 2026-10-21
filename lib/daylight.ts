import type { Point, Room } from './model';
export type DaylightSettings = {enabled:boolean;hour:number;heatmap:boolean;showRoof?:boolean;exposurePeriod?:'instant'|'day'};
export type SunPatch = {windowId:string;polygon:Point[];strength:number};
export const defaultDaylight:DaylightSettings={enabled:false,hour:12,heatmap:false};
export const exposurePalette=['#2447d5','#12bee3','#4cd85e','#ffe13d','#ed4329'] as const;
export function exposureColor(score:number){
 const scaled=Math.max(0,Math.min(1,score))*4,index=Math.min(3,Math.floor(scaled)),t=scaled-index;
 const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));const a=rgb(exposurePalette[index]),b=rgb(exposurePalette[index+1]);
 return '#'+a.map((n,i)=>Math.round(n+(b[i]-n)*t).toString(16).padStart(2,'0')).join('');
}
/** Illustrative east-to-west arc facing the north wall, independent of location/date. */
export function sunAtHour(hour:number,azimuth=0){
 const t=(Math.max(6,Math.min(20,Number.isFinite(hour)?hour:12))-6)/14,angle=t*Math.PI;
 const vector={x:Math.cos(angle),y:.09+Math.sin(angle)*.95,z:-.65};const length=Math.hypot(vector.x,vector.y,vector.z);
 const rotation=azimuth*Math.PI/180,x=vector.x,z=vector.z;vector.x=x*Math.cos(rotation)-z*Math.sin(rotation);vector.z=x*Math.sin(rotation)+z*Math.cos(rotation);
 const warmth=Math.pow(Math.abs(t-.5)*2,1.3);
 return {direction:{x:vector.x/length,y:vector.y/length,z:vector.z/length},intensity:.08+Math.sin(angle)*2.5,color:`rgb(255, ${Math.round(250-warmth*83)}, ${Math.round(231-warmth*124)})`,warmth};
}
function clip(points:Point[],axis:'x'|'z',bound:number,keepAbove:boolean):Point[]{
 const out:Point[]=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],insideA=keepAbove?a[axis]>=bound:a[axis]<=bound,insideB=keepAbove?b[axis]>=bound:b[axis]<=bound;if(insideA)out.push(a);if(insideA!==insideB){const t=(bound-a[axis])/(b[axis]-a[axis]);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}}return out;
}
export function sunlightPatches(room:Room,hour:number):SunPatch[]{
 const sun=sunAtHour(hour,room.sunAzimuth),d=sun.direction;
 if(room.hasCeiling===false)return [{windowId:'open-sky',polygon:[{x:0,z:0},{x:room.width,z:0},{x:room.width,z:room.depth},{x:0,z:room.depth}],strength:sun.intensity/2.58}];
 return room.windows.flatMap(win=>{
  const outward=win.wall==='north'?{x:0,z:-1}:win.wall==='south'?{x:0,z:1}:win.wall==='east'?{x:1,z:0}:{x:-1,z:0};
  const facing=d.x*outward.x+d.z*outward.z;if(facing<=.01)return [];
  const horizontal=win.wall==='north'||win.wall==='south';
  const point=(along:number,height:number):Point=>({x:(horizontal?along:win.wall==='west'?0:room.width)-d.x/d.y*height,z:(horizontal?win.wall==='north'?0:room.depth:along)-d.z/d.y*height});
  const low=Math.max(0,win.sillHeight),high=Math.min(room.height,win.sillHeight+win.height);
  let polygon=[point(win.position-win.width/2,low),point(win.position+win.width/2,low),point(win.position+win.width/2,high),point(win.position-win.width/2,high)];
  for(const [axis,bound,above]of [['x',0,true],['x',room.width,false],['z',0,true],['z',room.depth,false]] as const)polygon=clip(polygon,axis,bound,above);
  const area=Math.abs(polygon.reduce((sum,p,i)=>{const n=polygon[(i+1)%polygon.length];return sum+p.x*n.z-n.x*p.z;},0))/2;
  return polygon.length>=3&&area>.001?[{windowId:win.id,polygon,strength:Math.min(1,sun.intensity/2.58*facing)}]:[];
 });
}
export function pointInPatch(point:Point,polygon:Point[]){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
export function wallFade(room:Room,point:Point){return Math.max(0,Math.min(1,Math.min(point.x,point.z,room.width-point.x,room.depth-point.z)/.3));}
/** At most 36×36 cells, sampled every 30 minutes. No furniture/weather occlusion model. */
export function dailyExposure(room:Room){
 const step=Math.max(.3,Math.max(room.width,room.depth)/36),columns=Math.ceil(room.width/step),rows=Math.ceil(room.depth/step);
 const samples=Array.from({length:29},(_,i)=>sunlightPatches(room,6+i*.5));
 const cells:{x:number;z:number;width:number;depth:number;score:number;hours:number}[]=[];
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const width=Math.min(step,room.width-col*step),depth=Math.min(step,room.depth-row*step),x=col*step+width/2,z=row*step+depth/2;
  const hours=samples.reduce((sum,patches)=>sum+Math.min(1,patches.reduce((n,p)=>n+(pointInPatch({x,z},p.polygon)?p.strength:0),0))*.5,0)*wallFade(room,{x,z});
  cells.push({x,z,width,depth,score:hours/14,hours});
 }
 const max=Math.max(.001,...cells.map(c=>c.hours));return cells.map(c=>({...c,score:c.hours/max}));
}
export function formatSunTime(hour:number){const minutes=Math.round(hour*60);return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
