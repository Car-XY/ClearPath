import { photoConfiguration } from '../../../lib/photo-provider';

export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(photoConfiguration(), { headers: { 'Cache-Control': 'no-store' } });
}
