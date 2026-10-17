import {test,expect} from '@playwright/test';
import {encode} from 'fast-png';
test('Claude consent names Anthropic and plain-text upload errors preserve the photos',async({page})=>{
 await page.route('**/api/config',route=>route.fulfill({json:{configured:true,provider:'Anthropic'}}));
 await page.route('**/api/analyze',route=>route.fulfill({status:413,contentType:'text/plain',body:'Payload Too Large'}));
 await page.goto('/');await page.locator('main[data-ready=true]').waitFor();
 await page.getByRole('button',{name:'Scan my room',exact:true}).click();
 const png=Buffer.from(encode({width:2,height:2,data:new Uint8Array(16).fill(255),channels:4}));
 await page.locator('input[type=file][multiple]').setInputFiles({name:'room.png',mimeType:'image/png',buffer:png});
 const consent=page.getByRole('checkbox',{name:/I agree to send these room photos/});
 await expect(consent).toHaveAccessibleName(/Anthropic/);await consent.check();
 await page.getByRole('button',{name:'Create room estimate',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('too large for this server');
 await expect(page.getByRole('alert')).not.toContainText('Unexpected token');
 await expect(page.getByRole('img',{name:/Room view 1/})).toBeVisible();
});
