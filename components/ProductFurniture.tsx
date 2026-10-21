'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { FurnitureModel, CanvasBoundary } from './RoomCanvas';
import type { Furniture } from '../lib/model';
import { productResultSchema } from '../lib/product-model';
import type { ProductModel } from '../lib/product-model';

export default function ProductFurniture({onAdd}:{onAdd(item:Furniture,ceiling?:boolean):void}){
 const [url,setUrl]=useState(''),[details,setDetails]=useState(''),[consent,setConsent]=useState(false),[configured,setConfigured]=useState<boolean|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[product,setProduct]=useState<ProductModel|null>(null);
 const [ceiling,setCeiling]=useState(false);
 const resultRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(product)resultRef.current?.scrollIntoView({block:'start'});},[product?.title]);
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>{const controller=new AbortController();fetch('/api/products',{signal:controller.signal}).then(response=>response.json()).then((value:unknown)=>setConfigured(Boolean(value&&typeof value==='object'&&'configured' in value&&value.configured===true))).catch(()=>{if(!controller.signal.aborted)setConfigured(false);});return()=>{controller.abort();pending.current?.abort();};},[]);
 async function generate(){
  const controller=new AbortController();pending.current=controller;setBusy(true);setError('');
  try{
   const response=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,details,consent}),signal:controller.signal});
   const value=await response.json().catch(()=>{throw new Error('The product service returned an unreadable response. Retry or paste the product details.');});
   if(!response.ok){const errorValue=value as {error?:{message?:string}};throw new Error(errorValue.error?.message??'The product model could not be generated.');}
   const result=productResultSchema.parse((value as {product?:unknown}).product);setProduct(result);setCeiling(result.category==='light'&&/pendant|ceiling|chandelier/i.test(result.title));
  }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'The model could not be generated.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 const item:Furniture|undefined=product?{id:'preview-product',label:product.title.slice(0,100),category:product.category,width:product.width,depth:product.depth,height:product.height,x:0,z:0,elevation:0,rotation:0,color:product.model.parts[0]?.color??'#b7a88e',movable:true,locked:false,provenance:'estimated',dimensionProvenance:'estimated',placementProvenance:'estimated',evidencePhotoIds:[],customModel:product.model,product:{url:product.url,title:product.title,dimensionSource:product.dimensionSource,notes:product.notes}}:undefined;
 return <div className="product-furniture">
  <p className="modal-intro">Paste a product link. Claude will build an editable 3D approximation for your room. Review its size before adding it.</p>
  {!configured&&<p role="status" className="product-warning">{configured===null?'Checking Claude…':'Product generation needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL on the server. Manual furniture creation is still available.'}</p>}
  <label className="field-label">Product URL<input type="url" aria-label="Product URL" placeholder="https://www.amazon.ca/…" value={url} disabled={busy} onChange={event=>setUrl(event.target.value)} maxLength={2000}/></label>
  <label className="field-label">Product details <span className="small-muted">Optional; use when a store blocks automatic reading</span><textarea aria-label="Product details" value={details} disabled={busy} onChange={event=>setDetails(event.target.value)} maxLength={16000} rows={4} placeholder="Paste the title, overall dimensions with units, color, materials, and a short description."/></label>
  <p className="small-muted">Automatic reading supports Amazon, IKEA, Wayfair, Walmart, Target, Home Depot, Lowe’s, West Elm and Article. Pasted details can be used with other HTTPS product links.</p>
  <label className="check-label"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/>Send this product’s details and any available product image to Anthropic for model generation.</label>
  <div className="product-actions"><button className="primary-button" disabled={!configured||!consent||!url.trim()||busy} onClick={()=>void generate()}>{busy?'Building product model…':'Generate with Claude'}</button>{busy&&<button className="text-button" onClick={()=>{pending.current?.abort();setBusy(false);setError('Generation cancelled. Your product details are preserved.');}}>Cancel generation</button>}</div>
  {error&&<p className="product-warning" role="alert">{error}</p>}
  {product&&item&&<section ref={resultRef} className="product-result" aria-label="Generated product model"><div className="product-preview" role="img" aria-label="Generated furniture 3D preview"><CanvasBoundary fallback={<p className="product-warning">3D preview is unavailable in this browser. You can still review dimensions and add the product.</p>}><Canvas frameloop="demand" camera={{position:[Math.max(item.width,item.depth)*2,item.height*1.5+1,Math.max(item.width,item.depth)*2],fov:42}}><ambientLight intensity={1.8}/><directionalLight position={[3,6,4]} intensity={2}/><Suspense fallback={null}><group position={[0,-item.height/2,0]}><FurnitureModel item={item}/></group></Suspense><OrbitControls target={[0,0,0]} enablePan={false}/></Canvas></CanvasBoundary></div><div><h3>{product.title}</h3><p className="small-muted">{product.sourceStatus==='fetched'?'Read from the product page':'Using the product details you pasted'} · {product.dimensionSource==='listed'?'Dimensions found in the source; confirm them':'Estimated dimensions; confirm them'}</p><div className="three-fields">{(['width','depth','height'] as const).map(dimension=><label className="field-label" key={dimension}>{dimension} (m)<input aria-label={`Product ${dimension}`} type="number" min="0.05" max={dimension==='height'?8:10} step="0.01" defaultValue={product[dimension]} onBlur={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=.05&&value<=(dimension==='height'?8:10))setProduct({...product,[dimension]:value,dimensionSource:'estimated'});else event.currentTarget.value=String(product[dimension]);}}/></label>)}</div><ul className="product-notes">{product.notes.map((note,index)=><li key={index}>{note}</li>)}</ul><p className="small-muted">A procedural planning model; materials and fine details are approximate. You can position it vertically and add anchors after insertion.</p><label className="field-label">Initial placement<select aria-label="Initial placement" value={ceiling?'ceiling':'floor'} onChange={event=>setCeiling(event.target.value==='ceiling')}><option value="floor">Floor (adjust height after adding)</option><option value="ceiling">Attach to ceiling</option></select></label><button className="primary-button" onClick={()=>onAdd({...item,id:crypto.randomUUID()},ceiling)}>Add product to room</button></div></section>}
 </div>;
}
