import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createDemo, createManual, DEMO_MOVE, improvedDemo } from '../lib/demo';
import { analyze, entranceAnchor, footprint, isSegmentNavigable, placementIssues, polygonsIntersect, resolveDestination, suggestImprovement } from '../lib/geometry';
import { rectangleBoundary, type Furniture, type Project } from '../lib/model';

function box(id: string, x: number, z: number, width = 1, depth = 1, rotation = 0): Furniture {
  return { id, label: id, category: 'cabinet', x, z, width, depth, rotation, height: 1, color: '#998877', movable: true, locked: false, provenance: 'confirmed', evidencePhotoIds: [] };
}
function corridor(gap: number): Project {
  const project = createManual(4, 5);
  project.room.confirmedWidth = project.room.confirmedDepth = true;
  project.room.doors[0] = { id: 'door', wall: 'south', position: 2, width: 1.5, hinge: 'start', swing: 'outward', confirmed: true };
  project.profile = { width: 0.8, margin: 0, uncertainty: 0, turningDiameter: null, units: 'm' };
  const side = (4 - gap) / 2;
  project.furniture = [box('left', side / 2, 2.5, side, 2.8), box('right', 4 - side / 2, 2.5, side, 2.8)];
  project.routes = [{ id: 'across', name: 'Across corridor', required: true, start: { x: 2, z: 4.5 }, destination: { x: 2, z: 0.5 } }];
  project.original = structuredClone(project.furniture);
  return project;
}

describe('authoritative rotated geometry', () => {
  it('distinguishes intersecting, touching, and separate furniture', () => {
    expect(polygonsIntersect(footprint(box('a', 2, 2)), footprint(box('b', 2.7, 2)))).toBe(true);
    expect(polygonsIntersect(footprint(box('a', 2, 2)), footprint(box('b', 3, 2)))).toBe(false);
    expect(polygonsIntersect(footprint(box('a', 2, 2)), footprint(box('b', 4, 2)))).toBe(false);
  });
  it('uses rotated footprints rather than overlapping axis-aligned bounds', () => {
    const first = box('a', 2, 2, 2, 0.2, Math.PI / 4);
    const parallel = box('b', 1.65, 2.35, 2, 0.2, Math.PI / 4);
    const crossing = box('c', 2, 2, 2, 0.2, -Math.PI / 4);
    expect(polygonsIntersect(footprint(first), footprint(parallel))).toBe(false);
    expect(polygonsIntersect(footprint(first), footprint(crossing))).toBe(true);
  });
  it('detects rotated corners outside the boundary', () => {
    const project = createDemo();
    expect(placementIssues(project, box('edge', 0.3, 0.6, 1, 1, Math.PI / 4)).some(issue => issue.kind === 'boundary')).toBe(true);
  });
  it('detects threshold obstruction separately from an inward door swing', () => {
    const project = createDemo();
    expect(placementIssues(project, box('threshold', 2.75, 4.98, 0.6, 0.5)).some(issue => issue.kind === 'doorway')).toBe(true);
    const issues = placementIssues(project, box('swing', 2.45, 4.35, 0.25, 0.25));
    expect(issues.some(issue => issue.kind === 'door-swing')).toBe(true);
    expect(issues.some(issue => issue.kind === 'doorway')).toBe(false);
  });
  it('renders the exact same footprint under Three.js negative Y rotation', () => {
    const furniture = box('rotated', 2.3, 1.8, 1.4, 0.7, 0.63);
    const plan = footprint(furniture);
    const corners = [[-0.7, -0.35], [0.7, -0.35], [0.7, 0.35], [-0.7, 0.35]];
    corners.forEach(([x, z], i) => {
      const mesh = new Vector3(x, 0, z).applyAxisAngle(new Vector3(0, 1, 0), -furniture.rotation).add(new Vector3(furniture.x, 0, furniture.z));
      expect(plan[i].x).toBeCloseTo(mesh.x, 10); expect(plan[i].z).toBeCloseTo(mesh.z, 10);
    });
  });
});

describe('conservative route analysis', () => {
  it('rejects a corridor below the envelope and accepts one just above it', () => {
    expect(analyze(corridor(0.79)).routes[0].available).toBe(false);
    const above = analyze(corridor(0.82)).routes[0];
    expect(above.available).toBe(true);
    expect(above.status).toBe('amber');
    expect(above.minClearance).toBeGreaterThanOrEqual(0.8);
  });
  it('never cuts between diagonally touching obstacles', () => {
    const project = createManual(4, 4);
    project.room.boundary = rectangleBoundary(4, 4);
    project.profile = { width: 0.2, margin: 0, uncertainty: 0, turningDiameter: null, units: 'm' };
    project.furniture = [box('north-east', 3, 1, 2, 2), box('south-west', 1, 3, 2, 2)];
    project.routes = [{ id: 'diagonal', name: 'Diagonal', required: true, start: { x: 0.7, z: 0.7 }, destination: { x: 3.3, z: 3.3 } }];
    expect(analyze(project).routes[0].available).toBe(false);
    expect(isSegmentNavigable(project, { x: 1, z: 1 }, { x: 3, z: 3 }, 0.1)).toBe(false);
  });
  it('validates smoothed path segments around a rotated obstacle', () => {
    const project = createManual(5, 5);
    project.profile = { width: 0.6, margin: 0, uncertainty: 0, turningDiameter: null, units: 'm' };
    project.furniture = [box('diagonal-table', 2.5, 2.5, 2, 0.8, Math.PI / 4)];
    project.routes = [{ id: 'around', name: 'Around table', required: true, start: { x: 0.7, z: 4.3 }, destination: { x: 4.3, z: 0.7 } }];
    const route = analyze(project).routes[0];
    expect(route.available).toBe(true);
    expect(route.path.length).toBeGreaterThan(2);
    route.path.slice(1).forEach((point, i) => expect(isSegmentNavigable(project, route.path[i], point)).toBe(true));
  });
  it('computes the bundled red-to-green move without special-case logic', () => {
    const project = createDemo(), before = analyze(project);
    expect(before.status).toBe('red'); expect(before.requiredAvailable).toBe(1); expect(before.requiredTotal).toBe(2);
    const blocked = before.routes.find(route => route.id === 'desk-route')!;
    expect(blocked.blockingFurnitureIds).toContain('coffee-table');
    project.furniture = project.furniture.map(f => f.id === DEMO_MOVE.id ? { ...f, ...DEMO_MOVE } : f);
    const after = analyze(project);
    expect(after.status).toBe('green'); expect(after.requiredAvailable).toBe(2);
    for (const route of after.routes) {
      expect(route.path.length).toBeGreaterThan(1);
      for (let i = 1; i < route.path.length; i++) expect(isSegmentNavigable(project, route.path[i - 1], route.path[i])).toBe(true);
    }
    expect(project.original.find(f => f.id === DEMO_MOVE.id)?.x).toBe(2.9);
  });
  it('keeps selected placement, clear routes, and overall room status separate', () => {
    const project = createDemo(), result = analyze(project);
    expect(placementIssues(project, project.furniture.find(f => f.id === 'desk')!)).toEqual([]);
    expect(result.routes.find(route => route.id === 'seating-route')?.status).toBe('green');
    expect(result.routes.find(route => route.id === 'desk-route')?.status).toBe('red');
    expect(result.status).toBe('red');
  });
  it('never paints invalid start and destination anchors green', () => {
    const project = improvedDemo();
    project.routes = [{ id: 'invalid-start', name: 'Invalid start', required: true, start: { x: -0.2, z: 2 }, destination: { x: 3, z: 1 } }];
    expect(analyze(project).routes[0].reason).toContain('start anchor');
    project.routes[0].start = entranceAnchor(project); project.routes[0].destination = { x: 9, z: 9 };
    expect(analyze(project).routes[0].status).toBe('red');
    expect(analyze(project).routes[0].reason).toContain('destination');
  });
  it('checks the entrance width separately from interior connectivity', () => {
    const project = improvedDemo(); project.room.doors[0].width = 0.7;
    expect(analyze(project).requiredAvailable).toBe(0);
    expect(analyze(project).routes[0].reason).toContain('entrance is');
  });
  it('includes the entrance in the reported route bottleneck clearance', () => {
    const project=improvedDemo();project.room.doors[0].width=.95;
    const result=analyze(project);
    expect(result.requiredAvailable).toBe(2);
    for(const route of result.routes)expect(route.minClearance).toBeLessThanOrEqual(.95);
  });
  it('marks estimates provisional without discarding computed routes', () => {
    const project = improvedDemo(); project.furniture[0].provenance = 'estimated';
    const result = analyze(project);
    expect(result.status).toBe('amber'); expect(result.provisional).toBe(true); expect(result.requiredAvailable).toBe(2);
  });
  it('checks enabled stationary turning circles in addition to connectivity', () => {
    const project = improvedDemo(); project.profile.turningDiameter = 2.8;
    const result = analyze(project);
    expect(result.routes.some(route => route.turningClear === false)).toBe(true);
    expect(result.status).toBe('red');
  });
  it('follows a furniture-local approach offset through translation and rotation', () => {
    const project = createDemo(), route = project.routes[0], desk = project.furniture.find(f => f.id === 'desk')!;
    desk.x = 3; desk.z = 2; desk.rotation = Math.PI / 2;
    const point = resolveDestination(project, route);
    expect(point.x).toBeCloseTo(2.4); expect(point.z).toBeCloseTo(0.45);
  });
  it('treats unsupported boundaries as provisional, including clear empty rooms', () => {
    const project = createManual(5, 5);
    project.room.boundary = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 4, z: 5 }, { x: 0, z: 5 }];
    const result = analyze(project);
    expect(result.status).toBe('amber'); expect(result.placement.some(i => i.kind === 'unsupported')).toBe(true);
  });
  it('revalidates a bounded improvement and preserves the original snapshot', () => {
    const project = createDemo(), original = JSON.stringify(project.original);
    const suggestion = suggestImprovement(project);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.analysis.requiredAvailable).toBe(2);
    expect(suggestion!.analysis.placement).toEqual([]);
    expect(suggestion!.moves.some(move => move.id === 'shelf')).toBe(false);
    expect(JSON.stringify(project.original)).toBe(original);
    expect(project.furniture.find(f => f.id === 'coffee-table')?.x).toBe(2.9);
  }, 20_000);
  it('does not suggest moving any locked or fixed objects', () => {
    const project = createDemo(); project.furniture = project.furniture.map(f => ({ ...f, locked: true }));
    expect(suggestImprovement(project)).toBeNull();
  });
});
