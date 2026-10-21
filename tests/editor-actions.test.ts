import { describe, expect, it } from 'vitest';
import { createDemo } from '../lib/demo';
import { toggleFurnitureLock, restoreFurnitureLayout } from '../lib/editor-actions';
import { exportProject, importProject } from '../lib/persistence';
import { placementIssues, resolveDestination } from '../lib/geometry';
import { validateProject } from '../lib/model';

describe('review regressions: mobility and restored layouts', () => {
  it('unlocks initially fixed furniture for valid movement', () => {
    const project=createDemo(), shelf=project.furniture.find(item=>item.id==='shelf')!;
    expect(shelf).toMatchObject({locked:true,movable:false});
    const unlocked={...shelf,...toggleFurnitureLock(shelf),z:3.5};
    expect(unlocked).toMatchObject({locked:false,movable:true});
    expect(placementIssues(project,unlocked)).toEqual([]);
    project.furniture=project.furniture.map(item=>item.id===shelf.id?unlocked:item);
    expect(importProject(exportProject(project)).furniture.find(item=>item.id==='shelf')?.z).toBe(3.5);
  });
  it('relocks furniture without permanently making it immovable', () => {
    const chair=createDemo().furniture.find(item=>item.id==='desk-chair')!;
    const locked={...chair,...toggleFurnitureLock(chair)};
    expect(locked.locked).toBe(true);
    expect({...locked,...toggleFurnitureLock(locked)}).toMatchObject({locked:false,movable:true});
  });
  it('restoring original objects retains a valid anchor for an added object route', () => {
    const project=createDemo();
    const added={...project.furniture[3],id:'added-chair',x:4,z:4,rotation:Math.PI/2};
    project.furniture.push(added);
    project.routes.push({id:'added-approach',name:'Added chair approach',required:true,furnitureId:added.id,offset:{x:0,z:.7},destination:{x:0,z:0}});
    const expected=resolveDestination(project,project.routes[2]);
    const original=JSON.stringify(project.original);
    const restored=restoreFurnitureLayout(project,project.original);
    expect(()=>validateProject(restored)).not.toThrow();
    expect(restored.routes[2].furnitureId).toBeUndefined();
    expect(restored.routes[2].destination).toEqual(expected);
    expect(JSON.stringify(restored.original)).toBe(original);
    expect(importProject(exportProject(restored)).routes).toEqual(restored.routes);
  });
  it('named layout restoration does not keep dangling object associations or alias snapshots', () => {
    const project=createDemo(), furniture=project.furniture.filter(item=>item.id!=='desk');
    const restored=restoreFurnitureLayout(project,furniture);
    expect(restored.routes[0].furnitureId).toBeUndefined();
    expect(()=>validateProject(restored)).not.toThrow();
    restored.furniture[0].x=4;
    expect(project.furniture[0].x).toBe(1.05);
    expect(furniture[0].x).toBe(1.05);
  });
});
