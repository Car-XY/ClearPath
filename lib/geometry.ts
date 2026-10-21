import type { Analysis, Door, Furniture, PlacementIssue, Point, Project, Room, Route, RouteResult, Suggestion } from './model';
import { resolveAnchors, elevation, patchFurniture } from './anchors';
export type { Analysis, PlacementIssue, RouteResult, Suggestion } from './model';

export const GRID_SIZE = 0.05;
const EPS = 1e-7;
const sq = (n: number) => n * n;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

/** Positive rotation is counterclockwise in the X/Z plan. Three.js uses -rotation on its Y axis. */
export function footprint(f: Furniture): Point[] {
  const c = Math.cos(f.rotation), s = Math.sin(f.rotation);
  return [[-f.width / 2, -f.depth / 2], [f.width / 2, -f.depth / 2], [f.width / 2, f.depth / 2], [-f.width / 2, f.depth / 2]].map(([x, z]) => ({ x: f.x + x * c - z * s, z: f.z + x * s + z * c }));
}

/** SAT for convex polygons. Shared edges are permitted; intersecting interiors are not. */
export function polygonsIntersect(a: Point[], b: Point[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const axis = { x: q.z - p.z, z: p.x - q.x };
      const aProjection = a.map(v => v.x * axis.x + v.z * axis.z);
      const bProjection = b.map(v => v.x * axis.x + v.z * axis.z);
      if (Math.max(...aProjection) <= Math.min(...bProjection) + EPS || Math.max(...bProjection) <= Math.min(...aProjection) + EPS) return false;
    }
  }
  return true;
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const denominator = sq(b.x - a.x) + sq(b.z - a.z);
  const t = denominator < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / denominator));
  return Math.hypot(p.x - a.x - t * (b.x - a.x), p.z - a.z - t * (b.z - a.z));
}
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (pointSegmentDistance(p, a, b) < EPS) return true;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
  if (((ac > EPS && ad < -EPS) || (ac < -EPS && ad > EPS)) && ((ca > EPS && cb < -EPS) || (ca < -EPS && cb > EPS))) return true;
  return (Math.abs(ac) < EPS && pointSegmentDistance(c, a, b) < EPS) || (Math.abs(ad) < EPS && pointSegmentDistance(d, a, b) < EPS) || (Math.abs(ca) < EPS && pointSegmentDistance(a, c, d) < EPS) || (Math.abs(cb) < EPS && pointSegmentDistance(b, c, d) < EPS);
}
function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  return segmentsIntersect(a, b, c, d) ? 0 : Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
function polygonDistance(p: Point, polygon: Point[]): number {
  let result = Infinity;
  for (let i = 0; i < polygon.length; i++) result = Math.min(result, pointSegmentDistance(p, polygon[i], polygon[(i + 1) % polygon.length]));
  return result;
}
function segmentPolygonDistance(a: Point, b: Point, polygon: Point[], filled: boolean): number {
  if (filled && (pointInPolygon(a, polygon) || pointInPolygon(b, polygon))) return 0;
  let result = Infinity;
  for (let i = 0; i < polygon.length; i++) result = Math.min(result, segmentDistance(a, b, polygon[i], polygon[(i + 1) % polygon.length]));
  return result;
}
export function rectangularRoom(room: Room): boolean {
  if (room.boundaryStatus === 'unsupported') return false;
  if (room.boundary.length !== 4) return false;
  const corners = [{ x: 0, z: 0 }, { x: room.width, z: 0 }, { x: room.width, z: room.depth }, { x: 0, z: room.depth }];
  return corners.every(c => room.boundary.some(p => distance(p, c) < 0.001));
}

export function doorSegment(room: Room, door: Pick<Door, 'wall' | 'position' | 'width'>): [Point, Point] {
  const low = door.position - door.width / 2, high = door.position + door.width / 2;
  if (door.wall === 'north') return [{ x: low, z: 0 }, { x: high, z: 0 }];
  if (door.wall === 'south') return [{ x: low, z: room.depth }, { x: high, z: room.depth }];
  if (door.wall === 'west') return [{ x: 0, z: low }, { x: 0, z: high }];
  return [{ x: room.width, z: low }, { x: room.width, z: high }];
}
function inwardNormal(door: Pick<Door, 'wall'>): Point {
  return door.wall === 'north' ? { x: 0, z: 1 } : door.wall === 'south' ? { x: 0, z: -1 } : door.wall === 'west' ? { x: 1, z: 0 } : { x: -1, z: 0 };
}
export function doorSwingPolygon(room: Room, door: Door): Point[] {
  if (door.swing === 'unknown') return [];
  const [start, end] = doorSegment(room, door), hinge = door.hinge === 'start' ? start : end, other = door.hinge === 'start' ? end : start;
  const normal = inwardNormal(door), direction = door.swing === 'inward' ? 1 : -1;
  const first = Math.atan2(other.z - hinge.z, other.x - hinge.x), last = Math.atan2(normal.z * direction, normal.x * direction);
  let delta = last - first;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const result = [hinge];
  // Circumscribe the true sweep so chord approximation cannot miss an obstruction.
  const radius = door.width / Math.cos(Math.abs(delta) / 40);
  for (let i = 0; i <= 20; i++) { const angle = first + delta * i / 20; result.push({ x: hinge.x + Math.cos(angle) * radius, z: hinge.z + Math.sin(angle) * radius }); }
  return result;
}
export function entranceAnchor(project: Project): Point {
  const door = project.room.doors[0];
  if (!door) return { x: project.room.width / 2, z: project.room.depth - movementRadius(project) - 0.12 };
  const [a, b] = doorSegment(project.room, door), normal = inwardNormal(door), inset = movementRadius(project) + 0.13;
  return { x: (a.x + b.x) / 2 + normal.x * inset, z: (a.z + b.z) / 2 + normal.z * inset };
}
export function resolveDestination(project: Project, route: Route): Point {
  const furniture = route.furnitureId ? project.furniture.find(f => f.id === route.furnitureId) : undefined;
  if (!furniture || !route.offset) return route.destination;
  const c = Math.cos(furniture.rotation), s = Math.sin(furniture.rotation);
  return { x: furniture.x + route.offset.x * c - route.offset.z * s, z: furniture.z + route.offset.x * s + route.offset.z * c };
}
export function movementRadius(project: Project): number { return project.profile.width / 2 + project.profile.margin + project.profile.uncertainty; }

export function placementIssues(project: Project, furniture: Furniture): PlacementIssue[] {
  const result: PlacementIssue[] = [], polygon = footprint(furniture);
  if (elevation(furniture) < -EPS || elevation(furniture) + furniture.height > project.room.height + EPS) result.push({kind:'boundary',furnitureId:furniture.id,message:`${furniture.label} crosses the floor or ceiling.`});
  if (!polygon.every(p => pointInPolygon(p, project.room.boundary))) result.push({ kind: 'boundary', furnitureId: furniture.id, message: `${furniture.label} crosses the room boundary.` });
  // Rectangular rooms are supported; retain unsupported estimates for boundary correction.
  if (!rectangularRoom(project.room)) result.push({ kind: 'unsupported', furnitureId: furniture.id, message: 'Confirm a rectangular room boundary before relying on route checks.' });
  for (const other of [...project.furniture, ...project.room.fixedObstacles]) {
    if (other.id !== furniture.id && elevation(furniture) < elevation(other) + other.height - EPS && elevation(other) < elevation(furniture) + furniture.height - EPS && polygonsIntersect(polygon, footprint(other))) result.push({ kind: 'collision', furnitureId: furniture.id, otherId: other.id, message: `${furniture.label} overlaps ${other.label}.` });
  }
  for (const door of project.room.doors) {
    if (elevation(furniture) >= (project.profile.headroom ?? 2)) continue;
    const [a, b] = doorSegment(project.room, door), normal = inwardNormal(door), depth = 0.14;
    const threshold = [a, b, { x: b.x + normal.x * depth, z: b.z + normal.z * depth }, { x: a.x + normal.x * depth, z: a.z + normal.z * depth }];
    if (polygonsIntersect(polygon, threshold)) result.push({ kind: 'doorway', furnitureId: furniture.id, otherId: door.id, message: `${furniture.label} obstructs the doorway.` });
    const swing = doorSwingPolygon(project.room, door);
    if (swing.length && door.swing === 'inward' && polygonsIntersect(polygon, swing)) result.push({ kind: 'door-swing', furnitureId: furniture.id, otherId: door.id, message: `${furniture.label} blocks the door swing.` });
  }
  return result;
}

type Obstacle = { item: Furniture; c: number; s: number; polygon: Point[] };
type World = { room: Room; obstacles: Obstacle[]; rectangular: boolean };
function makeWorld(project: Project, omit?: string): World {
  return { room: project.room, rectangular: rectangularRoom(project.room), obstacles: [...project.furniture, ...project.room.fixedObstacles].filter(f => f.id !== omit && elevation(f) < (project.profile.headroom ?? 2) - EPS).map(item => ({ item, c: Math.cos(item.rotation), s: Math.sin(item.rotation), polygon: footprint(item) })) };
}
function obstacleDistance(point: Point, obstacle: Obstacle): number {
  const dx = point.x - obstacle.item.x, dz = point.z - obstacle.item.z;
  const x = Math.abs(dx * obstacle.c + dz * obstacle.s) - obstacle.item.width / 2;
  const z = Math.abs(-dx * obstacle.s + dz * obstacle.c) - obstacle.item.depth / 2;
  return Math.hypot(Math.max(0, x), Math.max(0, z));
}
function clearance(world: World, point: Point): number {
  if (!pointInPolygon(point, world.room.boundary)) return -1;
  let result = world.rectangular ? Math.min(point.x, point.z, world.room.width - point.x, world.room.depth - point.z) : polygonDistance(point, world.room.boundary);
  for (const obstacle of world.obstacles) result = Math.min(result, obstacleDistance(point, obstacle));
  return result;
}
function segmentClearance(world: World, a: Point, b: Point): number {
  if (!pointInPolygon(a, world.room.boundary) || !pointInPolygon(b, world.room.boundary)) return -1;
  let result = world.rectangular ? Math.min(a.x, a.z, world.room.width - a.x, world.room.depth - a.z, b.x, b.z, world.room.width - b.x, world.room.depth - b.z) : segmentPolygonDistance(a, b, world.room.boundary, false);
  for (const obstacle of world.obstacles) result = Math.min(result, segmentPolygonDistance(a, b, obstacle.polygon, true));
  return result;
}
export function isPointNavigable(project: Project, point: Point, radius = 0.2): boolean { return clearance(makeWorld(project), point) + EPS >= radius; }
/** Continuous swept-disc check, also used after path smoothing. */
export function isSegmentNavigable(project: Project, a: Point, b: Point, radius = movementRadius(project)): boolean { return segmentClearance(makeWorld(project), a, b) + EPS >= radius; }

class MinHeap {
  private nodes: { index: number; priority: number }[] = [];
  get length() { return this.nodes.length; }
  push(index: number, priority: number) {
    const item = { index, priority }; let i = this.nodes.length; this.nodes.push(item);
    while (i > 0) { const parent = (i - 1) >> 1; if (this.nodes[parent].priority <= priority) break; this.nodes[i] = this.nodes[parent]; i = parent; }
    this.nodes[i] = item;
  }
  pop(): number {
    const first = this.nodes[0], last = this.nodes.pop()!;
    if (this.nodes.length) {
      let i = 0;
      while (i * 2 + 1 < this.nodes.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.nodes.length && this.nodes[child + 1].priority < this.nodes[child].priority) child++;
        if (this.nodes[child].priority >= last.priority) break;
        this.nodes[i] = this.nodes[child]; i = child;
      }
      this.nodes[i] = last;
    }
    return first.index;
  }
}
type Grid = { width: number; depth: number; free: Uint8Array; world: World; radius: number; conservative: boolean };
function createGrid(world: World, radius: number, conservative = true): Grid {
  const width = Math.ceil(world.room.width / GRID_SIZE) + 1, depth = Math.ceil(world.room.depth / GRID_SIZE) + 1;
  const free = new Uint8Array(width * depth), conservativeRadius = radius + (conservative ? GRID_SIZE * Math.SQRT2 / 2 : 0);
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const point = { x: x * GRID_SIZE, z: z * GRID_SIZE };
    if (world.rectangular && Math.min(point.x, point.z, world.room.width - point.x, world.room.depth - point.z) < conservativeRadius) continue;
    let available = world.rectangular || clearance(world, point) >= conservativeRadius;
    if (world.rectangular) for (const obstacle of world.obstacles) if (obstacleDistance(point, obstacle) < conservativeRadius - EPS) { available = false; break; }
    if (available) free[z * width + x] = 1;
  }
  return { width, depth, free, world, radius, conservative };
}
function nodePoint(grid: Grid, index: number): Point { return { x: (index % grid.width) * GRID_SIZE, z: Math.floor(index / grid.width) * GRID_SIZE }; }
function anchorNode(grid: Grid, anchor: Point): number | null {
  if (clearance(grid.world, anchor) < grid.radius - EPS) return null;
  const gx = Math.round(anchor.x / GRID_SIZE), gz = Math.round(anchor.z / GRID_SIZE);
  let nearest: number | null = null, nearestDistance = Infinity;
  for (let z = gz - 3; z <= gz + 3; z++) for (let x = gx - 3; x <= gx + 3; x++) {
    if (x < 0 || x >= grid.width || z < 0 || z >= grid.depth) continue;
    const index = z * grid.width + x;
    if (!grid.free[index]) continue;
    const point = nodePoint(grid, index), d = distance(point, anchor);
    if (d < nearestDistance && segmentClearance(grid.world, point, anchor) >= grid.radius - EPS) { nearest = index; nearestDistance = d; }
  }
  return nearest;
}
function findPath(grid: Grid, start: Point, end: Point): Point[] | null {
  const first = anchorNode(grid, start), last = anchorNode(grid, end);
  if (first === null || last === null) return null;
  const scores = new Float64Array(grid.free.length).fill(Infinity), parent = new Int32Array(grid.free.length).fill(-1), closed = new Uint8Array(grid.free.length), heap = new MinHeap();
  const lastX = last % grid.width, lastZ = Math.floor(last / grid.width);
  scores[first] = 0; heap.push(first, 0);
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const current = heap.pop(); if (closed[current]) continue;
    if (current === last) {
      const points: Point[] = []; let at = last;
      while (at !== -1) { points.push(nodePoint(grid, at)); at = parent[at]; }
      points.reverse(); points.unshift(start); points.push(end);
      // Every simplified segment receives a continuous swept-envelope test.
      const simplified = [points[0]]; let i = 0;
      while (i < points.length - 1) {
        let next = i + 1;
        for (let j = points.length - 1; j > i + 1; j--) if (segmentClearance(grid.world, points[i], points[j]) >= grid.radius + (grid.conservative ? GRID_SIZE * Math.SQRT2 / 2 : 0.001) - EPS) { next = j; break; }
        if (distance(simplified[simplified.length - 1], points[next]) > EPS) simplified.push(points[next]);
        i = next;
      }
      if (simplified.some((p, index) => index && segmentClearance(grid.world, simplified[index - 1], p) < grid.radius - EPS)) return null;
      return simplified;
    }
    closed[current] = 1;
    const x = current % grid.width, z = Math.floor(current / grid.width);
    for (const [dx, dz] of neighbors) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nx >= grid.width || nz < 0 || nz >= grid.depth) continue;
      const next = nz * grid.width + nx;
      if (!grid.free[next] || closed[next]) continue;
      // A diagonal edge is allowed only when both adjacent cardinal cells are free.
      if (dx && dz && (!grid.free[z * grid.width + nx] || !grid.free[nz * grid.width + x])) continue;
      if (!grid.conservative && segmentClearance(grid.world, nodePoint(grid, current), nodePoint(grid, next)) < grid.radius - EPS) continue;
      const score = scores[current] + (dx && dz ? Math.SQRT2 : 1);
      if (score + EPS < scores[next]) { scores[next] = score; parent[next] = current; heap.push(next, score + Math.hypot(nx - lastX, nz - lastZ)); }
    }
  }
  return null;
}

function provisional(project: Project): boolean {
  return ([...project.furniture,...project.room.fixedObstacles].some(f=>elevation(f)>0)&&!project.room.confirmedHeight) || !project.room.confirmedWidth || !project.room.confirmedDepth || project.room.boundaryStatus === 'estimated' || project.room.boundaryStatus === 'unsupported' || !project.room.doors.length || project.room.doors.some(d => !d.confirmed || d.swing === 'unknown') || [...project.furniture, ...project.room.fixedObstacles].some(f => f.provenance !== 'confirmed' || (f.dimensionProvenance && f.dimensionProvenance !== 'confirmed') || (f.placementProvenance && f.placementProvenance !== 'confirmed')) || !!project.observations?.some(o => o.kind === 'contradiction');
}
function blockedResult(route: Route, reason: string, estimated: boolean, blockingFurnitureIds: string[] = []): RouteResult {
  return { id: route.id, name: route.name, required: route.required, status: 'red', available: false, path: [], length: null, minClearance: null, bottleneck: null, reason, blockingFurnitureIds, provisional: estimated, turningClear: null };
}
function routeResult(project: Project, route: Route, grid: Grid, estimated: boolean, counterfactual: boolean): RouteResult {
  const start = route.start ?? entranceAnchor(project), destination = resolveDestination(project, route), radius = movementRadius(project);
  const entrance = project.room.doors[0];
  if (!route.start && entrance && entrance.width + EPS < radius * 2) return blockedResult(route, `The entrance is ${entrance.width.toFixed(2)} m wide; your travel envelope with margins needs ${(radius * 2).toFixed(2)} m.`, estimated);
  if (clearance(grid.world, start) < radius - EPS) return blockedResult(route, 'The entrance or start anchor is outside usable floor or lacks the selected clearance. Move or confirm it.', estimated, grid.world.obstacles.filter(o => obstacleDistance(start, o) < radius).map(o => o.item.id));
  if (clearance(grid.world, destination) < radius - EPS) return blockedResult(route, 'The destination is outside usable floor or inside the required clearance of an object. Move its approach marker.', estimated, grid.world.obstacles.filter(o => obstacleDistance(destination, o) < radius).map(o => o.item.id));
  // A narrow valid corridor can fall between conservative occupied cells. Retry with
  // exact swept-disc edge tests; every diagonal still requires its cardinal neighbors.
  const stops=[start,...(route.waypoints??[]),destination];
  for(let i=1;i<stops.length-1;i++)if(clearance(grid.world,stops[i])<radius-EPS)return blockedResult(route,`Stop ${i+1} lacks the selected floor clearance. Edit the route points.`,estimated,grid.world.obstacles.filter(o=>obstacleDistance(stops[i],o)<radius).map(o=>o.item.id));
  const connect=(primary:Grid)=>{
    const combined:Point[]=[];let exact:Grid|undefined;
    for(let i=1;i<stops.length;i++){
      const leg=findPath(primary,stops[i-1],stops[i])??findPath(exact??(exact=createGrid(primary.world,radius,false)),stops[i-1],stops[i]);
      if(!leg)return null;combined.push(...(i===1?leg:leg.slice(1)));
    }
    return combined;
  };
  const path = connect(grid);
  if (!path) {
    const blockers: string[] = [];
    if (counterfactual) {
      const candidates = grid.world.obstacles.filter(o => o.item.movable && !o.item.locked).sort((a, b) => pointSegmentDistance(a.item, start, destination) - pointSegmentDistance(b.item, start, destination)).slice(0, 8);
      for (const candidate of candidates) {
        const without = createGrid(makeWorld(project, candidate.item.id), radius);
        if (connect(without)) blockers.push(candidate.item.id);
      }
    }
    const labels = blockers.map(id => project.furniture.find(f => f.id === id)?.label).filter(Boolean);
    return blockedResult(route, labels.length ? `${labels.join(' or ')} blocks this route: removing its footprint restores a checked path. Try a different placement.` : 'No route meets the selected envelope within the 5 cm conservative grid. Check bottlenecks, anchors, and room measurements.', estimated, blockers);
  }
  let length = 0, minClearance = Infinity, bottleneck: Point = start;
  for (let i = 1; i < path.length; i++) {
    length += distance(path[i - 1], path[i]);
    const value = segmentClearance(grid.world, path[i - 1], path[i]);
    if (value < minClearance) {
      minClearance = value;
      // Locate the most constrained center point for a useful visible marker.
      const steps = Math.max(1, Math.ceil(distance(path[i - 1], path[i]) / 0.025)); let sampleMinimum = Infinity;
      for (let step = 0; step <= steps; step++) {
        const point = { x: path[i - 1].x + (path[i].x - path[i - 1].x) * step / steps, z: path[i - 1].z + (path[i].z - path[i - 1].z) * step / steps };
        const sample = clearance(grid.world, point); if (sample < sampleMinimum) { sampleMinimum = sample; bottleneck = point; }
      }
    }
  }
  if (!Number.isFinite(minClearance)) minClearance = clearance(grid.world, start);
  // The start anchor is inset from the threshold for grid navigation. Include
  // the doorway itself so a wide interior path cannot overstate its bottleneck.
  if (!route.start && entrance && entrance.width / 2 < minClearance) {
    minClearance = entrance.width / 2;
    bottleneck = start;
  }
  const turningClear = project.profile.turningDiameter === null ? null : clearance(grid.world, destination) + EPS >= project.profile.turningDiameter / 2 + project.profile.margin + project.profile.uncertainty;
  const marginal = minClearance * 2 < radius * 2 + 0.04;
  return {
    id: route.id, name: route.name, required: route.required, available: turningClear !== false,
    status: turningClear === false ? 'red' : estimated || marginal ? 'amber' : 'green', path,
    length: Math.round(length * 20) / 20, minClearance: Math.floor((minClearance * 2 + EPS) * 20) / 20,
    bottleneck, blockingFurnitureIds: [], provisional: estimated, turningClear,
    reason: turningClear === false ? 'A path exists, but the selected stationary turning circle does not fit at this destination.' : estimated ? 'A route meets the selected envelope. Confirm estimated dimensions and openings before relying on it.' : marginal ? 'A route exists, but clearance is close to your selected envelope.' : 'The route meets your selected clearance in the current model.',
  };
}

/** Floor-only ordered stops; A* chooses shortest 8-neighbor grid paths, then safely smooths each leg. */
export function planFloorRoute(project:Project,points:Point[]):RouteResult|null{
 if(points.length<2)return null;
 project=resolveAnchors(project);
 const route:Route={id:'floor-route-preview',name:'Drawn route',required:false,start:points[0],destination:points[points.length-1],waypoints:points.slice(1,-1)};
 return routeResult(project,route,createGrid(makeWorld(project),movementRadius(project)),provisional(project),false);
}

/** Deterministic floor geometry is authoritative; no renderer meshes or AI judgments are used. */
export function analyze(project: Project, options: { counterfactual?: boolean } = {}): Analysis {
  project = resolveAnchors(project);
  const constraints = evaluateConstraints(project);
  const estimated = provisional(project) || !rectangularRoom(project.room), placement: PlacementIssue[] = [];
  for (const furniture of [...project.furniture, ...project.room.fixedObstacles]) {
    for (const issue of placementIssues(project, furniture)) {
      if (issue.kind === 'collision' && placement.some(previous => previous.kind === 'collision' && previous.furnitureId === issue.otherId && previous.otherId === issue.furnitureId)) continue;
      placement.push(issue);
    }
  }
  if (!rectangularRoom(project.room) && !placement.some(i => i.kind === 'unsupported')) placement.push({ kind: 'unsupported', furnitureId: '', message: 'This boundary is not a supported rectangle. Correct the boundary before using route checks.' });
  const grid = createGrid(makeWorld(project), movementRadius(project));
  const routes = project.routes.map(route => routeResult(project, route, grid, estimated, options.counterfactual !== false));
  const required = routes.filter(route => route.required), requiredAvailable = required.filter(route => route.available).length;
  const red = placement.some(i => i.kind !== 'unsupported') || required.some(route => !route.available) || constraints.some(rule => rule.required && !rule.satisfied);
  const amber = constraints.some(rule => !rule.satisfied) || estimated || required.length === 0 || placement.some(i => i.kind === 'unsupported') || required.some(route => route.status === 'amber');
  const status = red ? 'red' : amber ? 'amber' : 'green';
  let summary = status === 'green' ? 'All required routes pass your selected checks.' : required.some(route => !route.available) ? `${required.length - requiredAvailable} required ${required.length - requiredAvailable === 1 ? 'route is' : 'routes are'} blocked.` : placement.some(i => i.kind !== 'unsupported') ? 'Resolve furniture placement problems.' : required.length === 0 ? 'Add a required destination to check your room routes.' : 'Routes are provisional until important estimates are confirmed.';
  if (placement.some(i => i.kind === 'unsupported')) summary = 'Confirm a rectangular boundary. Current route results are provisional.';
  if (constraints.some(rule => rule.required && !rule.satisfied)) summary = 'Resolve required distance constraints.';
  return { status, routes, placement, constraints, provisional: estimated || !rectangularRoom(project.room), requiredAvailable, requiredTotal: required.length, summary, computedAt: Date.now() };
}

/** Bounded one-object search. Every preview is revalidated with the editor's analysis engine. */
export function suggestImprovement(project: Project, options?:{penalty:(project:Project)=>number}): Suggestion | null {
  project = resolveAnchors(project);
  const baseline = analyze(project, { counterfactual: true });
  const score = (value: Analysis) => -(value.constraints ?? []).reduce((sum, rule) => sum + rule.violation * (rule.required ? 50000 : 100), 0) + value.placement.filter(i => i.kind !== 'unsupported').length * -10000 + value.requiredAvailable * 1000 + value.routes.filter(r => r.required && r.available).reduce((sum, r) => sum + Math.min(2, r.minClearance ?? 0) * 5, 0);
  const before = score(baseline)-(options?.penalty(project)??0)*30;
  const blockers = new Set([...baseline.routes.flatMap(route => route.blockingFurnitureIds),...(project.constraints??[]).filter(rule=>baseline.constraints?.some(result=>result.id===rule.id&&!result.satisfied)).flatMap(rule=>[rule.firstId,rule.secondId])]);
  const objects = project.furniture.filter(f => f.movable && !f.locked && !f.anchor).sort((a, b) => Number(blockers.has(b.id)) - Number(blockers.has(a.id)));
  let best: Suggestion | null = null, bestScore = before, evaluated = 0;
  const offsets: Point[] = [{x:0,z:0}];
  for (let radius = 0.5; radius <= 2.5; radius += 0.5) for (let direction = 0; direction < 8; direction++) offsets.push({ x: Math.cos(direction * Math.PI / 4) * radius, z: Math.sin(direction * Math.PI / 4) * radius });
  // Search restoration first; a healthy room needs no speculative rearrangement.
  if (baseline.status === 'green' && (!options || options.penalty(project)===0)) return null;
  for (const offset of offsets) {
    for (const furniture of objects) for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      if (++evaluated > 360) return best;
      const candidate = { ...furniture, x: Math.round((furniture.x + offset.x) * 20) / 20, z: Math.round((furniture.z + offset.z) * 20) / 20, rotation: furniture.rotation + angle };
      const proposed = patchFurniture(project, furniture.id, candidate);
      const changed = proposed.furniture.filter(item => { const old = project.furniture.find(f => f.id === item.id)!; return Math.hypot(item.x-old.x,item.z-old.z,elevation(item)-elevation(old))>.0001 || Math.abs(item.rotation-old.rotation)>.0001; });
      if (changed.some(item => placementIssues(proposed, item).some(issue => issue.kind !== 'unsupported'))) continue;
      if (worsensRequiredConstraints(project, proposed)) continue;
      const analysis = analyze(proposed, { counterfactual: false }), movement = distance(furniture, candidate);
      // Movement and rotation break ties only after placement and route restoration.
      if(options && (options.penalty(proposed)>options.penalty(project) || analysis.requiredAvailable<baseline.requiredAvailable))continue;
      const candidateScore = score(analysis) - (options?.penalty(proposed)??0)*30 - movement * 0.5 - Math.abs(angle) * 0.1;
      if (candidateScore > bestScore + 0.05) {
        bestScore = candidateScore;
        best = { furniture: proposed.furniture, moves: [{ id: furniture.id, label: furniture.label, from: { x: furniture.x, z: furniture.z }, to: { x: candidate.x, z: candidate.z }, distance: Math.round(movement * 20) / 20, rotation: angle }], analysis, reason: `${analysis.requiredAvailable} of ${analysis.requiredTotal} required routes available after moving ${furniture.label}. Each placement and route was checked geometrically.` };
        if (!(analysis.constraints ?? []).some(rule => !rule.satisfied) && analysis.requiredAvailable > baseline.requiredAvailable && analysis.requiredAvailable === analysis.requiredTotal && !analysis.placement.length && movement <= 1) return best;
      }
    }
  }
  return best;
}


/** Surface gap is horizontal footprint distance; center distance includes elevation. */
export function evaluateConstraints(project: Project): import('./model').ConstraintResult[] {
  return (project.constraints ?? []).map(rule => {
    const first = project.furniture.find(item => item.id === rule.firstId), second = project.furniture.find(item => item.id === rule.secondId);
    if (!first || !second) return {id:rule.id,name:rule.name,distance:0,violation:50,satisfied:false,required:rule.required};
    let gap: number;
    if (rule.metric === 'center-3d') gap = Math.hypot(first.x-second.x, first.z-second.z, elevation(first)+first.height/2-elevation(second)-second.height/2);
    else {
      const a=footprint(first),b=footprint(second);
      gap=polygonsIntersect(a,b)||pointInPolygon(a[0],b)||pointInPolygon(b[0],a)?0:Infinity;
      if(gap!==0)for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)gap=Math.min(gap,segmentDistance(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]));
    }
    const violation=Math.max(0,rule.min-gap,rule.max===null?0:gap-rule.max);
    return {id:rule.id,name:rule.name,distance:gap,violation,satisfied:violation<.005,required:rule.required};
  });
}
export function requiredConstraintPenalty(project: Project) { return evaluateConstraints(project).filter(rule=>rule.required).reduce((sum,rule)=>sum+rule.violation,0); }

/** No required rule may get worse, even if another rule improves. */
export function worsensRequiredConstraints(before: Project, after: Project) { const old=new Map(evaluateConstraints(before).map(rule=>[rule.id,rule.violation]));return evaluateConstraints(after).some(rule=>rule.required&&rule.violation>(old.get(rule.id)??0)+.005); }

/** Check a moving assembly while allowing correction of an already imperfect estimate. */
export function previewPlacementIssues(before: Project, after: Project): PlacementIssue[] {
 const changed=after.furniture.filter(item=>{const old=before.furniture.find(f=>f.id===item.id);return !old||Math.hypot(item.x-old.x,item.z-old.z,elevation(item)-elevation(old))>.00001||(['rotation','width','depth','height'] as const).some(key=>Math.abs(item[key]-old[key])>.00001);});
 const issues:PlacementIssue[]=[];
 for(const item of changed){
  const old=before.furniture.find(f=>f.id===item.id);
  const current=placementIssues(after,item).filter(issue=>issue.kind!=='unsupported');
  if(!current.length)continue;
  if(!old){issues.push(...current);continue;}
  const previous=placementIssues(before,old).filter(issue=>issue.kind!=='unsupported');
  const oldCorners=footprint(old),sameShape=footprint(item).every(point=>oldCorners.some(corner=>distance(point,corner)<.00001))&&Math.abs(elevation(item)-elevation(old))<.00001&&Math.abs(item.height-old.height)<.00001;
  if(sameShape)continue;
  const fresh=current.some(issue=>!previous.some(prior=>prior.kind===issue.kind&&prior.otherId===issue.otherId));
  if(elevation(item)<0||elevation(item)+item.height>after.room.height+EPS||fresh||current.length>=previous.length)issues.push(...current);
 }
 if(worsensRequiredConstraints(before,after))issues.push({kind:'collision',furnitureId:changed[0]?.id??'',message:'This move would worsen a required distance rule.'});
 return issues;
}
