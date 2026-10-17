import { validateProject, type Project } from './model';

const DATABASE = 'clearpath-local';
const STORE = 'projects';
const ACTIVE = 'active-project';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Local browser storage is unavailable. Export your project to keep a copy.')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open local storage. Your current room remains in memory; export it to keep a copy.'));
    request.onblocked = () => reject(new Error('Another ClearPath tab is blocking local storage. Close it and try saving again.'));
  });
}
function storageSafeProject(project: Project, includePhotos: boolean): Project {
  const valid = validateProject(project);
  return { ...valid, photos: valid.photos.map(photo => includePhotos ? photo : { id: photo.id, name: photo.name }) };
}
/** Source image bytes are excluded unless the user has explicitly opted in. */
export async function saveProject(project: Project, options: { includePhotos?: boolean } = {}): Promise<void> {
  const valid = storageSafeProject(project, options.includePhotos === true), database = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(valid, ACTIVE);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = transaction.onabort = () => { database.close(); reject(new Error('Local save failed, possibly because storage is full. Your room remains in memory. Export a copy and try again.')); };
    } catch { database.close(); reject(new Error('Local saving is unavailable. Export your room to preserve your changes.')); }
  });
}
export async function loadProject(): Promise<Project | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly'), request = transaction.objectStore(STORE).get(ACTIVE);
    request.onsuccess = () => {
      try { resolve(request.result ? validateProject(request.result) : null); }
      catch { reject(new Error('The saved project failed validation. It has been retained so it can be recovered; start a new room or import a valid export.')); }
    };
    request.onerror = () => reject(new Error('Could not read the saved room. Try again or import an exported project.'));
    transaction.oncomplete = transaction.onabort = () => database.close();
  });
}
export async function deleteProject(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(ACTIVE);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => { database.close(); reject(new Error('Could not delete the locally saved project. Try again.')); };
  });
}
export function exportProject(project: Project, includePhotos = false): string { return JSON.stringify(storageSafeProject(project, includePhotos), null, 2); }
export function importProject(serialized: string): Project {
  if (serialized.length > 16_000_000) throw new Error('Project files must be smaller than 16 MB.');
  let value: unknown;
  try { value = JSON.parse(serialized) as unknown; } catch { throw new Error('This is not a readable JSON project.'); }
  return validateProject(value);
}
/** Removes image bytes and references while retaining geometry and explanatory observations. */
export function removeSourcePhotos(project: Project): Project {
  return {
    ...project, photos: [],
    room: { ...project.room, evidencePhotoIds: [], fixedObstacles: project.room.fixedObstacles.map(f => ({ ...f, evidencePhotoIds: [] })) },
    furniture: project.furniture.map(f => ({ ...f, evidencePhotoIds: [] })), original: project.original.map(f => ({ ...f, evidencePhotoIds: [] })),
    layouts: project.layouts.map(layout => ({ ...layout, furniture: layout.furniture.map(f => ({ ...f, evidencePhotoIds: [] })) })),
    measurements: project.measurements?.map(measurement => ({ ...measurement, evidencePhotoIds: [] })),
    observations: project.observations?.map(observation => ({ ...observation, evidencePhotoIds: [] })),
  };
}
