'use client';
import {useEffect,useState} from 'react';
import type {Project} from '../lib/model';
import type {DaylightSettings} from '../lib/daylight';
import {computeLightExposure,exposureSignature,type LightExposure} from '../lib/light-exposure';
export type HeatmapState={key:string;map?:LightExposure;pending:boolean;revision:number};
export function useLightExposure(project:Project,settings:DaylightSettings,shared?:HeatmapState):HeatmapState{
 const enabled=settings.enabled&&settings.heatmap,key=exposureSignature(project,settings),useShared=shared?.key===key;
 const [snapshot,setSnapshot]=useState<{key:string;map:LightExposure;revision:number}>();
 useEffect(()=>{
  if(!enabled||useShared||snapshot?.key===key)return;
  const timer=window.setTimeout(()=>{const map=computeLightExposure(project,settings);setSnapshot(previous=>({key,map,revision:(previous?.revision??0)+1}));},100);
  return()=>window.clearTimeout(timer);
 // The signature intentionally excludes changes that do not affect lighting.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[enabled,key,useShared]);
 if(useShared)return shared.pending&&snapshot?.key===key?{...shared,map:snapshot.map}:shared;
 return {key,map:enabled?(snapshot?.map??shared?.map):undefined,pending:enabled&&snapshot?.key!==key,revision:snapshot?.revision??0};
}
