import type { Project } from './model';
export const DEFAULT_CAPTURE_HEIGHT=1.5;
export function captureHeightReference(value:string){const meters=value.trim()?Number(value):DEFAULT_CAPTURE_HEIGHT;if(!Number.isFinite(meters)||meters<.3||meters>3)throw new Error('Enter a camera height between 0.3 and 3 m, or leave it blank for 1.50 m.');return {meters,source:value.trim()?'provided' as const:'default' as const};}
export function withCameraReference(project:Project,meters:number,source:'provided'|'default'):Project{return {...project,room:{...project.room,captureCameraHeight:meters,cameraHeightSource:source}};}
export function relativeHeight(height:number,cameraHeight:number){return `${(height/cameraHeight).toFixed(2)}× the capture camera height`;}
