import { cloneProject, rectangleBoundary, type Furniture, type Project } from './model';

const item = (id: string, label: string, category: string, width: number, depth: number, height: number, x: number, z: number, color: string, movable = true): Furniture => ({ id, label, category, width, depth, height, x, z, rotation: 0, color, movable, locked: !movable, provenance: 'confirmed', evidencePhotoIds: [] });

export const DEMO_MOVE = { id: 'coffee-table', x: 4.4, z: 4.0, rotation: 0 } as const;

/** Bundled fixture, deliberately measured in the model. It is never a photo reconstruction. */
export function createDemo(): Project {
  const now = new Date().toISOString();
  const furniture = [
    item('sofa', 'Linen sofa', 'sofa', 1.5, 2.3, 0.85, 1.05, 2.35, '#b8b6a3'),
    item('coffee-table', 'Coffee table', 'table', 1.8, 0.75, 0.43, 2.9, 2.55, '#b78559'),
    item('desk', 'Writing desk', 'desk', 1.8, 0.75, 0.76, 4.65, 0.6, '#b6a07e'),
    item('desk-chair', 'Desk chair', 'chair', 0.55, 0.55, 0.82, 4.65, 1.5, '#59746e'),
    item('shelf', 'Low bookcase', 'shelf', 1.8, 0.55, 1.05, 4.9, 2.55, '#997456', false),
  ];
  return {
    schemaVersion: 1, id: 'clearpath-sample', name: 'A little more room', createdAt: now, updatedAt: now, source: 'demo', photos: [],
    room: {
      width: 6, depth: 5, height: 2.65, boundary: rectangleBoundary(6, 5), confirmedWidth: true, confirmedDepth: true, confirmedHeight: true,
      doors: [{ id: 'entrance', wall: 'south', position: 2.75, width: 1.15, hinge: 'start', swing: 'inward', confirmed: true }],
      windows: [{ id: 'window', wall: 'north', position: 2, width: 1.8, height: 1.3, sillHeight: 0.85 }], fixedObstacles: [],
    },
    furniture, profile: { width: 0.75, margin: 0.05, uncertainty: 0.025, turningDiameter: null, units: 'm' },
    routes: [
      { id: 'desk-route', name: 'Desk approach', required: true, destination: { x: 3.1, z: 1.2 }, furnitureId: 'desk', offset: { x: -1.55, z: 0.6 } },
      { id: 'seating-route', name: 'Seating approach', required: true, destination: { x: 2.45, z: 3.85 }, furnitureId: 'sofa', offset: { x: 1.4, z: 1.5 } },
    ],
    original: JSON.parse(JSON.stringify(furniture)) as Furniture[], layouts: [],
    notes: ['Bundled demonstration room. Measurements are confirmed fixture values, not a scan of a real home.', 'Move the coffee table to x 4.40 m, z 4.00 m to open the desk route. Set a dimension to estimated to demonstrate provisional feedback.'],
  };
}

export function createManual(width = 5.4, depth = 4.5, name = 'My room'): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id: `room-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`, name, createdAt: now, updatedAt: now, source: 'manual', photos: [],
    room: {
      width, depth, height: 2.6, boundary: rectangleBoundary(width, depth), confirmedWidth: false, confirmedDepth: false,
      doors: [{ id: 'entrance', wall: 'south', position: width / 2, width: Math.min(1, width - 0.2), hinge: 'start', swing: 'unknown', confirmed: false }], windows: [], fixedObstacles: [],
    },
    furniture: [], profile: { width: 0.75, margin: 0.05, uncertainty: 0.03, turningDiameter: null, units: 'm' },
    routes: [], original: [], layouts: [], notes: ['Confirm your room dimensions, entrance width and swing, then add furniture and required destinations.'],
  };
}

export function improvedDemo(): Project {
  const project = cloneProject(createDemo());
  project.furniture = project.furniture.map(f => f.id === DEMO_MOVE.id ? { ...f, ...DEMO_MOVE } : f);
  return project;
}
