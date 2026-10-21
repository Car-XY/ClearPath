import { analyzePhotos, PhotoAnalysisError, photoConfiguration, preparePhotos, readAnalysisForm } from '../../../lib/photo-provider';
import { analysisStream } from '../../../lib/analysis-stream';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const safeError = (error: unknown) => {
  const known = error instanceof PhotoAnalysisError ? error : new PhotoAnalysisError('ANALYSIS_FAILED', 'The room service could not finish. Your photos remain selected; retry or create a manual room.', 500, true);
  return { code: known.code, message: known.message, retryable: known.retryable };
};

export async function POST(request: Request) {
  try {
    const config = photoConfiguration();
    if (!config.configured) throw new PhotoAnalysisError('PROVIDER_NOT_CONFIGURED', config.reason!, 503);
    const { files, metadata, measurements } = await readAnalysisForm(request);
    const photos = await preparePhotos(files, metadata);
    if (request.headers.get('accept')?.includes('application/x-ndjson')) {
      return analysisStream(signal => analyzePhotos(photos, metadata, measurements, { signal, draft: true }), request.signal, safeError);
    }
    const project = await analyzePhotos(photos, metadata, measurements, { signal: request.signal, draft: true });
    return Response.json({ project }, { headers });
  } catch (error) {
    const known = error instanceof PhotoAnalysisError ? error : new PhotoAnalysisError('ANALYSIS_FAILED', 'Photo analysis could not finish. Your files remain available to retry, or you can create the room manually.', 500, true);
    return Response.json({ error: { code: known.code, message: known.message, retryable: known.retryable } }, { status: known.status, headers });
  }
}
