export const MAX_PITCH=80*Math.PI/180;
export const clampPitch=(pitch:number)=>Math.max(-MAX_PITCH,Math.min(MAX_PITCH,pitch));
export type WalkControls={forward:boolean;back:boolean;left:boolean;right:boolean;turnLeft:boolean;turnRight:boolean;lookUp:boolean;lookDown:boolean;level:boolean};
export const noWalk:WalkControls={forward:false,back:false,left:false,right:false,turnLeft:false,turnRight:false,lookUp:false,lookDown:false,level:false};
