import { PLAYLIST_META_INTERNAL } from '$app/env/private';
import { error } from '@sveltejs/kit';

// Relays the playlist meta service (views and upload dates for Home tabs) on this
// origin, so it works over HTTPS and behind the same sign-in as the app.
// Point PUBLIC_PLAYLIST_META_INSTANCE at /api/laneMeta to use it.
export async function GET({ params }) {
	if (!PLAYLIST_META_INTERNAL) throw error(404, 'Not found');
	if (!/^[\w-]+$/.test(params.playlistId)) throw error(400, 'Bad playlist id');

	const resp = await fetch(`${PLAYLIST_META_INTERNAL}/playlist/${params.playlistId}`, {
		signal: AbortSignal.timeout(5000)
	}).catch(() => null);
	if (!resp) throw error(502, 'Playlist meta unavailable');

	return new Response(await resp.text(), {
		status: resp.status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' }
	});
}
