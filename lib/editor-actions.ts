import { cloneProject, type Furniture, type Project } from './model';
import { resolveDestination } from './geometry';

/** Unlock is an explicit request to allow this furniture to move. Structural
 * obstacles in room.fixedObstacles are intentionally outside this action. */
export function toggleFurnitureLock(furniture: Furniture): Pick<Furniture, 'locked' | 'movable'> {
  return furniture.locked || !furniture.movable
    ? { locked: false, movable: true }
    : { locked: true, movable: furniture.movable };
}

/** Restore object snapshots while preserving valid user destinations. A route
 * whose associated object is absent becomes a floor anchor at its last position. */
export function restoreFurnitureLayout(project: Project, furniture: Furniture[]): Project {
  const next = cloneProject(project);
  next.furniture = JSON.parse(JSON.stringify(furniture)) as Furniture[];
  const ids = new Set(next.furniture.map(item => item.id));
  next.routes = project.routes.map(route => {
    if (!route.furnitureId || ids.has(route.furnitureId)) return { ...route };
    const { furnitureId: _id, offset: _offset, ...independent } = route;
    return { ...independent, destination: resolveDestination(project, route) };
  });
  return next;
}
