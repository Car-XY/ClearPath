/** Hosts can reject requests before the API runs, returning plain text. */
export async function readPhotoResponse(response: Response): Promise<unknown> {
  if (response.status === 413) throw new Error('The photo upload is too large for this server. Try fewer photos or smaller JPEG files. Your selected photos are still available.');
  try { return await response.json(); }
  catch { throw new Error(`The photo service returned an unreadable response (HTTP ${response.status}). Please retry or use fewer photos.`); }
}
