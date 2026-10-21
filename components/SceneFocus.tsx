'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Project, Furniture } from '../lib/model';
import { elevation } from '../lib/anchors';
export type FocusRequest={ids:string[];token:number};
export function CameraFocus({project,request}:{project:Project;request?:FocusRequest}){
 const {camera,controls,invalidate}=useThree();const goal=useRef<{target:THREE.Vector3;position:THREE.Vector3}|null>(null);
 useEffect(()=>{
  const orbit=controls as unknown as {target:THREE.Vector3;update():void}|undefined;if(!orbit?.target||!request)return;
  const items=project.furniture.filter(f=>request.ids.includes(f.id));if(!items.length)return;
  const bounds=new THREE.Box3();for(const item of items){const radius=Math.hypot(item.width,item.depth)/2;bounds.expandByPoint(new THREE.Vector3(item.x-radius,elevation(item),item.z-radius));bounds.expandByPoint(new THREE.Vector3(item.x+radius,elevation(item)+item.height,item.z+radius));}
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),distance=Math.max(3,Math.hypot(size.x,size.z,size.y)*1.45),direction=new THREE.Vector3(1,1.15,1.3).normalize();
  goal.current={target:center,position:center.clone().addScaledVector(direction,Math.min(16,distance))};invalidate();
 },[request?.token,controls]);
 useFrame((_,dt)=>{const next=goal.current,orbit=controls as unknown as {target:THREE.Vector3;update():void}|undefined;if(!next||!orbit?.target)return;const alpha=1-Math.exp(-Math.min(dt,.05)*8);camera.position.lerp(next.position,alpha);orbit.target.lerp(next.target,alpha);orbit.update();if(camera.position.distanceTo(next.position)<.01){goal.current=null;}else invalidate();});
 return null;
}
export function FocusPulse({item,token}:{item:Furniture;token:number}){
 const material=useRef<THREE.MeshBasicMaterial>(null),start=useRef<number|null>(null);const {invalidate}=useThree();useEffect(()=>{start.current=null;invalidate();},[token]);
 useFrame(({clock})=>{if(start.current===null)start.current=clock.elapsedTime;const elapsed=clock.elapsedTime-start.current;if(material.current)material.current.opacity=elapsed>2.8?0:.2+.6*(.5+.5*Math.sin(elapsed*12));if(elapsed<2.8)invalidate();});
 return <mesh position={[item.x,elevation(item)+item.height/2,item.z]} rotation={[0,-item.rotation,0]}><boxGeometry args={[item.width+.08,item.height+.08,item.depth+.08]}/><meshBasicMaterial ref={material} color="#e5a938" wireframe transparent depthTest={false} toneMapped={false}/></mesh>;
}
