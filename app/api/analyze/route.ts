import { analyzePhotos, PhotoAnalysisError, photoConfiguration, preparePhotos, readAnalysisForm } from '../../../lib/photo-provider';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function POST(request: Request) {
  try {
    const config = photoConfiguration();
    if (!config.configured) throw new PhotoAnalysisError('PROVIDER_NOT_CONFIGURED', config.reason!, 503);
    const { files, metadata, measurements } = await readAnalysisForm(request);
    const photos = await preparePhotos(files, metadata);
    const project = await analyzePhotos(photos, metadata, measurements, { signal: request.signal });
    return Response.json({ project }, { headers });
  } catch (error) {
    const known = error instanceof PhotoAnalysisError ? error : new PhotoAnalysisError('ANALYSIS_FAILED', 'Photo analysis could not finish. Your files remain available to retry, or you can create the room manually.', 500, true);
    return Response.json({ error: { code: known.code, message: known.message, retryable: known.retryable } }, { status: known.status, headers });
  }
}
