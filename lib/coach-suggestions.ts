import type {Project} from './model';
import {evaluateErgonomics} from './ergonomics';
import {suggestImprovement} from './geometry';
export type CoachTheme='ergonomics'|'patient-care'|'game-room';
export function ergonomicsPenalty(project:Project){return evaluateErgonomics(project).reduce((sum,f)=>sum+(f.status==='fail'?3:f.status==='warn'?1:0),0);}
export function suggestForTheme(project:Project,theme:CoachTheme){
 if(theme!=='ergonomics')return null;
 const before=ergonomicsPenalty(project);
 const suggestion=suggestImprovement(project,{penalty:ergonomicsPenalty});
 if(suggestion){const after=ergonomicsPenalty({...project,furniture:suggestion.furniture});suggestion.reason=`Ergonomics coach: ${after<before?`reduced the weighted ergonomics warnings from ${before} to ${after}`:'improved movement space while preserving the ergonomics score'}. ${suggestion.reason}`;}
 return suggestion;
}
