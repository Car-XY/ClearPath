import { z } from 'zod';
import { customModelSchema } from './model';
export const productCategory=z.enum(['sofa','table','desk','chair','bed','shelf','cabinet','light','other']);
export const productModelSchema=z.object({ title:z.string().trim().min(1).max(180), category:productCategory, width:z.number().finite().min(.05).max(10), depth:z.number().finite().min(.05).max(10), height:z.number().finite().min(.05).max(8), dimensionSource:z.enum(['listed','estimated']), dimensionEvidence:z.string().max(800), notes:z.array(z.string().max(500)).max(8), model:customModelSchema }).strict();
export type ProductModel = z.infer<typeof productModelSchema> & { url:string; sourceStatus:'fetched'|'user-provided' };

export const productResultSchema=productModelSchema.extend({url:z.string().url().max(2000),sourceStatus:z.enum(['fetched','user-provided'])});
