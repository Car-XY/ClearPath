import { Project, cloneProject } from './model';
export type History = { past: Project[]; present: Project; future: Project[] };
export function initialHistory(project: Project): History { return {past: [], present: cloneProject(project), future: []}; }
export function commitHistory(state: History, project: Project): History { return {past: [...state.past.slice(-49),cloneProject(state.present)],present: cloneProject({...project,updatedAt:new Date().toISOString()}),future:[]}; }
export function undoHistory(state: History): History { if(!state.past.length)return state;return {past:state.past.slice(0,-1),present:cloneProject(state.past[state.past.length-1]),future:[cloneProject(state.present),...state.future]}; }
export function redoHistory(state: History): History { if(!state.future.length)return state;return {past:[...state.past,cloneProject(state.present)],present:cloneProject(state.future[0]),future:state.future.slice(1)}; }
