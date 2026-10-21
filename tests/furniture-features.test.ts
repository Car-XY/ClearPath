import { describe, it, expect } from 'vitest';
import { createManual } from '../lib/demo';
import { attachFurniture, patchFurniture, resolveAnchors, detachMissingReferences } from '../lib/anchors';
import { analyze, evaluateConstraints, placementIssues, suggestImprovement, previewPlacementIssues, worsensRequiredConstraints, isSegmentNavigable } from '../lib/geometry';
import { validateProject, customModelSchema, type Furniture, type Project } from '../lib/model';
import { restoreFurnitureLayout } from '../lib/editor-actions';
import { exportProject, importProject } from '../lib/persistence';
function box(id:string,x:number,z:number,props:Partial<Furniture>={}):Furniture{return {id,label:id,category:'table',x,z,width:1,depth:1,height:1,rotation:0,color:'#aa8866',movable:true,locked:false,provenance:'confirmed',evidencePhotoIds:[],...props};}
function scene(){const p=createManual(6,6);p.furniture=[box('table',2,2),box('lamp',4,2,{width:.3,depth:.3,height:.4})];p.original=structuredClone(p.furniture);p.routes=[];return p;}
function rule(p:Project,metric:'floor-gap'|'center-3d'='floor-gap',min=1,max:number|null=null){p.constraints=[{id:'spacing',name:'Spacing',firstId:p.furniture[0].id,secondId:p.furniture[1].id,metric,min,max,required:true}];return p;}
describe('vertical assemblies and constraints',()=>{
 it('places furniture on a parent and keeps the attachment under rotation, translation and height changes',()=>{
  let p=scene();p=patchFurniture(p,'lamp',{anchor:attachFurniture(p,p.furniture[1],'furniture','table')});
  expect(p.furniture[1]).toMatchObject({x:2,z:2,elevation:1});expect(placementIssues(p,p.furniture[1])).toEqual([]);
  p=patchFurniture(p,'lamp',{x:2.3});p=patchFurniture(p,'table',{x:3,z:3,rotation:Math.PI/2,height:1.2,elevation:.2});
  expect(p.furniture[1].x).toBeCloseTo(3);expect(p.furniture[1].z).toBeCloseTo(3.3);expect(p.furniture[1].elevation).toBeCloseTo(1.4);expect(p.furniture[1].rotation).toBeCloseTo(Math.PI/2);
  const free=patchFurniture(p,'lamp',{anchor:undefined});const moved=patchFurniture(free,'table',{x:4});expect(moved.furniture[1]).toEqual(free.furniture[1]);
 });
 it('supports ceiling, wall and fixed point attachment and preserves them through export',()=>{
  let p=scene();p=patchFurniture(p,'lamp',{anchor:attachFurniture(p,p.furniture[1],'ceiling')});
  expect(p.furniture[1].elevation).toBeCloseTo(p.room.height-.4);expect(placementIssues(p,p.furniture[1])).toEqual([]);
  p=patchFurniture(p,'lamp',{anchor:attachFurniture(p,p.furniture[1],'wall',undefined,'east')});expect(p.furniture[1].x+.15).toBeCloseTo(6);
  p=patchFurniture(p,'lamp',{anchor:attachFurniture(p,p.furniture[1],'point')});p=patchFurniture(p,'lamp',{z:3});
  expect(importProject(exportProject(p)).furniture[1]).toEqual(p.furniture[1]);
 });
 it('rejects anchor cycles, missing parents and resolved poses below the floor',()=>{
  const p=scene();p.furniture[1].anchor=attachFurniture(p,p.furniture[1],'furniture','table');
  p.furniture[0].anchor={...p.furniture[1].anchor,targetId:'lamp'};expect(()=>validateProject(p)).toThrow();
  delete p.furniture[0].anchor;p.furniture[1].anchor.targetId='missing';expect(()=>validateProject(p)).toThrow();
  p.furniture[1].anchor=attachFurniture(p,p.furniture[1],'point');p.furniture[1].anchor.offset.y=-5;expect(()=>validateProject(p)).toThrow();
 });
 it('detaches children at their world pose when deleting a parent and reconciles restored snapshots',()=>{
  let p=scene();p=patchFurniture(p,'lamp',{anchor:attachFurniture(p,p.furniture[1],'furniture','table')});rule(p);
  const cleared=detachMissingReferences({...p,furniture:[p.furniture[1]]});expect(cleared.furniture[0]).toMatchObject({x:2,z:2,elevation:1});expect(cleared.furniture[0].anchor).toBeUndefined();expect(cleared.constraints).toEqual([]);
  const restored=restoreFurnitureLayout(p,[p.furniture[1]]);expect(()=>validateProject(restored)).not.toThrow();expect(restored.furniture[0].anchor).toBeUndefined();
 });
 it('distinguishes vertical overlap, touching surfaces and ceiling limits',()=>{
  const p=scene();p.furniture[1]={...p.furniture[1],x:2,z:2,elevation:1};expect(placementIssues(p,p.furniture[1])).toEqual([]);
  expect(placementIssues(p,{...p.furniture[1],elevation:.9}).some(i=>i.kind==='collision')).toBe(true);
  expect(placementIssues(p,{...p.furniture[1],elevation:p.room.height}).some(i=>i.kind==='boundary')).toBe(true);
 });
 it('checks a hanging object against adjustable travel headroom',()=>{
  const p=scene();p.furniture=[box('overhead',3,3,{width:5.8,depth:.4,height:.3,elevation:2.1})];p.profile.headroom=2;
  expect(isSegmentNavigable(p,{x:3,z:2},{x:3,z:4})).toBe(true);
  p.profile.headroom=2.3;expect(isSegmentNavigable(p,{x:3,z:2},{x:3,z:4})).toBe(false);
 });
 it('measures real rotated edge gaps and 3D center distance',()=>{
  const p=rule(scene());expect(evaluateConstraints(p)[0].distance).toBeCloseTo(1.35);
  p.furniture[0].rotation=Math.PI/4;expect(evaluateConstraints(p)[0].distance).toBeCloseTo(2-Math.SQRT1_2-.15);
  rule(p,'center-3d');p.furniture[1].elevation=2;expect(evaluateConstraints(p)[0].distance).toBeCloseTo(Math.hypot(2,1.7));
 });
 it('never trades a worsened required rule for an improvement elsewhere',()=>{
  const p=rule(scene());const after=patchFurniture(p,'lamp',{x:2.8});expect(worsensRequiredConstraints(p,after)).toBe(true);
  p.constraints!.push({...p.constraints![0],id:'max',min:0,max:1});const closer=patchFurniture(p,'lamp',{x:3.2});expect(worsensRequiredConstraints(p,closer)).toBe(true);
 });
 it('finds a spacing improvement without introducing collisions',()=>{
  const p=rule(scene(),'floor-gap',2);const suggestion=suggestImprovement(p);expect(suggestion).not.toBeNull();const after={...p,furniture:suggestion!.furniture};expect(evaluateConstraints(after)[0].violation).toBeLessThan(evaluateConstraints(p)[0].violation);expect(analyze(after).placement).toEqual([]);expect(worsensRequiredConstraints(p,after)).toBe(false);
 });
 it('lets an overlapping estimated chair turn around without worsening its footprint',()=>{
  const p=scene();p.furniture[1]={...p.furniture[1],category:'chair',x:2.4,z:2};expect(placementIssues(p,p.furniture[1]).length).toBeGreaterThan(0);
  const turned=patchFurniture(p,'lamp',{rotation:Math.PI});expect(previewPlacementIssues(p,turned)).toEqual([]);
  const worsened=patchFurniture(p,'lamp',{x:2.2});expect(previewPlacementIssues(p,worsened).length).toBeGreaterThan(0);
 });
 it('rejects malformed anchor graphs in saved and original layouts before a view can crash',()=>{
  const p=scene();p.original[0].anchor={kind:'furniture',targetId:'absent',offset:{x:0,y:0,z:0},yaw:0};expect(()=>validateProject(p)).toThrow();
  p.original=structuredClone(p.furniture);p.layouts=[{id:'bad',name:'Bad',createdAt:new Date().toISOString(),furniture:[{...p.furniture[0],anchor:{kind:'furniture',targetId:'table',offset:{x:0,y:0,z:0},yaw:0}}]}];expect(()=>validateProject(p)).toThrow();
 });
 it('keeps overhead layouts provisional until room height has been reviewed',()=>{
 const p=scene();p.room.confirmedWidth=p.room.confirmedDepth=true;p.room.confirmedHeight=false;p.room.boundaryStatus='confirmed';p.room.doors[0].confirmed=true;p.room.doors[0].swing='outward';p.furniture[1].elevation=2;
 expect(analyze(p).provisional).toBe(true);p.room.confirmedHeight=true;expect(analyze(p).provisional).toBe(false);
 });
 it('allows only bounded declarative geometry in custom models',()=>{
  const model={version:1,parts:[{shape:'box',size:[1,.2,1],position:[0,.1,0],color:'#aa8866'}]};expect(customModelSchema.safeParse(model).success).toBe(true);
  expect(customModelSchema.safeParse({...model,script:'alert(1)'}).success).toBe(false);
  expect(customModelSchema.safeParse({...model,parts:[{...model.parts[0],position:[1,.1,0]}]}).success).toBe(false);
  expect(customModelSchema.safeParse({...model,parts:Array(49).fill(model.parts[0])}).success).toBe(false);
 });
});
