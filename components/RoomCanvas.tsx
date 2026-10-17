"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { Analysis, Furniture, Point, Project } from "@/lib/model";
import { analyze, doorSegment, doorSwingPolygon, entranceAnchor, footprint, isPointNavigable, placementIssues, resolveDestination } from "@/lib/geometry";
import TopDown, { type RoomViewProps } from "./TopDown";

const palette = {green:"#438b72",amber:"#bf8d3f",red:"#cc7368"};
type Triple = [number, number, number];
const plane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
const rounded = (n:number) => Math.round(n*20)/20;

/** A normal Three sprite avoids a separate React DOM root inside the canvas. */
function SceneLabel({text,position,color="#46614b",height=.2,plain=false}:{text:string;position:Triple;color?:string;height?:number;plain?:boolean}) {
  const label=useMemo(()=>{
    const canvas=document.createElement("canvas");
    const context=canvas.getContext("2d");
    if(!context)return null;
    context.font="600 28px system-ui, sans-serif";
    const width=Math.ceil(context.measureText(text).width+42);
    canvas.width=width;canvas.height=68;
    context.font="600 28px system-ui, sans-serif";
    context.textBaseline="middle";context.textAlign="center";
    if(!plain){
      context.fillStyle="#fffdf5";context.strokeStyle="#d7e0cf";context.lineWidth=2;
      context.beginPath();context.roundRect(1,1,width-2,66,14);context.fill();context.stroke();
    }
    context.fillStyle=color;context.fillText(text,width/2,35);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
    return {texture,aspect:width/68};
  },[text,color,plain]);
  useEffect(()=>{if(!label)return;label.texture.needsUpdate=true;return()=>label.texture.dispose();},[label]);
  if(!label)return null;
  return <sprite position={position} scale={[height*label.aspect,height,1]} renderOrder={20}><spriteMaterial map={label.texture} transparent depthTest={false} depthWrite={false} toneMapped={false}/></sprite>;
}

function Block({size,position=[0,0,0],color,round=.015,opacity=1}:{size:Triple;position?:Triple;color:string;round?:number;opacity?:number}) {
  return round > 0 ? <RoundedBox args={size} position={position} radius={Math.min(round,...size.map(n=>n/3))} smoothness={2} bevelSegments={2} castShadow receiveShadow><meshStandardMaterial color={color} roughness={.83} transparent={opacity<1} opacity={opacity}/></RoundedBox> : <mesh position={position} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.85} transparent={opacity<1} opacity={opacity}/></mesh>;
}

function Legs({w,d,h=.2,color="#795f43",inset=.1}:{w:number;d:number;h?:number;color?:string;inset?:number}) {
  return <>{[-1,1].flatMap(x=>[-1,1].map(z=><Block key={`${x}${z}`} size={[.045,h,.045]} position={[x*(w/2-inset),h/2,z*(d/2-inset)]} color={color} round={.006}/>))}</>;
}

function Sofa({item}:{item:Furniture}) {
  const vertical=item.depth>item.width;
  const w=vertical?item.depth:item.width,d=vertical?item.width:item.depth,h=item.height;
  const color=item.color;
  return <group rotation={[0,vertical?Math.PI/2:0,0]}>
    <Legs w={w} d={d} h={h*.17}/>
    <Block size={[w,h*.28,d]} position={[0,h*.28,0]} color={color} round={.07}/>
    <Block size={[w,h*.57,d*.2]} position={[0,h*.7,-d*.39]} color={color} round={.07}/>
    {[-1,1].map(side=><Block key={side} size={[w*.11,h*.52,d*.91]} position={[side*w*.445,h*.52,0]} color={color} round={.055}/>)}
    {[-1,1].map(side=><Block key={`seat${side}`} size={[w*.365,h*.145,d*.66]} position={[side*w*.19,h*.49,d*.06]} color="#bdc5ae" round={.055}/>)}
    <group position={[-w*.31,h*.72,-d*.14]} rotation={[.15,.1,.3]}><Block size={[w*.16,h*.3,.1]} color="#d9cba8" round={.04}/></group>
    <group position={[w*.31,h*.72,-d*.14]} rotation={[.15,-.1,-.25]}><Block size={[w*.15,h*.28,.1]} color="#e2ddd0" round={.04}/></group>
  </group>;
}

/** All procedural meshes sit within the footprint used by the geometry engine. */
function FurnitureModel({item,ghost=false}:{item:Furniture;ghost?:boolean}) {
  const {width:w,depth:d,height:h}=item;
  const category=item.category.toLowerCase();
  const color=item.color||"#b8bca6";
  if(ghost) return <mesh position={[0,h/2,0]}><boxGeometry args={[w,h,d]}/><meshBasicMaterial color="#5b9681" wireframe transparent opacity={.25}/></mesh>;
  if(category.includes("sofa")) return <Sofa item={item}/>;
  if(category.includes("bed")) return <>
    <Block size={[w,h*.25,d]} position={[0,h*.2,0]} color="#ad9272" round={.035}/>
    <Block size={[w*.97,h*.28,d*.97]} position={[0,h*.46,0]} color="#f0eadd" round={.065}/>
    <Block size={[w,h*.85,d*.07]} position={[0,h*.49,-d*.465]} color={color} round={.03}/>
    <Block size={[w*.985,h*.08,d*.65]} position={[0,h*.635,d*.155]} color={color} round={.028}/>
    {[-1,1].map(side=><Block key={side} size={[w*.4,h*.14,d*.19]} position={[side*w*.23,h*.65,-d*.29]} color="#fff9ec" round={.06}/>)}
  </>;
  if(category.includes("chair")) return <>
    <Legs w={w} d={d} h={h*.46} inset={Math.min(.08,w*.13)}/>
    <Block size={[w,h*.12,d*.94]} position={[0,h*.48,0]} color={color} round={.045}/>
    <Block size={[w*.94,h*.47,d*.13]} position={[0,h*.76,-d*.41]} color={color} round={.045}/>
  </>;
  if(category.includes("shelf")||category.includes("bookcase")) return <>
    <Block size={[w,.055,d]} position={[0,.05,0]} color={color}/>
    {[-1,1].map(side=><Block key={side} size={[.055,h,d]} position={[side*(w/2-.0275),h/2,0]} color={color}/>)}
    <Block size={[w,h,.035]} position={[0,h/2,-d/2+.018]} color="#b9b49b"/>
    {[1,2,3,4].map(level=><group key={level}><Block size={[w,.04,d]} position={[0,h*level/4-.02,0]} color={color}/>{level<4&&[0,1,2,3,4].map(book=><Block key={book} size={[w*.065,h*.18,d*.57]} position={[-w*.32+book*w*.08,h*level/4+h*.095,-d*.05]} color={["#8c9e83","#c3ac8b","#e1d5bb","#a87762","#8a9391"][book]} round={.003}/>)}</group>)}
  </>;
  if(category.includes("cabinet")||category.includes("dresser")||category.includes("wardrobe")) return <>
    <Legs w={w} d={d} h={.1}/>
    <Block size={[w,h-.1,d]} position={[0,(h+.1)/2,0]} color={color} round={.02}/>
    {[-1,1].map(side=><group key={side}><Block size={[w*.48,h*.88,.025]} position={[side*w*.248,h*.52,d/2+.002]} color={color} round={.01}/><Block size={[.025,.12,.022]} position={[side*.06,h*.52,d/2+.02]} color="#84704e" round={.007}/></group>)}
  </>;
  if(category.includes("plant")) return <>
    <mesh position={[0,h*.2,0]} castShadow><cylinderGeometry args={[w*.3,w*.23,h*.4,16]}/><meshStandardMaterial color="#b78969" roughness={.9}/></mesh>
    <mesh position={[0,h*.5,0]} castShadow><cylinderGeometry args={[.012,.02,h*.5,7]}/><meshStandardMaterial color="#6e7651"/></mesh>
    {[0,1,2,3,4].map(i=><mesh key={i} position={[Math.sin(i*2.4)*w*.22,h*(.53+i*.07),Math.cos(i*2.4)*d*.22]} rotation={[.5+i*.15,i*2.4,.4]} scale={[w*.2,h*.17,d*.11]} castShadow><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color={i%2?"#7d9568":"#62835a"}/></mesh>)}
  </>;
  // Tables and desks: a slim wood top and four visible legs.
  return <>
    <Legs w={w} d={d} h={h-.07} inset={Math.min(.1,w*.12)} color={category.includes("desk")?"#6e7565":"#967757"}/>
    <Block size={[w,.075,d]} position={[0,h-.038,0]} color={color} round={.055}/>
    {category.includes("desk") && <>
      <Block size={[w*.46,.018,d*.24]} position={[-w*.08,h+.013,d*.1]} color="#d2d2c3" round={.015}/>
      <Block size={[w*.4,Math.min(.36,h*.4),.027]} position={[-w*.08,h+.17,-d*.18]} color="#515a53" round={.015}/>
      <Block size={[w*.36,Math.min(.3,h*.34),.008]} position={[-w*.08,h+.18,-d*.16]} color="#a9c1af" round={.008}/>
      <mesh position={[w*.32,h+.035,d*.14]}><cylinderGeometry args={[.037,.03,.07,12]}/><meshStandardMaterial color="#efe8d8"/></mesh>
    </>}
    {(category.includes("coffee")||category==="table") && <>
      <Block size={[Math.min(.27,w*.3),.025,Math.min(.2,d*.4)]} position={[-w*.15,h+.012,0]} color="#ded6bf" round={.007}/>
      <Block size={[Math.min(.25,w*.28),.02,Math.min(.18,d*.36)]} position={[-w*.15+.02,h+.035,.01]} color="#8d9b83" round={.005}/>
      <mesh position={[w*.22,h+.04,d*.06]} castShadow><cylinderGeometry args={[.045,.035,.08,16]}/><meshStandardMaterial color="#e8e1cf"/></mesh>
    </>}
  </>;
}

function RoomShell({project,showGrid,fullWalls=false}:{project:Project;showGrid:boolean;fullWalls?:boolean}) {
  const {room}=project;
  const floorColors=["#dfcfb4","#e2d3bc","#e7d8bf","#dfceb0","#e5d5b9"];
  const boards=useMemo(()=>{
    const result:{key:string;size:Triple;position:Triple;color:string}[]=[];
    for(let column=0;column<Math.ceil(room.width/.34);column++) {
      const left=column*.34,right=Math.min(room.width,left+.34);
      const cuts=[0,...Array.from({length:Math.ceil(room.depth/1.6)},(_,i)=>(i+(column%2?.5:1))*1.6).filter(v=>v>0&&v<room.depth),room.depth].sort((a,b)=>a-b);
      for(let row=0;row<cuts.length-1;row++) result.push({key:`${column}-${row}`,size:[right-left-.006,.055,cuts[row+1]-cuts[row]-.005],position:[(right+left)/2,-.035,(cuts[row+1]+cuts[row])/2],color:floorColors[(column*3+row)%floorColors.length]});
    } return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[room.width,room.depth]);
  const walls=(side:"north"|"south"|"east"|"west")=>{
    const horizontal=side==="north"||side==="south";
    const length=horizontal?room.width:room.depth;
    const cutaway=!fullWalls&&(side==="south"||side==="east");
    const height=cutaway?.12:room.height;
    const doors=room.doors.filter(d=>d.wall===side);
    const windows=room.windows.filter(w=>w.wall===side);
    const cuts=[...new Set([0,length,...doors.flatMap(d=>[Math.max(0,d.position-d.width/2),Math.min(length,d.position+d.width/2)]),...windows.flatMap(w=>[Math.max(0,w.position-w.width/2),Math.min(length,w.position+w.width/2)])])].sort((a,b)=>a-b);
    return cuts.slice(0,-1).flatMap((start,index)=>{
      const end=cuts[index+1],mid=(start+end)/2;
      const door=doors.find(d=>Math.abs(mid-d.position)<d.width/2+.001);
      const win=windows.find(w=>Math.abs(mid-w.position)<w.width/2+.001);
      const spans:[number,number][]=door?[[Math.min(2.1,height),height]]:win&&!cutaway?[[0,win.sillHeight],[Math.min(height,win.sillHeight+win.height),height]]:[[0,height]];
      return spans.filter(([a,b])=>b-a>.001).map(([bottom,top],part)=><Block key={`${side}-${index}-${part}`} size={horizontal?[end-start,top-bottom,.085]:[.085,top-bottom,end-start]} position={horizontal?[mid,(top+bottom)/2,side==="north"?-.043:room.depth+.043]:[side==="west"?-.043:room.width+.043,(top+bottom)/2,mid]} color={cutaway?"#dedbc9":side==="north"?"#f1ecdf":"#e8e6d7"} round={.008}/>);
    });
  };
  return <>
    <mesh rotation={[-Math.PI/2,0,0]} position={[room.width/2,-.16,room.depth/2]} receiveShadow><planeGeometry args={[200,200]}/><meshStandardMaterial color="#e8ece3" roughness={1}/></mesh>
    <Block size={[room.width+.15,.15,room.depth+.15]} position={[room.width/2,-.12,room.depth/2]} color="#c8b99e" round={.04}/>
    {boards.map(b=><Block key={b.key} size={b.size} position={b.position} color={b.color} round={0}/>)}
    {showGrid&&<gridHelper args={[Math.max(room.width,room.depth),Math.round(Math.max(room.width,room.depth)/.25),"#9aa58b","#b2b8a2"]} position={[room.width/2,.001,room.depth/2]} material-transparent material-opacity={.2}/>}
    {walls("north")}{walls("west")}{walls("south")}{walls("east")}
    {room.windows.map(win=>{
      const horizontal=win.wall==="north"||win.wall==="south";
      const center:Triple=horizontal?[win.position,win.sillHeight+win.height/2,win.wall==="north"?-.04:room.depth+.04]:[win.wall==="west"?-.04:room.width+.04,win.sillHeight+win.height/2,win.position];
      return <group key={win.id} position={center} rotation={[0,horizontal?0:Math.PI/2,0]}>
        <Block size={[win.width,win.height,.018]} color="#c4dcd3" round={0} opacity={.5}/>
        <Block size={[win.width+.13,.06,.12]} position={[0,-win.height/2,0]} color="#fbf7e9"/>
        <Block size={[win.width+.1,.045,.085]} position={[0,win.height/2,0]} color="#fbf7e9"/>
        {[-1,0,1].map(n=><Block key={n} size={[.035,win.height,.06]} position={[n*win.width/2,0,0]} color="#f9f5e7" round={0}/>)}
        <Block size={[win.width,.035,.055]} position={[0,0,0]} color="#f9f5e7" round={0}/>
      </group>;
    })}
    {room.doors.map(door=>{
      const points=doorSwingPolygon(room,door);
      const segment=doorSegment(room,door);
      return <group key={door.id}><Line points={segment.map(p=>[p.x,.012,p.z] as Triple)} color="#9caa8f" lineWidth={2}/>{points.length>2&&<Line points={points.map(p=>[p.x,.015,p.z] as Triple)} color="#9eaa91" lineWidth={1} dashed dashSize={.05} gapSize={.04}/>}</group>;
    })}
    {/* A flat woven rug is decorative and has no analytical collision volume. */}
    {project.furniture.some(f=>f.category.toLowerCase().includes("sofa"))&&(()=>{
      const sofa=project.furniture.find(f=>f.category.toLowerCase().includes("sofa"))!;
      const vertical=sofa.depth>sofa.width;
      const rw=Math.min(vertical?1.7:2.5,room.width-.1),rd=Math.min(vertical?2.5:1.7,room.depth-.1);
      const x=Math.min(room.width-rw/2-.03,Math.max(rw/2+.03,sofa.x+(vertical?.55:0)));
      const z=Math.min(room.depth-rd/2-.03,Math.max(rd/2+.03,sofa.z+(vertical?0:.55)));
      return <group position={[x,.002,z]}><Block size={[rw,.008,rd]} position={[0,0,0]} color="#e6ddc4" round={.03}/>{[-rd/2+.1,-rd/2+.15,rd/2-.1,rd/2-.15].map(n=><Block key={n} size={[rw-.15,.002,.012]} position={[0,.006,n]} color="#c8c3aa" round={0}/>)}</group>;
    })()}
  </>;
}

function Routes({project,analysis}:{project:Project;analysis:Analysis}) {
  return <>{analysis.routes.map((result,index)=>{
    const definition=project.routes.find(r=>r.id===result.id);
    const dest=result.path[result.path.length-1]||(definition?resolveDestination(project,definition):null);
    const color=palette[result.status];
    const thickness=project.profile.width+2*(project.profile.margin+project.profile.uncertainty);
    return <group key={result.id}>
      {!result.available&&dest&&definition&&<Line points={[(definition.start||entranceAnchor(project)),dest].map(p=>[p.x,.024,p.z] as Triple)} color={palette.red} transparent opacity={.65} lineWidth={1.5} dashed dashSize={.1} gapSize={.1}/>}
      {result.path.length>1&&<>
        {result.path.slice(1).map((p,i)=>{
          const a=result.path[i]; const len=Math.hypot(p.x-a.x,p.z-a.z);
          return <mesh key={i} position={[(p.x+a.x)/2,.017,(p.z+a.z)/2]} rotation={[-Math.PI/2,0,-Math.atan2(p.z-a.z,p.x-a.x)]}><planeGeometry args={[len+.025,thickness]}/><meshBasicMaterial color={color} transparent opacity={.095} depthWrite={false}/></mesh>;
        })}
        <Line points={result.path.map(p=>[p.x,.025+index*.002,p.z] as Triple)} color={color} transparent opacity={.75} lineWidth={2} dashed dashSize={.12} gapSize={.08}/>
      </>}
      {dest&&<group position={[dest.x,.03,dest.z]}>
        <mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.075,.105,32]}/><meshBasicMaterial color={color} side={THREE.DoubleSide}/></mesh>
        <mesh rotation={[-Math.PI/2,0,0]}><circleGeometry args={[.072,32]}/><meshBasicMaterial color="#f9f7ed" side={THREE.DoubleSide}/></mesh>
        <mesh position={[0,.018,0]}><sphereGeometry args={[.025,10,8]}/><meshBasicMaterial color={color}/></mesh>
        <SceneLabel text={`${result.available?"↗ ":"! Blocked · "}${result.name}`} position={[0,.08,.25]} color={color} height={.18}/>
      </group>}
      {result.bottleneck&&result.available&&<mesh position={[result.bottleneck.x,.035,result.bottleneck.z]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.06,.08,24]}/><meshBasicMaterial color={color} side={THREE.DoubleSide}/></mesh>}
    </group>;
  })}</>;
}

type DragState={item:Furniture;offset:Point;startAngle:number;mode:"move"|"rotate"};
function PlanningScene(props:RoomViewProps&{onDragState:(message:string|null,valid?:boolean)=>void}) {
  const {project,selectedId,onSelect,onMove,analysis,showGrid,showRoutes,ghost,readOnly,onDragState}=props;
  const [preview,setPreview]=useState<Furniture|null>(null);
  const [previewAnalysis,setPreviewAnalysis]=useState<Analysis|null>(null);
  const [checking,setChecking]=useState(false);
  const drag=useRef<DragState|null>(null);
  const previewRef=useRef<Furniture|null>(null);
  const {camera}=useThree();
  const selected=project.furniture.find(f=>f.id===selectedId);
  const validity=preview?placementIssues(project,preview).every(issue=>issue.kind==='unsupported'):true;
  useEffect(()=>{
    if(!preview){setPreviewAnalysis(null);setChecking(false);return;}
    setChecking(true);
    const issues=placementIssues(project,preview).filter(issue=>issue.kind!=='unsupported');
    const distance=drag.current?Math.hypot(preview.x-drag.current.item.x,preview.z-drag.current.item.z):0;
    const placement=issues.length?`${issues[0].message} Release to restore.`:`Clear placement · ${distance.toFixed(2)} m moved`;
    onDragState(`${placement} · Checking routes…`,!issues.length);
    const timer=window.setTimeout(()=>{
      const result=analyze({...project,furniture:project.furniture.map(f=>f.id===preview.id?preview:f)});
      setPreviewAnalysis(result);
      setChecking(false);
      onDragState(`${placement} · ${result.requiredAvailable}/${result.requiredTotal} required routes available`,!issues.length);
    },150);
    return()=>window.clearTimeout(timer);
  },[preview,project]);
  const point=(event:ThreeEvent<PointerEvent>)=>{const p=new THREE.Vector3();return event.ray.intersectPlane(plane,p)?{x:p.x,z:p.z}:null;};
  const cancel=()=>{drag.current=null;previewRef.current=null;setPreview(null);onDragState(null);};
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==="Escape")cancel();};window.addEventListener("keydown",handler);window.addEventListener('blur',cancel);window.addEventListener('pointercancel',cancel);return()=>{window.removeEventListener("keydown",handler);window.removeEventListener('blur',cancel);window.removeEventListener('pointercancel',cancel);};});
  useEffect(()=>{camera.position.set(project.room.width*1.35,Math.max(project.room.width,project.room.depth)*1.35,project.room.depth*1.65);camera.lookAt(project.room.width/2,0,project.room.depth/2);},[camera,project.room.width,project.room.depth]);
  const begin=(event:ThreeEvent<PointerEvent>,item:Furniture,mode:"move"|"rotate"="move")=>{
    event.stopPropagation();onSelect(item.id);
    if(readOnly||item.locked||!item.movable)return;
    const p=point(event);if(!p)return;
    drag.current={item,offset:{x:p.x-item.x,z:p.z-item.z},startAngle:Math.atan2(p.z-item.z,p.x-item.x),mode};
    previewRef.current=item;setPreview(item);
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  const move=(event:ThreeEvent<PointerEvent>)=>{
    const start=drag.current;if(!start)return;
    event.stopPropagation();const p=point(event);if(!p)return;
    const candidate=start.mode==="rotate"?{...start.item,rotation:Math.round((start.item.rotation+Math.atan2(p.z-start.item.z,p.x-start.item.x)-start.startAngle)/(Math.PI/12))*(Math.PI/12)}:{...start.item,x:rounded(p.x-start.offset.x),z:rounded(p.z-start.offset.z)};
    previewRef.current=candidate;setPreview(candidate);
    const issues=placementIssues(project,candidate).filter(issue=>issue.kind!=='unsupported');
    const distance=Math.hypot(candidate.x-start.item.x,candidate.z-start.item.z);
    onDragState(issues.length?`${issues[0].message} Release to restore.`:`Clear placement · ${start.mode==="rotate"?Math.round(candidate.rotation*180/Math.PI)+"°":distance.toFixed(2)+" m moved"}`,!issues.length);
  };
  const finish=(event:ThreeEvent<PointerEvent>)=>{
    if(!drag.current)return;event.stopPropagation();
    const f=previewRef.current;if(f)onMove(f.id,f.x,f.z,f.rotation);
    cancel();
  };
  const items=project.furniture.map(f=>f.id===preview?.id?preview:f);
  return <>
    <ambientLight intensity={1.1}/><hemisphereLight args={["#fff7e4","#9aa98e",1.2]}/>
    <directionalLight position={[project.room.width+1,8,1]} intensity={2.2} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-.00015} shadow-normalBias={.025}/>
    <RoomShell project={project} showGrid={showGrid}/>
    {showRoutes&&(!preview||!checking)&&<Routes project={preview?{...project,furniture:items}:project} analysis={previewAnalysis||analysis}/>}
    {ghost?.filter(f=>{const original=project.furniture.find(p=>p.id===f.id);return !original||Math.hypot(original.x-f.x,original.z-f.z)>.001||Math.abs(original.rotation-f.rotation)>.001;}).map(f=><group key={`ghost-${f.id}`} position={[f.x,0,f.z]} rotation={[0,-f.rotation,0]}><FurnitureModel item={f} ghost/></group>)}
    {preview&&drag.current&&<group position={[drag.current.item.x,0,drag.current.item.z]} rotation={[0,-drag.current.item.rotation,0]}><FurnitureModel item={drag.current.item} ghost/></group>}
    {[...project.room.fixedObstacles,...items].map(item=>{
      const issue=analysis.placement.some(p=>p.furnitureId===item.id&&p.kind!=='unsupported');
      const active=item.id===selectedId;
      const invalid=item.id===preview?.id&&!validity;
      const color=invalid||issue?palette.red:"#398772";
      return <group key={item.id}>
        <group position={[item.x,0,item.z]} rotation={[0,-item.rotation,0]} onPointerDown={event=>begin(event,item)} onPointerMove={move} onPointerUp={finish} onPointerOver={()=>{if(!readOnly)document.body.style.cursor=item.locked||!item.movable?"pointer":"grab";}} onPointerOut={()=>{document.body.style.cursor="auto";}}>
          <FurnitureModel item={item}/>
          {(active||issue)&&<mesh position={[0,.012,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[item.width+.12,item.depth+.12]}/><meshBasicMaterial color={color} transparent opacity={.09} depthWrite={false}/></mesh>}
        </group>
        {(active||issue)&&<Line points={[...footprint(item),footprint(item)[0]].map(p=>[p.x,.026,p.z] as Triple)} color={color} lineWidth={active?2.2:1.4} transparent opacity={.9}/>} 
        {active&&<SceneLabel text={`${item.label}${item.locked?" · locked":""}`} position={[item.x,item.height+.23,item.z]} height={.2}/>}
      </group>;
    })}
    {selected&&!selected.locked&&selected.movable&&!readOnly&&<group position={[preview?.id===selected.id?preview.x:selected.x,.045,preview?.id===selected.id?preview.z:selected.z]}>
      <Line points={[[0,0,0],[0,0,selected.depth/2+.32]]} color="#3c806d" lineWidth={1} dashed dashSize={.04} gapSize={.03}/>
      <mesh position={[0,0,selected.depth/2+.32]} rotation={[-Math.PI/2,0,0]} onPointerDown={event=>begin(event,selected,"rotate")} onPointerMove={move} onPointerUp={finish} onPointerOver={()=>{document.body.style.cursor='crosshair';}} onPointerOut={()=>{document.body.style.cursor='auto';}}><ringGeometry args={[.09,.18,32]}/><meshBasicMaterial color="#2e806a" side={THREE.DoubleSide}/></mesh>
      <SceneLabel text="drag to rotate" position={[0,.08,selected.depth/2+.5]} height={.14} plain/>
    </group>}
    <OrbitControls makeDefault enabled={!preview} target={[project.room.width/2,0,project.room.depth/2]} minPolarAngle={.4} maxPolarAngle={1.2} minDistance={3} maxDistance={18} enableDamping dampingFactor={.12}/>
  </>;
}

type WalkControls={forward:boolean;back:boolean;left:boolean;right:boolean;turnLeft:boolean;turnRight:boolean};
const noWalk:WalkControls={forward:false,back:false,left:false,right:false,turnLeft:false,turnRight:false};

function WalkScene({project,height,controls}:{project:Project;height:number;controls:React.RefObject<WalkControls>}) {
  const {camera}=useThree();
  const yaw=useRef(Math.PI);
  useEffect(()=>{
    const initial=project.routes[0]?.start||entranceAnchor(project);
    camera.position.set(initial.x,height,initial.z);
    yaw.current=Math.PI;
    camera.rotation.order="YXZ";
    camera.rotation.set(0,0,0);
    camera.lookAt(project.room.width/2,height,project.room.depth/2);
    yaw.current=camera.rotation.y;
  // Camera should reset only when entering the walk scene.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useFrame((_,delta)=>{
    const c=controls.current||noWalk;
    const dt=Math.min(delta,.05);
    yaw.current+=(Number(c.turnLeft)-Number(c.turnRight))*dt*1.2;
    camera.rotation.set(0,yaw.current,0);
    camera.position.y=height;
    const f=Number(c.forward)-Number(c.back),s=Number(c.right)-Number(c.left);
    if(!f&&!s)return;
    const norm=Math.max(1,Math.hypot(f,s));
    const dx=(-Math.sin(yaw.current)*f+Math.cos(yaw.current)*s)*dt*.95/norm;
    const dz=(-Math.cos(yaw.current)*f-Math.sin(yaw.current)*s)*dt*.95/norm;
    const clear=(x:number,z:number)=>isPointNavigable(project,{x,z},.18);
    const x=camera.position.x,z=camera.position.z;
    if(clear(x+dx,z))camera.position.x+=dx;
    if(clear(camera.position.x,z+dz))camera.position.z+=dz;
  });
  return <><ambientLight intensity={1.3}/><hemisphereLight args={["#fff9e6","#9ca88d",1.4]}/><directionalLight position={[2,7,4]} intensity={2} castShadow shadow-mapSize={[1024,1024]}/><RoomShell project={project} showGrid={false} fullWalls/>{[...project.room.fixedObstacles,...project.furniture].map(f=><group key={f.id} position={[f.x,0,f.z]} rotation={[0,-f.rotation,0]}><FurnitureModel item={f}/></group>)}</>;
}

class CanvasBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true};}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}

export default function RoomCanvas(props:RoomViewProps) {
  const [available,setAvailable]=useState<boolean|null>(null);
  const [dragMessage,setDragMessage]=useState<string|null>(null);
  const [validDrag,setValidDrag]=useState(true);
  const [height,setHeight]=useState(1.25);
  const controls=useRef<WalkControls>({...noWalk});
  const walk=props.view==="walk";
  const selected=props.project.furniture.find(item=>item.id===props.selectedId);
  const rotate=(direction:number)=>{
    if(!selected||selected.locked||!selected.movable||props.readOnly)return;
    const rotation=Math.atan2(Math.sin(selected.rotation+direction*Math.PI/12),Math.cos(selected.rotation+direction*Math.PI/12));
    const issue=placementIssues(props.project,{...selected,rotation}).find(issue=>issue.kind!=='unsupported');
    if(issue){setDragMessage(`${issue.message} Rotation was not applied.`);setValidDrag(false);return;}
    props.onMove(selected.id,selected.x,selected.z,rotation);
    setDragMessage(null);
  };
  useEffect(()=>{
    try {const canvas=document.createElement("canvas");setAvailable(Boolean(canvas.getContext("webgl2")||canvas.getContext("webgl")));}catch{setAvailable(false);}
    return()=>{document.body.style.cursor="auto";};
  },[]);
  useEffect(()=>{
    if(!walk)return;
    const keys:Record<string,keyof WalkControls>={w:"forward",ArrowUp:"forward",s:"back",ArrowDown:"back",a:"left",d:"right",ArrowLeft:"turnLeft",ArrowRight:"turnRight",q:"turnLeft",e:"turnRight"};
    const key=(event:KeyboardEvent,pressed:boolean)=>{
      if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
      if(event.key==="Escape"&&pressed){props.onExitWalk?.();return;}
      const action=keys[event.key];if(action){event.preventDefault();controls.current[action]=pressed;}
    };
    const down=(e:KeyboardEvent)=>key(e,true),up=(e:KeyboardEvent)=>key(e,false),blur=()=>{controls.current={...noWalk};};
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",blur);
    return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",blur);controls.current={...noWalk};};
  },[walk,props.onExitWalk]);
  const fallback=<div style={{height:"100%",position:"relative"}}><TopDown {...props}/><div style={{position:"absolute",left:16,top:16,right:16,background:"#fffdf4f5",padding:"10px 14px",borderRadius:8,fontSize:12,color:"#76633e",border:"1px solid #e5dac0"}}>3D is unavailable in this browser. You can plan and edit the same room in top-down view.</div></div>;
  const button=(label:string,glyph:string,action:keyof WalkControls)=><button aria-label={label} title={label} key={action} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);controls.current[action]=true;}} onPointerUp={()=>{controls.current[action]=false;}} onPointerCancel={()=>{controls.current[action]=false;}} onLostPointerCapture={()=>{controls.current[action]=false;}} style={{width:40,height:40,border:"1px solid #dce3d4",borderRadius:9,background:"#fffdf6",color:"#41664c",fontSize:20,touchAction:"none"}}>{glyph}</button>;
  if(props.view==="top")return <TopDown {...props}/>;
  if(available===false)return fallback;
  return <div className="room-renderer" data-testid="room-canvas" style={{position:"relative",width:"100%",height:"100%",minHeight:300,overflow:"hidden",background:"#e8ece3"}}>
    {available===null?<div style={{display:"grid",placeItems:"center",height:"100%",color:"#738069",fontSize:13}}>Preparing your room…</div>:<CanvasBoundary fallback={fallback}>
      <Canvas frameloop={walk?'always':'demand'} key={walk?"walk":"plan"} shadows dpr={[1,1.6]} camera={walk?{position:[props.project.room.width/2,height,props.project.room.depth-.5],fov:65,near:.05,far:50}:{position:[props.project.room.width*1.35,Math.max(props.project.room.width,props.project.room.depth)*1.35,props.project.room.depth*1.65],fov:38,near:.1,far:150}} gl={{antialias:true,alpha:false,powerPreference:"high-performance"}} onCreated={({gl})=>{gl.setClearColor("#e8ece3");gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.1;gl.domElement.addEventListener("webglcontextlost",event=>{if(gl.domElement.isConnected){event.preventDefault();setAvailable(false);}});}} onPointerMissed={()=>{if(!walk)props.onSelect(null);}}>
        <Suspense fallback={null}>{walk?<WalkScene project={props.project} height={height} controls={controls}/>:<PlanningScene {...props} onDragState={(message,valid=true)=>{setDragMessage(message);setValidDrag(valid);}}/>}</Suspense>
      </Canvas>
    </CanvasBoundary>}
    {!walk&&!props.readOnly&&<>
      {selected&&<div className="scene-rotation" role="group" aria-label="Rotate selected object" style={{position:'absolute',top:48,left:16,right:16,margin:'0 auto',maxWidth:350,padding:'10px 12px',borderRadius:12,background:'#fffdf8f5',boxShadow:'0 4px 18px #22332618',display:'flex',gap:10,alignItems:'center',justifyContent:'center',flexWrap:'wrap',fontSize:12,color:'#365e4d'}}>
        <span>{selected.label} · {Math.round(selected.rotation*180/Math.PI)}°</span>
        {[-1,1].map(direction=><button key={direction} type="button" aria-label={direction<0?'Rotate object counterclockwise 15 degrees':'Rotate object clockwise 15 degrees'} disabled={selected.locked||!selected.movable} onClick={()=>rotate(direction)} style={{minWidth:44,minHeight:40,border:'1px solid #cddacf',borderRadius:8,background:'#f3f6ed',color:'#285c49',cursor:'pointer',fontSize:18}}>{direction<0?'↶':'↷'}</button>)}
        {(selected.locked||!selected.movable)&&<small>Unlock this object to rotate.</small>}
      </div>}
      <div style={{position:"absolute",top:20,left:21,pointerEvents:"none",color:"#7b8972",fontSize:10,letterSpacing:".15em",fontWeight:600}}>YOUR ROOM, REIMAGINED</div>
      <div style={{position:"absolute",bottom:21,left:22,display:"flex",gap:14,alignItems:"center",fontSize:10,color:"#73806b",pointerEvents:"none"}}><span style={{display:"flex",gap:6,alignItems:"center"}}><span style={{width:6,height:6,borderRadius:"50%",background:"#4a8d72"}}/>Clear route</span><span style={{display:"flex",gap:6,alignItems:"center"}}><span style={{width:6,height:6,borderRadius:"50%",background:"#c26e62"}}/>Needs attention</span></div>
      <div className="canvas-hint" style={{position:"absolute",bottom:21,right:21,fontSize:10,color:"#7a8673",pointerEvents:"none"}}>Drag to arrange · Scroll to zoom · Right-drag to pan</div>
      {dragMessage&&<div role="status" style={{position:"absolute",left:"50%",bottom:55,transform:"translateX(-50%)",maxWidth:"80%",borderRadius:10,background:"#fffdf8f5",boxShadow:"0 6px 25px #22332618",padding:"11px 16px",fontSize:12,color:validDrag?"#287a68":"#b04e43",pointerEvents:"none",textAlign:"center"}}>{validDrag?"✓ ":"! "}{dragMessage}</div>}
    </>}
    {walk&&<>
      <div style={{position:"absolute",left:18,top:18,padding:"12px 15px",borderRadius:10,background:"#fffdf5f2",maxWidth:330,color:"#526349",fontSize:12,lineHeight:1.5}}><strong style={{display:"block",fontSize:13,color:"#2e4938"}}>Walkthrough · spatial preview</strong>WASD to move · Arrow keys to look. Camera collision is a preview; route checks use your movement preferences.</div>
      <button onClick={props.onExitWalk} style={{position:"absolute",right:18,top:18,border:"1px solid #d8e1d0",borderRadius:9,background:"#fffdf6",padding:"11px 16px",color:"#36583f",fontSize:12,fontWeight:600}}>Exit walkthrough ↗</button>
      <div style={{position:"absolute",left:18,bottom:18,borderRadius:10,background:"#fffdf6ed",padding:"12px 15px",fontSize:11,color:"#53664b"}}><label htmlFor="camera-height" style={{display:"flex",alignItems:"center",gap:14}}>Camera height <strong>{height.toFixed(2)} m</strong></label><input id="camera-height" type="range" min=".75" max="1.8" step=".05" value={height} onChange={event=>setHeight(Number(event.target.value))} style={{accentColor:"#44866b",marginTop:9,width:175}}/></div>
      <div style={{position:"absolute",right:18,bottom:18,display:"grid",gridTemplateColumns:"repeat(3,40px)",gap:5}}><span/>{button("Move forward","↑","forward")}<span/>{button("Move left","←","left")}{button("Move backward","↓","back")}{button("Move right","→","right")}{button("Turn left","↶","turnLeft")}<span/>{button("Turn right","↷","turnRight")}</div>
    </>}
  </div>;
}

export type { RoomViewProps } from "./TopDown";


