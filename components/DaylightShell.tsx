'use client';
import type {Room} from '../lib/model';
import * as THREE from 'three';
/** Physical shadow enclosure remains even when the planning view cuts walls/roof away. */
export default function DaylightShell({room,showRoof=false,shadows=true}:{room:Room;showRoof?:boolean;shadows?:boolean}){
 const blocker=(key:string,size:[number,number,number],position:[number,number,number])=><mesh key={key} position={position} castShadow><boxGeometry args={size}/><meshStandardMaterial colorWrite={false} depthWrite={false}/></mesh>;
 return <>{room.hasCeiling!==false&&<mesh position={[room.width/2,room.height+.045,room.depth/2]} castShadow={shadows} receiveShadow={showRoof}><boxGeometry args={[room.width+.18,.09,room.depth+.18]}/><meshStandardMaterial color="#eeeadd" side={THREE.DoubleSide} colorWrite={showRoof} depthWrite={showRoof}/></mesh>}{shadows&&(['north','east','south','west'] as const).flatMap(wall=>{
  const horizontal=wall==='north'||wall==='south',length=horizontal?room.width:room.depth;
  const openings=[...room.windows.filter(w=>w.wall===wall).map(w=>({start:w.position-w.width/2,end:w.position+w.width/2,bottom:w.sillHeight,top:Math.min(room.height,w.sillHeight+w.height)})),...room.doors.filter(d=>d.wall===wall).map(d=>({start:d.position-d.width/2,end:d.position+d.width/2,bottom:0,top:Math.min(2.1,room.height)}))];
  const cuts=[...new Set([0,length,...openings.flatMap(o=>[o.start,o.end])])].sort((a,b)=>a-b);
  return cuts.slice(0,-1).flatMap((a,i)=>{const b=cuts[i+1],mid=(a+b)/2,holes=openings.filter(o=>mid>=o.start&&mid<=o.end),ys=[...new Set([0,room.height,...holes.flatMap(o=>[o.bottom,o.top])])].sort((a,b)=>a-b);
   return ys.slice(0,-1).flatMap((bottom,j)=>{const top=ys[j+1];if(top-bottom<.001||holes.some(o=>(top+bottom)/2>o.bottom&&(top+bottom)/2<o.top))return [];
    return [blocker(`${wall}-${i}-${j}`,horizontal?[b-a,top-bottom,.08]:[.08,top-bottom,b-a],horizontal?[mid,(top+bottom)/2,wall==='north'?-.045:room.depth+.045]:[wall==='west'?-.045:room.width+.045,(top+bottom)/2,mid])];});
  });
 })}</>;
}
