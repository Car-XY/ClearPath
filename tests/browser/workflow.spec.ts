import {test,expect} from '@playwright/test';
import {createDemo} from '../../lib/demo';
import {encode} from 'fast-png';
test('computed sample transition, undo, preferences, persistence and coordinated views',async({page,isMobile})=>{
 await page.goto('/');await page.locator('main[data-ready=true]').waitFor();
 await page.getByRole('button',{name:'Explore sample room',exact:true}).click();
 await expect(page.getByRole('button',{name:/Desk approach/})).toContainText(/blocks this route|No route|entrance.*wide/);
 if(isMobile)await page.getByRole('button',{name:'Objects & routes'}).click();
 await page.getByRole('button',{name:/Coffee table.*1\.80/}).click();
 const x=page.getByRole('spinbutton',{name:'Position X',exact:true});
 const z=page.getByRole('spinbutton',{name:'Position Z',exact:true});
 await x.fill('4.4');await x.press('Tab');
 await expect(x).toHaveValue('2.9'); // Rejected overlap restores the displayed position too.
 await z.fill('3.3');await z.press('Tab');
 await x.fill('4.4');await x.press('Tab');
 await z.fill('4');await z.press('Tab');
 if(isMobile)await page.getByRole('button',{name:'Close properties'}).click();
 await expect(page.getByRole('button',{name:/Desk approach/})).toContainText(/route meets|route exists/);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByRole('button',{name:/Desk approach/})).toContainText(/blocks this route|No route|entrance.*wide/);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await page.getByRole('button',{name:'Top-down',exact:true}).click();
 await expect(page.getByRole('img',{name:/top-down/i})).toBeVisible();
 await page.getByRole('button',{name:'3D view',exact:true}).click();
 if(isMobile)await page.getByRole('button',{name:'Objects & routes'}).click();
 await page.getByRole('tab',{name:'Movement preferences'}).click();
 const width=page.getByRole('spinbutton',{name:'Travel width',exact:true});await width.fill('1.2');await width.press('Tab');
 await expect(page.getByRole('button',{name:/Desk approach/})).toContainText(/No route|doorway|Doorway|width|entrance|blocks this route/);
 await width.fill('.75');await width.press('Tab');
 if(isMobile)await page.getByRole('button',{name:'Close objects panel'}).click();
 await page.getByRole('button',{name:'Save layout',exact:true}).click();
 await page.getByRole('textbox',{name:'Layout name',exact:true}).fill('Open desk path');
 await page.getByRole('button',{name:'Save named layout'}).click();
 await expect(page.getByText('Saved on this device',{exact:true})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:/Pick up where you left off/}).click();
 await expect(page.getByRole('button',{name:/Desk approach/})).toContainText(/route meets|route exists/);
 await page.getByRole('button',{name:'Walkthrough',exact:true}).click();
 await expect(page.getByRole('button',{name:/Exit walkthrough/})).toBeVisible();
 await page.getByRole('button',{name:/Exit walkthrough/}).click();
 await page.getByRole('button',{name:'Top-down',exact:true}).click();
 await page.screenshot({path:isMobile?'../ClearPath-mobile.png':'../ClearPath-desktop.png'});
 await page.getByRole('button',{name:'Compare',exact:false}).click();
 await expect(page.getByRole('dialog')).toContainText('Small changes. More possibilities.');
 await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Export project',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:/Export project.*Validated JSON/}).click();
 const exported=await downloadPromise;
 expect(exported.suggestedFilename()).toBe('ClearPath-project.json');
});
test('mock photo upload decodes, rejects duplicates, then enters measurement review',async({page})=>{
 const mockedProject=createDemo();mockedProject.name='Mock photo estimate';mockedProject.source='photos';mockedProject.room.confirmedWidth=false;mockedProject.room.confirmedDepth=false;mockedProject.room.boundaryStatus='estimated';mockedProject.notes=['Automated browser fixture; this is a mocked reconstruction.'];
 await page.route('**/api/config',route=>route.fulfill({json:{configured:true,provider:'OpenAI'}}));
 await page.route('**/api/analyze',route=>route.fulfill({json:{project:mockedProject}}));
 await page.goto('/');await page.locator('main[data-ready=true]').waitFor();
 await page.getByRole('button',{name:'Scan my room',exact:true}).click();
 const png=Buffer.from(encode({width:2,height:2,data:new Uint8Array(16).fill(255),channels:4}));
 const input=page.locator('input[type=file][multiple]');
 await input.setInputFiles([{name:'room-view.png',mimeType:'image/png',buffer:png}]);
 await expect(page.getByRole('img',{name:/Room view 1/})).toBeVisible();
 await input.setInputFiles([{name:'same-view.png',mimeType:'image/png',buffer:png}]);
 await expect(page.getByRole('alert')).toContainText('exact photo is already included');
 await page.getByRole('checkbox',{name:/I agree to send these room photos/}).check();
 await page.getByRole('button',{name:'Create room estimate',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('A few details make a difference.');
 await expect(page.getByRole('checkbox',{name:'Width measured and confirmed',exact:true})).not.toBeChecked();
 await page.getByRole('checkbox',{name:'Width measured and confirmed',exact:true}).check();
 await expect(page.getByRole('checkbox',{name:'Depth measured and confirmed',exact:true})).not.toBeChecked();
 await page.getByRole('button',{name:'Continue to planner',exact:false}).click();
 await expect(page.getByRole('textbox',{name:'Project name'})).toHaveValue('Mock photo estimate');
});
test('top-down drag uses the same geometry for route restoration',async({page})=>{
 await page.goto('/');await page.locator('main[data-ready=true]').waitFor();
 await page.getByRole('button',{name:'Explore sample room',exact:true}).click();
 await page.getByRole('button',{name:'Top-down',exact:true}).click();
 const svg=page.getByTestId('top-down-canvas');
 const positions=await svg.evaluate(element=>{const svg=element as SVGSVGElement;const matrix=svg.getScreenCTM()!;const point=(x:number,y:number)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;const result=p.matrixTransform(matrix);return {x:result.x,y:result.y}};return {from:point(2.9,2.55),to:point(4.4,4)}});
 await page.mouse.move(positions.from.x,positions.from.y);await page.mouse.down();await page.mouse.move(positions.to.x,positions.to.y,{steps:12});await page.mouse.up();
 await expect(page.getByRole('button',{name:/Desk approach/})).toContainText(/route meets|route exists/);
});
test('missing live provider is an explicit recoverable mode',async({page})=>{
 await page.route('**/api/config',route=>route.fulfill({json:{configured:false,provider:'OpenAI',reason:'Live photo analysis is not configured in this deterministic test.'}}));
 await page.goto('/');await page.locator('main[data-ready=true]').waitFor();await page.getByRole('button',{name:'Scan my room',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText(/configured yet|unavailable|not available/i);
 await expect(page.getByRole('dialog')).toContainText(/manual/i);
});




