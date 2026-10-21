import type { Furniture, FurnitureAnchor, Project } from './model';
export const elevation = (item: Furniture) => item.elevation ?? 0;
const rotate = (x: number, z: number, angle: number) => ({ x: x * Math.cos(angle) - z * Math.sin(angle), z: x * Math.sin(angle) + z * Math.cos(angle) });
function frame(project: Project, item: Furniture, lookup: (id: string) => Furniture) {
  const anchor = item.anchor!;
  if (anchor.kind === 'furniture') { const parent = lookup(anchor.targetId!); return { x: parent.x, y: elevation(parent) + parent.height, z: parent.z, yaw: parent.rotation }; }
  if (anchor.kind === 'ceiling') return { x: project.room.width / 2, y: project.room.height - item.height, z: project.room.depth / 2, yaw: 0 };
  if (anchor.kind === 'point') return { ...anchor.point!, yaw: 0 };
  const wall = anchor.wall!;
  return { x: wall === 'west' ? 0 : wall === 'east' ? project.room.width : project.room.width / 2, z: wall === 'north' ? 0 : wall === 'south' ? project.room.depth : project.room.depth / 2, y: 0, yaw: wall === 'north' ? 0 : wall === 'south' ? Math.PI : wall === 'west' ? -Math.PI / 2 : Math.PI / 2 };
}
const wallInset = (item: Furniture) => item.anchor?.kind === 'wall' ? Math.abs(Math.sin(item.anchor.yaw)) * item.width / 2 + Math.abs(Math.cos(item.anchor.yaw)) * item.depth / 2 : 0;
export function resolveAnchors(project: Project): Project {
  if (!project.furniture.some(item => item.anchor)) return project;
  const source = new Map([...project.room.fixedObstacles, ...project.furniture].map(item => [item.id, item]));
  const resolved = new Map<string, Furniture>(); const visiting = new Set<string>();
  const resolve = (id: string): Furniture => {
    if (resolved.has(id)) return resolved.get(id)!;
    const item = source.get(id); if (!item || visiting.has(id)) throw new Error('The furniture anchor is missing or cyclic.');
    visiting.add(id); let result = item;
    if (item.anchor) {
      const origin = frame(project, item, resolve); const offset = rotate(item.anchor.offset.x, item.anchor.offset.z + wallInset(item), origin.yaw);
      result = { ...item, x: origin.x + offset.x, z: origin.z + offset.z, elevation: origin.y + item.anchor.offset.y, rotation: origin.yaw + item.anchor.yaw };
    }
    visiting.delete(id); resolved.set(id, result); return result;
  };
  return { ...project, furniture: project.furniture.map(item => resolve(item.id)) };
}
export function anchorForPose(project: Project, item: Furniture): FurnitureAnchor {
  const origin = frame(project, item, id => project.furniture.find(f => f.id === id) ?? project.room.fixedObstacles.find(f => f.id === id)!);
  const yaw = item.rotation - origin.yaw;
  const local = rotate(item.x - origin.x, item.z - origin.z, -origin.yaw);
  const shaped = { ...item, anchor: { ...item.anchor!, yaw } };
  return { ...item.anchor!, yaw, offset: { x: local.x, y: elevation(item) - origin.y, z: local.z - wallInset(shaped) } };
}
export function patchFurniture(project: Project, id: string, patch: Partial<Furniture>): Project {
  const item = project.furniture.find(f => f.id === id); if (!item) return project;
  let next = { ...item, ...patch };
  if (item.anchor && !('anchor' in patch) && ['x', 'z', 'rotation', 'elevation'].some(key => key in patch)) next = { ...next, anchor: anchorForPose(project, next) };
  return resolveAnchors({ ...project, furniture: project.furniture.map(f => f.id === id ? next : f) });
}
export function attachFurniture(project: Project, item: Furniture, kind: FurnitureAnchor['kind'], targetId?: string, wall: FurnitureAnchor['wall'] = 'north'): FurnitureAnchor {
  const anchor: FurnitureAnchor = { kind, targetId, wall, point: { x: item.x, y: elevation(item), z: item.z }, offset: { x: 0, y: 0, z: 0 }, yaw: 0 };
  const candidate = { ...item, anchor };
  const preserved = anchorForPose(project, candidate);
  if (kind === 'furniture' || kind === 'ceiling') preserved.offset.y = 0;
  if (kind === 'furniture') {preserved.offset.x=0;preserved.offset.z=0;}
  if (kind === 'wall') preserved.offset.z = 0;
  return preserved;
}
export function detachMissingReferences(project: Project): Project {
  const ids = new Set([...project.furniture, ...project.room.fixedObstacles].map(item => item.id));
  return { ...project, furniture: project.furniture.map(item => item.anchor?.kind === 'furniture' && !ids.has(item.anchor.targetId!) ? { ...item, anchor: undefined } : item), constraints: project.constraints?.filter(rule => ids.has(rule.firstId) && ids.has(rule.secondId)) };
}
export function anchorPoint(project: Project, item: Furniture) {
  if (!item.anchor) return null;
  const origin = frame(project, item, id => project.furniture.find(f => f.id === id) ?? project.room.fixedObstacles.find(f => f.id === id)!);
  return { x: origin.x, y: item.anchor.kind === 'ceiling' ? project.room.height : origin.y, z: origin.z };
}
