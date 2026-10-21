import { generateProductModel, ProductError, productConfiguration } from '../../../lib/product-provider';
export const dynamic='force-dynamic';
export const maxDuration=120;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export function GET(){return Response.json(productConfiguration(),{headers});}
export async function POST(request:Request){
  try{
    const limit=80000;if(Number(request.headers.get('content-length')??0)>limit)throw new ProductError('REQUEST_TOO_LARGE','Product details must be under 16000 characters.',413);
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let length=0;
    if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw new ProductError('REQUEST_TOO_LARGE','Product details must be under 16000 characters.',413);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const text=new TextDecoder().decode(bytes);
    let value:unknown;try{value=JSON.parse(text);}catch{throw new ProductError('INVALID_REQUEST','Send a product URL and optional product details.');}
    if(!value||typeof value!=='object')throw new ProductError('INVALID_REQUEST','Enter a product URL.');
    const input=value as {url?:unknown;details?:unknown;consent?:unknown};
    if(input.consent!==true)throw new ProductError('CONSENT_REQUIRED','Confirm sending the product details and any product image to Anthropic before generating.');
    if(typeof input.url!=='string'||(input.details!==undefined&&typeof input.details!=='string'))throw new ProductError('INVALID_REQUEST','Enter a product URL and optional text details.');
    const product=await generateProductModel({url:input.url,details:input.details as string|undefined},{signal:request.signal});return Response.json({product},{headers});
  }catch(error){const known=error instanceof ProductError?error:new ProductError('PRODUCT_FAILED','The product model could not be generated. Your room is preserved.',500);return Response.json({error:{code:known.code,message:known.message}},{status:known.status,headers});}
}
