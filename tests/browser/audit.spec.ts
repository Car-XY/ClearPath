import {test,expect,type Page} from '@playwright/test';
import {createDemo} from '../../lib/demo';
import {validateProject} from '../../lib/model';
async function sample(page:Page){await page.goto('/');await page.locator('main[data-ready=true]').waitFor();await page.getByRole('button',{name:'Explore sample room',exact:true}).click();}
test('unlocking initially fixed furniture permits numeric movement and undo',async({page,isMobile})=>{
 await sample(page);if(isMobile)await page.getByRole('button',{name:'Objects & routes',exact:true}).click();
 await page.getByRole('button',{name:/Low bookcase.*1\.80/}).click();
 await page.getByRole('button',{name:'Unlock object',exact:true}).click();
 const z=page.getByRole('spinbutton',{name:'Position Z',exact:true});await z.fill('3.5');await z.press('Tab');
 await expect(z).toHaveValue('3.5');
 await expect(page.getByRole('checkbox',{name:'This object can be moved',exact:true})).toBeChecked();
 if(isMobile)await page.getByRole('button',{name:'Close properties',exact:true}).click();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 if(isMobile)await page.getByRole('button',{name:'Properties',exact:true}).click();
 await expect(z).toHaveValue('2.55');
});
test('original restoration reconciles destinations and still exports a valid project',async({page,isMobile})=>{
 await sample(page);
 const fixture=createDemo();const chair={...fixture.furniture[3],id:'extra-chair',label:'Extra chair',x:4,z:4};
 fixture.furniture.push(chair);fixture.routes.push({id:'extra-approach',name:'Extra approach',required:true,furnitureId:chair.id,offset:{x:0,z:.7},destination:{x:4,z:4.7}});
 await page.getByRole('button',{name:'Export project',exact:true}).click();
 await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({name:'audit-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.getByRole('textbox',{name:'Project name',exact:true})).toHaveValue(fixture.name);
 await page.getByRole('button',{name:/Compare/}).click();
 await page.getByRole('button',{name:'Restore original',exact:true}).click();
 await page.getByRole('button',{name:'Export project',exact:true}).click();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:/Export project.*Validated JSON/}).click();
 const downloaded=await pending,stream=await downloaded.createReadStream(),chunks:Buffer[]=[];
 for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
 const result=validateProject(JSON.parse(Buffer.concat(chunks).toString('utf8')));
 expect(result.furniture.some(f=>f.id===chair.id)).toBe(false);
 expect(result.routes.find(r=>r.id==='extra-approach')?.furnitureId).toBeUndefined();
});
test('Escape cancels a top-down drag without committing the preview',async({page,isMobile})=>{
 await sample(page);await page.getByRole('button',{name:'Top-down',exact:true}).click();
 const svg=page.getByTestId('top-down-canvas');
 const positions=await svg.evaluate(element=>{const svg=element as SVGSVGElement,m=svg.getScreenCTM()!;const point=(x:number,y:number)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(m);return{x:q.x,y:q.y}};return {from:point(2.9,2.55),to:point(4.4,4)}});
 await page.mouse.move(positions.from.x,positions.from.y);await page.mouse.down();await page.mouse.move(positions.to.x,positions.to.y,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();
 await expect(page.getByRole('button',{name:/Desk approach/})).toContainText(/blocks this route|No route/);
});

test('scene rotation buttons update geometry, support undo and respect locks',async({page,isMobile})=>{
 await sample(page);
 if(isMobile)await page.getByRole('button',{name:'Objects & routes',exact:true}).click();
 await page.getByRole('button',{name:/Coffee table.*1\.80/}).click();
 if(isMobile)await page.getByRole('button',{name:'Close properties',exact:true}).click();
 const clockwise=page.getByRole('button',{name:'Rotate object clockwise 15 degrees',exact:true});
 await expect(clockwise).toBeVisible();await clockwise.click();
 await expect(page.getByRole('group',{name:'Rotate selected object'})).toContainText('15°');
 await page.screenshot({path: '../ClearPath-rotation-'+(isMobile?'mobile':'desktop')+'.png',fullPage:true});
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByRole('group',{name:'Rotate selected object'})).toContainText('0°');
 if(isMobile)await page.getByRole('button',{name:'Properties',exact:true}).click();
 await page.getByRole('button',{name:'Lock object',exact:true}).click();
 if(isMobile)await page.getByRole('button',{name:'Close properties',exact:true}).click();
 await expect(clockwise).toBeDisabled();
 await expect(page.getByRole('group',{name:'Rotate selected object'})).toContainText('Unlock this object');
});
