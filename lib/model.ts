import { z } from 'zod';
import { resolveAnchors } from './anchors';

const finite = z.number().finite();
const id = z.string().trim().min(1).max(100);
const provenance = z.enum(['estimated', 'confirmed', 'category']);
export const pointSchema = z.object({ x: finite.min(-50).max(50), z: finite.min(-50).max(50) });
export type Point = z.infer<typeof pointSchema>;
export type Provenance = z.infer<typeof provenance>;
const vector3 = z.object({ x: finite.min(-50).max(50), y: finite.min(-10).max(10), z: finite.min(-50).max(50) });
export const anchorSchema = z.object({ kind: z.enum(['furniture', 'wall', 'ceiling', 'point']), targetId: id.optional(), wall: z.enum(['north', 'east', 'south', 'west']).optional(), point: vector3.optional(), offset: vector3, yaw: finite.min(-1000).max(1000) });
export const customModelSchema = z.object({ version: z.literal(1), parts: z.array(z.object({ shape: z.enum(['box', 'cylinder', 'sphere', 'cone']), size: z.tuple([finite.min(.001).max(1), finite.min(.001).max(1), finite.min(.001).max(1)]), position: z.tuple([finite.min(-.5).max(.5), finite.min(0).max(1), finite.min(-.5).max(.5)]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict()).min(1).max(48) }).strict().superRefine((model, ctx) => {
  model.parts.forEach((part, index) => { if (part.position.some((p, axis) => p - part.size[axis] / 2 < (axis === 1 ? 0 : -.5) - .001 || p + part.size[axis] / 2 > (axis === 1 ? 1 : .5) + .001)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index], message: 'Model parts must fit inside the declared furniture bounds.' }); });
});
export type CustomModel = z.infer<typeof customModelSchema>;
export type FurnitureAnchor = z.infer<typeof anchorSchema>;
export const furnitureSchema = z.object({
  id,
  label: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(60),
  width: finite.min(0.05).max(20), depth: finite.min(0.05).max(20), height: finite.min(0.05).max(8),
  x: finite.min(-30).max(50), z: finite.min(-30).max(50), rotation: finite.min(-1000).max(1000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), movable: z.boolean(), locked: z.boolean(),
  provenance,
  dimensionProvenance: provenance.optional(), placementProvenance: provenance.optional(),
  evidencePhotoIds: z.array(id).max(32),
  elevation: finite.min(0).max(8).optional(),
  anchor: anchorSchema.optional(),
  customModel: customModelSchema.optional(),
  product: z.object({ url: z.string().url().max(2000).refine(value => value.startsWith('https://'), 'Use an HTTPS product URL.'), title: z.string().max(180), dimensionSource: z.enum(['listed', 'estimated']), notes: z.array(z.string().max(500)).max(12) }).optional(),
});
export type Furniture = z.infer<typeof furnitureSchema>;
const wall = z.enum(['north', 'east', 'south', 'west']);
export const doorSchema = z.object({
  id, wall, position: finite.min(0).max(30), width: finite.min(0.2).max(5),
  hinge: z.enum(['start', 'end']), swing: z.enum(['inward', 'outward', 'unknown']), confirmed: z.boolean(),
});
export type Door = z.infer<typeof doorSchema>;
export const windowSchema = z.object({
  id, wall, position: finite.min(0).max(30), width: finite.min(0.1).max(10),
  height: finite.min(0.1).max(5), sillHeight: finite.min(0).max(5),
});
export type RoomWindow = z.infer<typeof windowSchema>;
export const roomSchema = z.object({
  hasCeiling: z.boolean().optional(), sunAzimuth: finite.min(-180).max(180).optional(),
  captureCameraHeight: finite.min(.3).max(3).optional(), cameraHeightSource: z.enum(['provided','default']).optional(),
  ergonomics: z.object({eyeHeight:finite.min(.6).max(2)}).optional(),
  width: finite.min(0.8).max(25), depth: finite.min(0.8).max(25), height: finite.min(1.5).max(8),
  boundary: z.array(pointSchema).min(3).max(24),
  boundaryStatus: z.enum(['estimated', 'confirmed', 'unsupported']).optional(),
  confirmedWidth: z.boolean(), confirmedDepth: z.boolean(), confirmedHeight: z.boolean().optional(),
  evidencePhotoIds: z.array(id).max(32).optional(),
  doors: z.array(doorSchema).max(12), windows: z.array(windowSchema).max(20),
  fixedObstacles: z.array(furnitureSchema).max(40),
});
export type Room = z.infer<typeof roomSchema>;
export const routeSchema = z.object({
  waypoints: z.array(pointSchema).max(18).optional(),
  id, name: z.string().trim().min(1).max(100), required: z.boolean(), start: pointSchema.optional(),
  destination: pointSchema, furnitureId: id.optional(), offset: pointSchema.optional(),
});
export type Route = z.infer<typeof routeSchema>;
export const profileSchema = z.object({
  width: finite.min(0.2).max(2), margin: finite.min(0).max(0.5), uncertainty: finite.min(0).max(0.5),
  turningDiameter: finite.min(0.3).max(3).nullable(), units: z.enum(['m', 'ft']),
  headroom: finite.min(.5).max(3).optional(),
});
export const distanceConstraintSchema = z.object({ id, name: z.string().trim().min(1).max(100), firstId: id, secondId: id, metric: z.enum(['floor-gap', 'center-3d']), min: finite.min(0).max(50), max: finite.min(0).max(50).nullable(), required: z.boolean() }).superRefine((rule, ctx) => { if (rule.firstId === rule.secondId || (rule.max !== null && rule.max < rule.min)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose different objects and a maximum at least as large as the minimum.' }); });
export type DistanceConstraint = z.infer<typeof distanceConstraintSchema>;
export type ConstraintResult = { id: string; name: string; distance: number; violation: number; satisfied: boolean; required: boolean };
export type MovementProfile = z.infer<typeof profileSchema>;
export const projectSchema = z.object({
  schemaVersion: z.literal(1), id, name: z.string().trim().min(1).max(120),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), source: z.enum(['photos', 'manual', 'demo']),
  photos: z.array(z.object({ id, name: z.string().max(240), dataUrl: z.string().max(12_000_000).optional() })).max(12),
  room: roomSchema, furniture: z.array(furnitureSchema).max(80), profile: profileSchema,
  routes: z.array(routeSchema).max(20), original: z.array(furnitureSchema).max(80),
  layouts: z.array(z.object({ id, name: z.string().trim().min(1).max(100), createdAt: z.string().datetime(), furniture: z.array(furnitureSchema).max(80) })).max(30),
  notes: z.array(z.string().max(2000)).max(100),
  constraints: z.array(distanceConstraintSchema).max(30).optional(),
  observations: z.array(z.object({ kind: z.enum(['uncertain', 'missing', 'contradiction']), message: z.string().max(2000), evidencePhotoIds: z.array(id).max(32) })).max(100).optional(),
  measurements: z.array(z.object({ targetId: id, dimension: z.enum(['width', 'depth', 'height', 'position']), value: finite.min(0).max(50), provenance, evidencePhotoIds: z.array(id).max(32) })).max(200).optional(),
}).superRefine((project, ctx) => {
  const unique = (values: { id: string }[], path: (string | number)[]) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, index, 'id'], message: 'IDs must be unique within a collection.' });
      seen.add(value.id);
    });
  };
  unique([...project.furniture, ...project.room.fixedObstacles], ['furniture']);
  unique(project.original, ['original']); unique(project.photos, ['photos']); unique(project.routes, ['routes']);
  unique([...project.room.doors, ...project.room.windows], ['room', 'doors']); unique(project.layouts, ['layouts']);
  project.layouts.forEach((layout, index) => unique(layout.furniture, ['layouts', index, 'furniture']));
  [...project.room.doors, ...project.room.windows].forEach((opening, index) => {
    const length = ['north', 'south'].includes(opening.wall) ? project.room.width : project.room.depth;
    if (opening.position - opening.width / 2 < -0.00001 || opening.position + opening.width / 2 > length + 0.00001) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['room', 'doors', index], message: 'The opening must fit on its wall.' });
    }
  });
  const furnitureIds = new Set(project.furniture.map(f => f.id));
  unique(project.constraints ?? [], ['constraints']);
  (project.constraints ?? []).forEach((rule, index) => { if (!furnitureIds.has(rule.firstId) || !furnitureIds.has(rule.secondId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['constraints', index], message: 'Distance rules must refer to existing furniture.' }); });
  project.room.fixedObstacles.forEach((item,index)=>{if(item.anchor)ctx.addIssue({code:z.ZodIssueCode.custom,path:['room','fixedObstacles',index,'anchor'],message:'Structural obstacles cannot be attached to furniture.'});});
  const checkAnchors=(items:Furniture[],path:(string|number)[])=>{
   const collection=new Map([...items,...project.room.fixedObstacles].map(item=>[item.id,item]));
   items.forEach((item,index)=>{
    if(project.room.fixedObstacles.some(f=>f.id===item.id))ctx.addIssue({code:z.ZodIssueCode.custom,path:[...path,index,'id'],message:'Furniture IDs cannot duplicate structural obstacles.'});
    const seen=new Set([item.id]);let current=item;
    while(current.anchor?.kind==='furniture'){
     const target=current.anchor.targetId;
     if(!target||!collection.has(target)||seen.has(target)){ctx.addIssue({code:z.ZodIssueCode.custom,path:[...path,index,'anchor'],message:'Furniture anchors need an existing parent and cannot form a cycle.'});break;}
     seen.add(target);current=collection.get(target)!;
    }
    if(item.anchor?.kind==='wall'&&!item.anchor.wall)ctx.addIssue({code:z.ZodIssueCode.custom,path:[...path,index,'anchor'],message:'Select a wall for this anchor.'});
    if(item.anchor?.kind==='point'&&!item.anchor.point)ctx.addIssue({code:z.ZodIssueCode.custom,path:[...path,index,'anchor'],message:'Specify the fixed anchor point.'});
   });
  };
  checkAnchors(project.furniture,['furniture']);checkAnchors(project.original,['original']);project.layouts.forEach((layout,index)=>checkAnchors(layout.furniture,['layouts',index,'furniture']));
  project.routes.forEach((route, index) => {
    if (route.furnitureId && !furnitureIds.has(route.furnitureId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['routes', index, 'furnitureId'], message: 'The associated furniture does not exist.' });
  });
  const photoIds = new Set(project.photos.map(photo => photo.id));
  [...project.furniture, ...project.room.fixedObstacles].forEach((furniture, index) => {
    if (furniture.evidencePhotoIds.some(photo => !photoIds.has(photo))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['furniture', index, 'evidencePhotoIds'], message: 'Evidence must refer to an included photo reference.' });
  });
  let area = 0;
  project.room.boundary.forEach((p, i, points) => { const next = points[(i + 1) % points.length]; area += p.x * next.z - next.x * p.z; });
  if (Math.abs(area) < 0.01) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['room', 'boundary'], message: 'Room boundary must enclose an area.' });
});
export type Project = z.infer<typeof projectSchema>;
export type Status = 'red' | 'amber' | 'green';
export type PlacementIssue = { kind: 'collision' | 'boundary' | 'doorway' | 'door-swing' | 'unsupported'; furnitureId: string; otherId?: string; message: string };
export type RouteResult = {
  id: string; name: string; required: boolean; status: Status; available: boolean;
  path: Point[]; length: number | null; minClearance: number | null; bottleneck: Point | null;
  reason: string; blockingFurnitureIds: string[]; provisional: boolean; turningClear: boolean | null;
};
export type Analysis = {
  status: Status; routes: RouteResult[]; placement: PlacementIssue[]; provisional: boolean;
  requiredAvailable: number; requiredTotal: number; summary: string; computedAt: number;
  constraints?: ConstraintResult[];
};
export type Suggestion = {
  furniture: Furniture[];
  moves: { id: string; label: string; from: Point; to: Point; distance: number; rotation: number }[];
  analysis: Analysis; reason: string;
};

/** Validates imported, provider-generated, or persisted scene data. Never accepts cached analysis. */
export function validateProject(value: unknown): Project { const parsed=projectSchema.parse(value); return parsed.furniture.some(item=>item.anchor)?projectSchema.parse(resolveAnchors(parsed)):parsed; }
export function cloneProject(project: Project): Project { return JSON.parse(JSON.stringify(project)) as Project; }
export function rectangleBoundary(width: number, depth: number): Point[] {
  return [{ x: 0, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }];
}
export function metersToDisplay(value: number, units: 'm' | 'ft'): number { return units === 'ft' ? value / 0.3048 : value; }
export function displayToMeters(value: number, units: 'm' | 'ft'): number { return units === 'ft' ? value * 0.3048 : value; }
export function formatLength(value: number, units: 'm' | 'ft' = 'm'): string { return `${metersToDisplay(value, units).toFixed(2)} ${units}`; }
