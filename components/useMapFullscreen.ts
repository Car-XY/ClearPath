'use client';
import {useEffect,useRef,useState} from 'react';
export function useMapFullscreen(){
 const ref=useRef<HTMLElement>(null),[fullscreen,setFullscreen]=useState(false),[fallback,setFallback]=useState(false);
 useEffect(()=>{const changed=()=>setFullscreen(document.fullscreenElement===ref.current);document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
 useEffect(()=>{if(!fallback)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setFallback(false);setFullscreen(false);}};window.addEventListener('keydown',escape);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',escape);};},[fallback]);
 async function toggle(){
  if(fallback){setFallback(false);setFullscreen(false);return;}
  if(document.fullscreenElement===ref.current){await document.exitFullscreen();return;}
  try{if(!ref.current?.requestFullscreen)throw new Error('Use viewport mode');await ref.current.requestFullscreen();setFullscreen(true);}
  catch{setFallback(true);setFullscreen(true);}
 }
 return {ref,fullscreen,fallback,toggle};
}
