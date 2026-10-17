import { describe, expect, it } from 'vitest';
import { createDemo, improvedDemo } from '../lib/demo';
import { analyze } from '../lib/geometry';
import { cloneProject, displayToMeters, metersToDisplay, validateProject } from '../lib/model';
import { exportProject, importProject, removeSourcePhotos } from '../lib/persistence';

describe('versioned untrusted scene validation', () => {
  it('round trips a valid versioned project', () => { expect(importProject(exportProject(createDemo())).schemaVersion).toBe(1); });
  it.each([NaN, Infinity, -1, 0])('rejects invalid furniture dimensions %s', value => {
    const project = createDemo(); project.furniture[0].width = value;
    expect(() => validateProject(project)).toThrow();
  });
  it('rejects duplicate furniture identities and invalid opening extents', () => {
    const project = createDemo(); project.furniture[1].id = project.furniture[0].id;
    expect(() => validateProject(project)).toThrow(/unique/);
    const invalid = createDemo(); invalid.room.doors[0].position = 0.1;
    expect(() => validateProject(invalid)).toThrow(/fit on its wall/);
  });
  it('rejects unknown schema versions, photo evidence, and destination associations', () => {
    expect(() => validateProject({ ...createDemo(), schemaVersion: 2 })).toThrow();
    const project = createDemo(); project.furniture[0].evidencePhotoIds = ['missing'];
    expect(() => validateProject(project)).toThrow(/Evidence/);
    const missing = createDemo(); missing.routes[0].furnitureId = 'missing';
    expect(() => validateProject(missing)).toThrow(/associated furniture/);
  });
  it('keeps current and original furniture independent', () => {
    const project = createDemo(), copy = cloneProject(project); copy.furniture[0].x = 4;
    expect(copy.original[0].x).toBe(1.05); expect(project.furniture[0].x).toBe(1.05);
  });
  it('converts units reversibly without changing scene geometry or route results', () => {
    expect(displayToMeters(metersToDisplay(1.2345, 'ft'), 'ft')).toBeCloseTo(1.2345, 10);
    const project = improvedDemo(), before = analyze(project); project.profile.units = 'ft';
    const after = analyze(project);
    expect(after.routes.map(r => [r.status, r.minClearance, r.length])).toEqual(before.routes.map(r => [r.status, r.minClearance, r.length]));
    expect(project.room.width).toBe(6);
  });
  it('excludes photo pixels by default while retaining evidence references', () => {
    const project = createDemo(); project.photos = [{ id: 'one', name: 'Room.jpg', dataUrl: 'data:image/jpeg;base64,secret' }]; project.furniture[0].evidencePhotoIds = ['one'];
    const serialized = exportProject(project);
    expect(serialized).not.toContain('base64'); expect(importProject(serialized).furniture[0].evidencePhotoIds).toEqual(['one']);
    expect(exportProject(project, true)).toContain('base64');
    const withoutPhotos = removeSourcePhotos(project);
    expect(validateProject(withoutPhotos).photos).toEqual([]); expect(withoutPhotos.furniture[0].evidencePhotoIds).toEqual([]);
    expect(project.photos[0].dataUrl).toContain('secret');
  });
  it('rejects malformed and oversized JSON imports', () => {
    expect(() => importProject('{broken')).toThrow(/readable JSON/);
    expect(() => importProject(' '.repeat(16_000_001))).toThrow(/16 MB/);
  });
});
