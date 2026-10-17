import { describe, expect, it } from 'vitest';
import { createDemo, DEMO_MOVE } from '../lib/demo';
import { analyze } from '../lib/geometry';
import { commitHistory, initialHistory, redoHistory, undoHistory } from '../lib/editor-state';
import { cloneProject } from '../lib/model';

describe('room editing history', () => {
  it('undoes and redoes a real route-opening move while preserving the original', () => {
    let state = initialHistory(createDemo());
    const original = JSON.stringify(state.present.original), proposed = cloneProject(state.present);
    proposed.furniture = proposed.furniture.map(f => f.id === DEMO_MOVE.id ? { ...f, ...DEMO_MOVE } : f);
    state = commitHistory(state, proposed);
    expect(analyze(state.present).status).toBe('green');
    state = undoHistory(state); expect(analyze(state.present).status).toBe('red');
    state = redoHistory(state); expect(analyze(state.present).status).toBe('green');
    expect(JSON.stringify(state.present.original)).toBe(original);
  });
  it('isolates committed snapshots from later mutations and discards the old redo branch', () => {
    let state = initialHistory(createDemo()); const edit = cloneProject(state.present); edit.name = 'First edit';
    state = commitHistory(state, edit); edit.name = 'Mutated later';
    expect(state.present.name).toBe('First edit');
    state = undoHistory(state);
    const branch = cloneProject(state.present); branch.name = 'New branch'; state = commitHistory(state, branch);
    expect(state.future).toEqual([]); expect(redoHistory(state).present.name).toBe('New branch');
  });
  it('bounds retained history and makes empty undo/redo safe', () => {
    let state = initialHistory(createDemo());
    expect(undoHistory(state)).toBe(state); expect(redoHistory(state)).toBe(state);
    for (let i = 0; i < 70; i++) state = commitHistory(state, { ...state.present, name: `Edit ${i}` });
    expect(state.past).toHaveLength(50); expect(state.present.name).toBe('Edit 69');
  });
});
