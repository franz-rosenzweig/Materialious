import { PLAYLIST_META_INTERNAL } from '$app/env/private';
import { error } from '@sveltejs/kit';

// The two lookups the playlist meta service answers.
const allowedPaths = [/^playlist\/[\w-]+$/, /^videos$/];

// Relays the playlist meta service (views and upload dates for Home tabs, titles
// for Invidious watch history) on this origin, so it works over HTTPS without a
// second address. Point PUBLIC_PLAYLIST_META_INSTANCE at /api/laneMeta to use it.
export async function GET({ params, url }) {
	if (!PLAYLIST_META_INTERNAL) throw error(404, 'Not found');
	if (!allowedPaths.some((path) => path.test(params.path))) throw error(400, 'Bad path');

	const resp = await fetch(`${PLAYLIST_META_INTERNAL}/${params.path}${url.search}`, {
		signal: AbortSignal.timeout(5000)
	}).catch(() => null);
	if (!resp) throw error(502, 'Playlist meta unavailable');

	return new Response(await resp.text(), {
		status: resp.status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' }
	});
}
