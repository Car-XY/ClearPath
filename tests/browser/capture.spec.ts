import { test, expect } from '@playwright/test';
import { encode } from 'fast-png';
import { createDemo } from '../../lib/demo';
const photo=(index:number)=>({name:`view-${index}.png`,mimeType:'image/png',buffer:Buffer.from(encode({width:2,height:2,data:new Uint8Array([index*40,80,80,255,index*40,80,80,255,index*40,80,80,255,index*40,80,80,255]),channels:4}))});
async function start(page:import('@playwright/test').Page){
 await page.route('**/api/config',route=>route.fulfill({json:{configured:true,provider:'OpenAI'}}));
 await page.goto('/');await page.locator('main[data-ready=true]').waitFor();await page.getByRole('button',{name:'Scan my room',exact:true}).click();
}
test('guided positions advance without pretending to track the camera, then streamed draft reaches review',async({page,isMobile})=>{
 let metadata:any,measurements:any;
 const fixture=createDemo();fixture.source='photos';fixture.name='Guided room';
 await page.route('**/api/analyze',async route=>{
  expect(route.request().headers()['accept']).toContain('application/x-ndjson');
  const form=await new Response(new Uint8Array(route.request().postDataBuffer()!),{headers:{'Content-Type':route.request().headers()['content-type']}}).formData();
  metadata=JSON.parse(String(form.get('metadata')));measurements=JSON.parse(String(form.get('measurements')));
  await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'status',stage:'analyzing'})+'\n'+JSON.stringify({type:'result',project:fixture})+'\n'});
 });
 await start(page);await expect(page.getByRole('region',{name:'Guided photo capture'})).toContainText('not live location tracking');
 const positions=['doorway','left','opposite','right'];
 for(let i=0;i<4;i++){
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload this view',exact:true}).click();await(await chooser).setFiles(photo(i));
  await expect(page.getByLabel(`Photo ${i+1} position`,{exact:true})).toHaveValue(positions[i]);
 }
 await expect(page.getByText('4 / 4 positions labelled',{exact:true})).toBeVisible();
 await page.getByLabel('Measured room width',{exact:false}).fill('5');await page.getByLabel('Measured room depth',{exact:false}).fill('4');
 await page.getByRole('region',{name:'Guided photo capture'}).screenshot({path:`../ClearPath-capture-${isMobile?'mobile':'desktop'}.png`});
 await page.getByRole('checkbox',{name:/I agree to send these room photos/}).check();await page.getByRole('button',{name:'Create room estimate',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('A few details make a difference.');
 expect(metadata.photos.map((p:any)=>p.viewpoint)).toEqual(positions);expect(measurements).toEqual({width:5,depth:4,cameraHeight:1.5,cameraHeightSource:'default'});
});
test('streamed account errors preserve images and show the actual error category',async({page})=>{
 await page.route('**/api/analyze',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'status'})+'\n'+JSON.stringify({type:'error',error:{code:'PROVIDER_QUOTA',message:'No API credits are available. Check billing; photos are retained.',retryable:false}})+'\n'}));
 await start(page);await page.locator('input[type=file][multiple]').setInputFiles(photo(1));
 await page.getByRole('checkbox',{name:/I agree to send these room photos/}).check();await page.getByRole('button',{name:'Create room estimate',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('No API credits');await page.getByText('Error details',{exact:true}).click();await expect(page.getByRole('alert')).toContainText('PROVIDER_QUOTA');
 await expect(page.getByRole('img',{name:/Room view 1/})).toBeVisible();await expect(page.getByRole('button',{name:'Create room estimate',exact:true})).toBeEnabled();
});
