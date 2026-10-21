"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis, Furniture, Point, Project } from "@/lib/model";
import {useLightExposure} from './useLightExposure';
import {defaultDaylight} from '../lib/daylight';
import { sunlightPatches, exposureColor } from '@/lib/daylight';
import { patchFurniture } from "@/lib/anchors";
import { analyze, doorSegment, doorSwingPolygon, entranceAnchor, footprint, placementIssues, previewPlacementIssues, resolveDestination } from "@/lib/geometry";

export type RoomViewProps = {
  heatmap?:import('./useLightExposure').HeatmapState;
  routeDrawing?:boolean;routeDraft?:{points:Point[];result:import('@/lib/model').RouteResult|null};onFloorPoint?:(point:Point)=>void;
  daylight?: import('@/lib/daylight').DaylightSettings;
  focusRequest?: {ids:string[];token:number};
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number, rotation?: number, elevation?: number) => void;
  analysis: Analysis;
  view?: "3d" | "top" | "walk";
  showGrid: boolean;
  showRoutes: boolean;
  ghost?: Furniture[];
  readOnly?: boolean;
  onExitWalk?: () => void;
};

const colors = { green: "#428872", amber: "#c08a36", red: "#cb6b61" };
const pts = (points: Point[]) => points.map(p => `${p.x},${p.z}`).join(" ");
const round = (n: number) => Math.round(n * 20) / 20;

function FurnitureSymbol({ item, selected, invalid, ghost = false }: {item: Furniture; selected?: boolean; invalid?: boolean; ghost?: boolean}) {
  const w = item.width, d = item.depth;
  const category = item.category.toLowerCase();
  const base = item.color || "#c5c3ae";
  const stroke = invalid ? colors.red : selected ? "#287a68" : "#6f756c";
  return <g transform={`translate(${item.x} ${item.z}) rotate(${item.rotation * 180 / Math.PI})`} opacity={ghost ? .3 : 1}>
    <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={Math.min(.08, d / 8)} fill={ghost ? "none" : base} stroke={stroke} strokeWidth={selected || invalid ? .035 : .015} strokeDasharray={ghost || (item.elevation??0)>=2 ? ".07 .045" : undefined}/>
    {!ghost && <g fill="none" stroke="#5a635c" strokeOpacity=".28" strokeWidth=".015">
      {category.includes("sofa") && <><path d={`M ${-w / 2 + .13} ${d / 2 - .03} V ${-d / 2 + .2} H ${w / 2 - .13} V ${d / 2 - .03}`}/><path d={`M 0 ${-d / 2 + .2} V ${d / 2 - .03}`}/></>}
      {category.includes("bed") && <><rect x={-w / 2 + .08} y={-d / 2 + .1} width={w - .16} height={d * .2} rx=".04"/><path d={`M ${-w / 2 + .03} ${-d / 2 + d * .38} H ${w / 2 - .03}`}/></>}
      {category.includes("chair") && <path d={`M ${-w / 2 + .04} ${d / 2 - .1} H ${w / 2 - .04}`}/>}
      {(category.includes("shelf") || category.includes("cabinet")) && <path d={`M ${-w / 6} ${-d / 2} V ${d / 2} M ${w / 6} ${-d / 2} V ${d / 2}`}/>}
      {(category.includes("desk") || category.includes("table")) && <rect x={-w / 2 + .06} y={-d / 2 + .06} width={w - .12} height={d - .12} rx=".05"/>}
    </g>}
  </g>;
}

/** Orthographic editor. Coordinates come directly from the analytical room model. */
export default function TopDown(props: RoomViewProps) {
  const { project, analysis, selectedId, onSelect, onMove, showGrid, showRoutes, ghost, readOnly } = props;
  const { room } = project;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ item: Furniture; start: Point; offset: Point } | null>(null);
  const previewRef = useRef<Furniture | null>(null);
  const [preview, setPreview] = useState<Furniture | null>(null);
  const [previewAnalysis, setPreviewAnalysis] = useState<Analysis | null>(null);
  const [checking, setChecking] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const activeProject=preview?patchFurniture(project,preview.id,{x:preview.x,z:preview.z,rotation:preview.rotation}):project;
  const exposure=useLightExposure(activeProject,props.daylight??defaultDaylight,props.heatmap);
  const exposureCells=exposure.map?.cells??[];
  const valid=!preview||previewPlacementIssues(project,activeProject).length===0;
  const furniture=activeProject.furniture;
  const cancel = useCallback(() => {
    drag.current=null;previewRef.current=null;setPreview(null);setPreviewAnalysis(null);setChecking(false);
  },[]);
  useEffect(() => {
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel()};
    window.addEventListener('keydown',key);window.addEventListener('blur',cancel);window.addEventListener('pointercancel',cancel);
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);window.removeEventListener('pointercancel',cancel)};
  },[cancel]);
  useEffect(() => {
    if (!preview) {setPreviewAnalysis(null);setChecking(false);return;}
    setChecking(true);
    const timer = window.setTimeout(() => {
      setPreviewAnalysis(analyze(activeProject));
      setChecking(false);
    },150);
    return () => window.clearTimeout(timer);
  },[project,preview]);

  const activeAnalysis = previewAnalysis || analysis;
  const coord = (event: React.PointerEvent<SVGSVGElement | SVGGElement>): Point => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, z: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, z: point.y };
  };
  const end = (event:React.PointerEvent<SVGSVGElement>) => {
    const item=previewRef.current;
    if (drag.current && item) {
      const issues=previewPlacementIssues(project,patchFurniture(project,item.id,{x:item.x,z:item.z,rotation:item.rotation}));
      if(!issues.length)onMove(item.id,item.x,item.z,item.rotation);
      setAnnouncement(!issues.length ? `${item.label} moved. Position clear.` : `${item.label} was returned to its previous position. ${issues[0]?.message || "Placement is invalid."}`);
    }
    cancel();
    if(svg.current?.hasPointerCapture(event.pointerId))svg.current.releasePointerCapture(event.pointerId);
  };
  const widthText = project.profile.units === "ft" ? `${(room.width * 3.28084).toFixed(1)} ft` : `${room.width.toFixed(2)} m`;
  const depthText = project.profile.units === "ft" ? `${(room.depth * 3.28084).toFixed(1)} ft` : `${room.depth.toFixed(2)} m`;
  const wall = (side: "north" | "south" | "east" | "west") => {
    const horizontal = side === "north" || side === "south";
    const length = horizontal ? room.width : room.depth;
    const openings = room.doors.filter(d => d.wall === side).map(d => ({start: Math.max(0, d.position - d.width / 2), end: Math.min(length, d.position + d.width / 2)})).sort((a,b) => a.start-b.start);
    let cursor = 0;
    const spans: [number,number][] = [];
    openings.forEach(o => { if (o.start > cursor) spans.push([cursor,o.start]); cursor = Math.max(cursor,o.end); });
    if (cursor < length) spans.push([cursor,length]);
    return spans.map(([a,b],i) => <line key={`${side}-${i}`} x1={horizontal ? a : side === "west" ? 0 : room.width} y1={horizontal ? side === "north" ? 0 : room.depth : a} x2={horizontal ? b : side === "west" ? 0 : room.width} y2={horizontal ? side === "north" ? 0 : room.depth : b} stroke="#777e70" strokeWidth=".075" strokeLinecap="square"/>);
  };
  return <div className="top-down-view" style={{width:"100%",height:"100%",position:"relative",minHeight:props.routeDrawing?0:300,background:"#ecefe7",overflow:"hidden"}}>
    <svg ref={svg} data-testid="top-down-canvas" aria-label="Top-down room editor. Select furniture here or use the furniture list and position controls." role="img" viewBox={`-.65 -.65 ${room.width + 1.3} ${room.depth + 1.3}`} style={{width:"100%",height:"100%",touchAction:"none",userSelect:"none",cursor:props.routeDrawing?"crosshair":undefined}}
      onPointerDownCapture={event=>{if(props.routeDrawing&&!readOnly){event.stopPropagation();props.onFloorPoint?.(coord(event));}}}
      onPointerMove={event => {
        if (!drag.current) return;
        const point = coord(event);
        const next={...drag.current.item, x: round(point.x - drag.current.offset.x), z: round(point.z - drag.current.offset.z)};
        previewRef.current=next;setPreview(next);
      }}
      onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onPointerDown={event => {if(event.target === event.currentTarget) onSelect(null);}}>
      <defs>
        <pattern id="clearpath-top-grid" width=".25" height=".25" patternUnits="userSpaceOnUse"><path d="M .25 0 L 0 0 0 .25" fill="none" stroke="#858e7b" strokeOpacity=".14" strokeWidth=".009"/></pattern>
        <pattern id="clearpath-top-planks" width=".36" height="1.8" patternUnits="userSpaceOnUse"><rect width=".36" height="1.8" fill="#e7dac4"/><path d="M .36 0 H 0 V 1.8" fill="none" stroke="#cabba1" strokeWidth=".008"/></pattern>
      </defs>
      <rect x=".04" y=".055" width={room.width} height={room.depth} rx=".045" fill="#2e4537" opacity=".09"/>
      <polygon points={pts(room.boundary)} fill="url(#clearpath-top-planks)" stroke="#c6bba5" strokeWidth=".02"/>
      {showGrid && <polygon points={pts(room.boundary)} fill="url(#clearpath-top-grid)"/>}
      {room.doors.map(door => {
        const points = doorSwingPolygon(room, door);
        const segment = doorSegment(room, door);
        return <g key={door.id}>{points.length > 2 && <polygon points={pts(points)} fill="#b4bfab" opacity=".22" stroke="#87967a" strokeWidth=".015" strokeDasharray=".045 .035"/>}<line x1={segment[0].x} y1={segment[0].z} x2={segment[1].x} y2={segment[1].z} stroke="#64816c" strokeWidth=".025" strokeDasharray=".06 .03"/></g>;
      })}
      {props.daylight?.enabled&&<g pointerEvents="none" data-testid="sunlight-patches">{!props.daylight.heatmap&&sunlightPatches(room,props.daylight.hour).map(patch=><polygon key={patch.windowId} points={pts(patch.polygon)} fill="#ffe5a0" opacity={patch.strength*.65}/>)}{exposureCells.map((c,i)=><rect key={i} data-exposure-x={c.x} data-exposure-z={c.z} data-exposure-score={c.score} x={c.x-c.width/2} y={c.z-c.depth/2} width={c.width} height={c.depth} fill={exposureColor(c.score)}/>)}</g>}
      {showRoutes && (!preview || !checking) && activeAnalysis.routes.map(result => {
        const definition = project.routes.find(r => r.id === result.id);
        const endPoint = result.path[result.path.length - 1] || (definition ? resolveDestination(activeProject, definition) : null);
        const path = result.path;
        return <g key={result.id} pointerEvents="none">{definition?.start&&[definition.start,...(definition.waypoints??[])].map((p,i)=><g key={i}><circle cx={p.x} cy={p.z} r=".09" fill="#fffdf7" stroke={colors[result.status]} strokeWidth=".025"/><text x={p.x} y={p.z+.035} textAnchor="middle" fontSize=".1" fill="#27493c">{i+1}</text></g>)}
          {!result.available && endPoint && definition && !definition.start && <line x1={(definition.start || entranceAnchor(project)).x} y1={(definition.start || entranceAnchor(project)).z} x2={endPoint.x} y2={endPoint.z} stroke={colors.red} strokeWidth=".022" strokeDasharray=".06 .07" strokeOpacity=".7"/>}
          {path.length > 1 && <><polyline points={pts(path)} fill="none" stroke={colors[result.status]} strokeOpacity=".14" strokeWidth={project.profile.width + 2*(project.profile.margin+project.profile.uncertainty)} strokeLinecap="round" strokeLinejoin="round"/><polyline points={pts(path)} fill="none" stroke={colors[result.status]} strokeWidth=".028" strokeDasharray={result.status === "red" ? ".08 .06" : undefined} strokeLinecap="round" strokeLinejoin="round"/></>}
          {endPoint && <><circle cx={endPoint.x} cy={endPoint.z} r=".095" fill="#fffdf7" stroke={colors[result.status]} strokeWidth=".025"/><circle cx={endPoint.x} cy={endPoint.z} r=".025" fill={colors[result.status]}/><text x={endPoint.x} y={endPoint.z + .24} fontSize=".105" textAnchor="middle" fill="#415148" fontWeight="600" style={{paintOrder:"stroke",stroke:"#faf8ef",strokeWidth:.045}}>{result.available ? "" : "Blocked · "}{result.name}</text></>}
          {result.bottleneck && result.available && <circle cx={result.bottleneck.x} cy={result.bottleneck.z} r=".055" fill={colors[result.status]} stroke="#fffdf6" strokeWidth=".018"/>}
        </g>;
      })}
      {wall("north")}{wall("west")}{wall("east")}{wall("south")}
      {room.windows.map(win => {
        const horizontal = win.wall === "north" || win.wall === "south";
        return <line key={win.id} x1={horizontal ? win.position-win.width/2 : win.wall === "west" ? 0 : room.width} x2={horizontal ? win.position+win.width/2 : win.wall === "west" ? 0 : room.width} y1={horizontal ? win.wall === "north" ? 0 : room.depth : win.position-win.width/2} y2={horizontal ? win.wall === "north" ? 0 : room.depth : win.position+win.width/2} stroke="#b0d6cf" strokeWidth=".085"/>;
      })}
      {ghost?.filter(f=>{const original=project.furniture.find(p=>p.id===f.id);return !original||Math.hypot(original.x-f.x,original.z-f.z)>.001||Math.abs(original.rotation-f.rotation)>.001;}).map(f => <FurnitureSymbol key={`ghost-${f.id}`} item={f} ghost/>)}
      {props.focusRequest&&furniture.filter(f=>props.focusRequest!.ids.includes(f.id)).map(f=><polygon key={f.id+props.focusRequest!.token} points={pts(footprint(f))} className="coach-pulse"/>)}
      {preview && drag.current && <FurnitureSymbol item={drag.current.item} ghost/>}
      {[...room.fixedObstacles,...furniture].map(f => <g key={f.id} onPointerDown={event => {
        event.stopPropagation();onSelect(f.id);
        if (readOnly || f.locked || !f.movable) return;
        const point = coord(event);
        drag.current = {item:f,start:point,offset:{x:point.x-f.x,z:point.z-f.z}};
        previewRef.current=f;
        setPreview(f);
        svg.current?.setPointerCapture(event.pointerId);
      }} style={{cursor:readOnly ? "default" : f.locked || !f.movable ? "pointer" : "grab"}}>
        <title>{f.label} · height above floor {(f.elevation??0).toFixed(2)} m{f.anchor?` · anchored to ${f.anchor.kind}`:""}</title><FurnitureSymbol item={f} selected={f.id===selectedId} invalid={f.id===preview?.id&&!valid}/>{exposureCells.length>0&&<polygon points={pts(footprint(f))} fill={exposureColor(exposure.map?.objects[f.id]?.score??0)} opacity=".86" pointerEvents="none"/>}
        <text x={f.x} y={f.z+.025} textAnchor="middle" fontSize={Math.min(.12,f.width/Math.max(f.label.length*.65,1))} fontWeight="500" fill="#3c493f" style={{pointerEvents:"none",paintOrder:"stroke",stroke:f.color||"#c5c3ae",strokeWidth:.035}}>{f.label}</text>
      </g>)}
      {preview && <g pointerEvents="none"><polygon points={pts(footprint(preview))} fill={valid ? "#25816a" : "#d2574e"} fillOpacity=".1" stroke={valid ? "#25816a" : "#d2574e"} strokeWidth=".035"/></g>}
      {props.routeDraft&&!readOnly&&<g data-testid="route-draft-map" pointerEvents="none">{props.routeDraft.result?.available&&<polyline data-testid="route-draft-path" points={pts(props.routeDraft.result.path)} fill="none" stroke="#8053b1" strokeWidth=".045" strokeLinejoin="round"/>}{props.routeDraft.points.map((p,i)=><g key={i} data-testid="route-draft-point"><circle cx={p.x} cy={p.z} r=".12" fill="#fffaf1" stroke="#8053b1" strokeWidth=".035"/><text x={p.x} y={p.z+.045} textAnchor="middle" fontSize=".13" fontWeight="700" fill="#653891">{i+1}</text></g>)}</g>}
      <g stroke="#8b9486" strokeWidth=".012" fill="none"><path d={`M 0 -.25 V -.38 H ${room.width} V -.25 M -.25 0 H -.38 V ${room.depth} H -.25`}/></g>
      <text x={room.width/2} y="-.43" textAnchor="middle" fontSize=".12" fill="#65705f">{widthText}{room.confirmedWidth ? " · confirmed" : " · estimated"}</text>
      <text transform={`translate(-.45 ${room.depth/2}) rotate(-90)`} textAnchor="middle" fontSize=".12" fill="#65705f">{depthText}{room.confirmedDepth ? " · confirmed" : " · estimated"}</text>
      <text x="0" y={room.depth+.4} fontSize=".105" fill="#73806e">TOP-DOWN PLAN · {showGrid ? "25 cm grid" : "to scale"}</text>
    </svg>
    {preview && checking && <div style={{position:"absolute",right:18,top:18,fontSize:11,color:"#65775c",background:"#fffdf2ed",padding:"6px 10px",borderRadius:6,pointerEvents:"none"}}>Checking routes…</div>}
    {preview && <div style={{position:"absolute",left:"50%",bottom:22,transform:"translateX(-50%)",borderRadius:10,background:"#fffdf8",boxShadow:"0 6px 25px #22332618",padding:"10px 16px",fontSize:12,color:valid ? "#287a68" : "#b04e43",whiteSpace:"nowrap",pointerEvents:"none"}}>{valid ? "✓ Clear placement" : "! Invalid placement — release to restore"}{drag.current && ` · ${Math.hypot(preview.x-drag.current.item.x,preview.z-drag.current.item.z).toFixed(2)} m moved`}</div>}
    <span className="sr-only" aria-live="polite">{announcement}</span>
  </div>;
}
