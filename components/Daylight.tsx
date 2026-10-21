'use client';
import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { Room } from '../lib/model';
import { sunlightPatches, sunAtHour, wallFade, type DaylightSettings } from '../lib/daylight';
function Patch({room,polygon,strength,color}:{room:Room;polygon:{x:number;z:number}[];strength:number;color:string}){
 const geometry=useMemo(()=>{
  const geometry=new THREE.BufferGeometry(),center={x:polygon.reduce((n,p)=>n+p.x,0)/polygon.length,z:polygon.reduce((n,p)=>n+p.z,0)/polygon.length},vertices:number[]=[],colors:number[]=[];
  const tint=new THREE.Color(color);for(let i=0;i<polygon.length;i++)for(const point of [center,polygon[i],polygon[(i+1)%polygon.length]]){vertices.push(point.x,.028,point.z);const fade=wallFade(room,point);colors.push(tint.r*fade,tint.g*fade,tint.b*fade);}
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;
 },[room,polygon,color]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} renderOrder={2}><meshBasicMaterial vertexColors transparent opacity={strength*.72} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} toneMapped={false}/></mesh>;
}
export default function Daylight({room,settings}:{room:Room;settings:DaylightSettings}){
 const sun=sunAtHour(settings.hour,room.sunAzimuth),patches=useMemo(()=>sunlightPatches(room,settings.hour),[room,settings.hour]);
 const target=useMemo(()=>{const object=new THREE.Object3D();object.position.set(room.width/2,0,room.depth/2);return object;},[room.width,room.depth]);
 if(!settings.enabled)return null;
 const radius=Math.max(room.width,room.depth)*2;
 return <><primitive object={target}/><directionalLight position={[room.width/2+sun.direction.x*radius,sun.direction.y*radius,room.depth/2+sun.direction.z*radius]} target={target} color={sun.color} intensity={sun.intensity} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-room.width} shadow-camera-right={room.width} shadow-camera-top={room.depth} shadow-camera-bottom={-room.depth} shadow-camera-far={radius*4} shadow-bias={-.0002}/>{!settings.heatmap&&patches.map(p=><Patch key={p.windowId} room={room} polygon={p.polygon} strength={p.strength} color={sun.color}/>)}</>;
}
