'use client';
import { useState } from 'react';
import { Camera, Check, ImagePlus } from 'lucide-react';

export const captureSteps = [
  { id: 'doorway', label: 'Doorway', title: 'Start just inside the doorway', instruction: 'Face into this room. Include the floor, two walls and the largest furniture. Keep the phone level at chest height.' },
  { id: 'left', label: 'Left side', title: 'Show the left side of the room', instruction: 'If accessible, move toward the left side and look diagonally across. Keep some of the same furniture in view.' },
  { id: 'opposite', label: 'Opposite side', title: 'Look back toward the entrance', instruction: 'From the far side, photograph the doorway and the backs of furniture. This view helps separate the room from spaces beyond glass.' },
  { id: 'right', label: 'Right side', title: 'Fill in the remaining side', instruction: 'Show the remaining wall and any furniture hidden in earlier views. Include where the floor meets the walls.' },
] as const;
export type CaptureViewpoint = typeof captureSteps[number]['id'];

export default function CaptureGuide({ positions, disabled, onAdd }: { positions: (CaptureViewpoint | undefined)[]; disabled: boolean; onAdd(position: CaptureViewpoint, camera: boolean): void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const firstMissing = captureSteps.findIndex(step => !positions.includes(step.id));
  const index = chosen ?? (firstMissing < 0 ? 3 : firstMissing);
  const step = captureSteps[index];
  const count = captureSteps.filter(step => positions.includes(step.id)).length;
  return <section className="ph-capture-guide" aria-label="Guided photo capture">
    <div className="ph-section-heading"><h3>Four views. One room.</h3><span>{count} / 4 positions labelled</span></div>
    <p className="ph-small">Follow the suggested positions, or upload photos you already have. You can start with one view.</p>
    <div className="ph-capture-layout">
      <svg className="ph-capture-map" viewBox="0 0 170 140" role="img" aria-label="Suggested positions around a rectangular room, starting at the doorway">
        <path d="M65 125H20V15H150V125H105" fill="#f4f5ed" stroke="#93aa96" strokeWidth="3"/>
        <path d="M65 125V95Q90 95 95 125" fill="none" stroke="#c5d0b8" strokeWidth="2"/>
        <rect x="62" y="44" width="46" height="45" rx="4" fill="#d9c7a9"/><path d="M36 100V34H134V105" fill="none" stroke="#b6c6ae" strokeDasharray="4 4"/>
        {[[36,104],[36,34],[134,34],[134,104]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="13" fill={positions.includes(captureSteps[i].id)?'#36806a':i===index?'#2f5f4e':'#edf0e4'} stroke="#739580"/><text x={x} y={y+4} textAnchor="middle" fontSize="11" fontWeight="bold" fill={positions.includes(captureSteps[i].id)||i===index?'white':'#41694f'}>{i+1}</text></g>)}
      </svg>
      <div className="ph-capture-step"><div className="ph-capture-tabs" role="group" aria-label="Suggested photo positions">{captureSteps.map((item,i)=><button type="button" key={item.id} aria-pressed={i===index} onClick={()=>setChosen(i)}>{positions.includes(item.id)?<Check size={12}/>:<span>{i+1}</span>}{item.label}</button>)}</div><h4>{step.title}</h4><p>{step.instruction}</p><div className="ph-add-buttons"><button type="button" className="ph-secondary" disabled={disabled} onClick={()=>{onAdd(step.id,true);setChosen(null);}}><Camera size={16}/>Take this view</button><button type="button" className="ph-text-button" disabled={disabled} onClick={()=>{onAdd(step.id,false);setChosen(null);}}><ImagePlus size={16}/>Upload this view</button></div></div>
    </div>
    <p className="ph-small">Suggested positions, not live location tracking. Stay where you can move comfortably; skip a position or ask someone to help. The draft will still need a measurement check.</p>
  </section>;
}
