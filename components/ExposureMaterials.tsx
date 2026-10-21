'use client';
import {useEffect, useMemo} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {exposurePalette} from '../lib/daylight';
import type {Project} from '../lib/model';
import type {LightExposure} from '../lib/light-exposure';
const bindings=new WeakMap<THREE.Material,{texture:THREE.IUniform;room:THREE.IUniform;palette:THREE.IUniform;object:THREE.IUniform}>();

/** Paint the actual room surfaces, so furniture cannot hide a floor-only overlay. */
export default function ExposureMaterials({project,map}:{project:Project;map:LightExposure}){
 const scene=useThree(s=>s.scene),invalidate=useThree(s=>s.invalidate);
 const texture=useMemo(()=>{
  const cells=map.cells,cols=map.columns,rows=map.rows;
  const data=new Uint8Array(cells.length*4);
  cells.forEach((cell,i)=>{data.set([Math.round(cell.score*255),0,0,255],i*4);});
  const tex=new THREE.DataTexture(data,cols,rows);tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;tex.needsUpdate=true;return tex;
 },[map]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 useEffect(()=>{
  const restore:(()=>void)[]=[];const seen=new Set<THREE.Material>();
  scene.traverse(object=>{
   if(!(object instanceof THREE.Mesh)||!object.receiveShadow)return;
   for(const material of Array.isArray(object.material)?object.material:[object.material]){
    if(!(material instanceof THREE.MeshStandardMaterial)||seen.has(material)||material.opacity<1)continue;
    seen.add(material);let parent:THREE.Object3D|null=object,objectId:string|undefined;while(parent){if(parent.userData.exposureObjectId){objectId=parent.userData.exposureObjectId;break;}parent=parent.parent;}
    let binding=bindings.get(material);if(!binding){binding={texture:{value:texture},room:{value:new THREE.Vector3()},palette:{value:exposurePalette.map(color=>new THREE.Color(color))},object:{value:-1}};bindings.set(material,binding);}
    binding.texture.value=texture;binding.room.value.set(map.width,project.room.height,map.depth);binding.object.value=objectId?(map.objects[objectId]?.score??0):-1;
    const uniforms=binding;const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
    material.onBeforeCompile=function(shader,renderer){
     compile.call(this,shader,renderer);
     shader.uniforms.cpExposure=uniforms.texture;shader.uniforms.cpRoom=uniforms.room;shader.uniforms.cpPalette=uniforms.palette;shader.uniforms.cpObject=uniforms.object;
     shader.vertexShader='varying vec3 cpWorld;\n'+shader.vertexShader;
     shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\ncpWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
     shader.fragmentShader='varying vec3 cpWorld; uniform sampler2D cpExposure; uniform vec3 cpRoom; uniform vec3 cpPalette[5]; uniform float cpObject;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>',`if(cpWorld.x>=0.0 && cpWorld.z>=0.0 && cpWorld.x<=cpRoom.x && cpWorld.z<=cpRoom.z && cpWorld.y>=-0.08 && cpWorld.y<cpRoom.y-0.02){float cpScore=clamp(cpObject>=0.0?cpObject:texture2D(cpExposure,cpWorld.xz/cpRoom.xz).r,0.0,1.0)*4.0;vec3 cpColor=cpScore<1.0?mix(cpPalette[0],cpPalette[1],cpScore):cpScore<2.0?mix(cpPalette[1],cpPalette[2],cpScore-1.0):cpScore<3.0?mix(cpPalette[2],cpPalette[3],cpScore-2.0):mix(cpPalette[3],cpPalette[4],cpScore-3.0);gl_FragColor.rgb=cpColor;}\n#include <colorspace_fragment>`);
    };
    material.customProgramCacheKey=()=>key.call(material)+'-clearpath-exposure-v3';material.needsUpdate=true;
    restore.push(()=>{material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;});
   }
  });
  invalidate();
  return()=>{restore.forEach(fn=>fn());invalidate();};
 },[scene,project,texture,map,invalidate]);
 return null;
}
