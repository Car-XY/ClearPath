import { it, expect, vi, afterEach } from 'vitest';
import { generateProductModel, validateProductUrl, readProductPage, ProductError } from '../lib/product-provider';
import { POST, GET } from '../app/api/products/route';
const env={ANTHROPIC_API_KEY:'test-private-key',ANTHROPIC_MODEL:'test-claude'};
const details='LACK side table. Overall width 55 cm, depth 55 cm, height 45 cm. White tabletop and four square legs.';
const generated={title:'LACK side table',category:'table',width:.55,depth:.55,height:.45,dimensionSource:'listed',dimensionEvidence:'width 55 cm, depth 55 cm, height 45 cm',notes:[],model:{version:1,parts:[{shape:'box',size:[1,.1,1],position:[0,.95,0],color:'#eeeeee'}]}};
const response=(value:unknown=generated)=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}]});
afterEach(()=>vi.unstubAllEnvs());
it('only sends credentials to Anthropic and uses pasted details without fetching the linked host',async()=>{
 const fetcher=vi.fn(async(url,init)=>{expect(String(url)).toBe('https://api.anthropic.com/v1/messages');expect((init!.headers as Record<string,string>)['x-api-key']).toBe(env.ANTHROPIC_API_KEY);const body=JSON.parse(String(init!.body));expect(body.model).toBe('test-claude');expect(body.output_config.format.type).toBe('json_schema');return response();}) as typeof fetch;
 const product=await generateProductModel({url:'https://custom-retailer.example/table',details},{env,fetcher});expect(product).toMatchObject({sourceStatus:'user-provided',dimensionSource:'listed',width:.55});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('reads page metadata, follows safe retail redirects and falls back gracefully when blocked',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://www.ikea.com/ca/en/p/table/'}})).mockResolvedValueOnce(new Response('<html><title>LACK table</title><script type="application/ld+json">{"name":"LACK","description":"'+details+'"}</script><p>'+details+'</p></html>',{headers:{'Content-Type':'text/html'}}));
 const page=await readProductPage('https://www.ikea.com/table',fetcher);expect(page.text).toContain(details);expect(page.text).toContain('Structured product metadata');
 await expect(readProductPage('https://amazon.ca/table',async()=>new Response('Forbidden',{status:403}))).rejects.toMatchObject({code:'PAGE_BLOCKED'});
});
it('rejects private addresses, deceptive retailer names, custom ports and unsafe redirects before requesting them',async()=>{
 for(const url of ['http://amazon.ca/product','https://127.0.0.1/item','https://amazon.ca.attacker.test/item','https://amazon.ca:8443/item','https://user:pass@amazon.ca/item','https://[::1]/item'])expect(()=>validateProductUrl(url)).toThrow(ProductError);
 const fetcher=vi.fn(async()=>new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest/meta-data/'}}));await expect(readProductPage('https://www.amazon.ca/item',fetcher)).rejects.toMatchObject({code:'INVALID_URL'});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('validates model bounds, reports Claude errors and downgrades unsupported dimension claims',async()=>{
 const bad=structuredClone(generated);bad.model.parts[0].position=[5,.5,0];await expect(generateProductModel({url:'https://www.ikea.com/table',details},{env,fetcher:async()=>response(bad)})).rejects.toMatchObject({code:'INVALID_MODEL'});
 await expect(generateProductModel({url:'https://www.ikea.com/table',details},{env,fetcher:async()=>new Response('',{status:429})})).rejects.toMatchObject({code:'CLAUDE_RATE_LIMIT'});
 const product=await generateProductModel({url:'https://www.ikea.com/table',details},{env,fetcher:async()=>response({...generated,dimensionEvidence:'not in source'})});expect(product.dimensionSource).toBe('estimated');
});
it('bounds incoming request streams, requires consent and never exposes a key through configuration',async()=>{
 vi.stubEnv('ANTHROPIC_API_KEY','do-not-expose');vi.stubEnv('ANTHROPIC_MODEL','configured-model');expect(await GET().text()).not.toContain('do-not-expose');
 const noConsent=await POST(new Request('http://localhost/api/products',{method:'POST',body:JSON.stringify({url:'https://www.ikea.com/table'})}));expect(noConsent.status).toBe(400);expect(await noConsent.json()).toMatchObject({error:{code:'CONSENT_REQUIRED'}});
 const oversized=await POST(new Request('http://localhost/api/products',{method:'POST',body:' '.repeat(81000)}));expect(oversized.status).toBe(413);
});
it('caps product-page bodies before passing them to Claude',async()=>{
 await expect(readProductPage('https://www.ikea.com/table',async()=>new Response('x'.repeat(3*1024*1024+1),{headers:{'Content-Type':'text/html'}}))).rejects.toMatchObject({code:'PAGE_TOO_LARGE'});
});
