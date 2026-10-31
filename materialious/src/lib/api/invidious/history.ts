import { buildAuthHeaders, buildPath, fetchErrorHandle } from './request';

export async function postHistoryInvidious(videoId: string, fetchOptions: RequestInit = {}) {
	await fetchErrorHandle(
		await fetch(buildPath(`auth/history/${videoId}`), {
			method: 'POST',
			...buildAuthHeaders(),
			...fetchOptions
		})
	);
}

// Video ids only, newest first.
export async function getHistoryInvidious(
	page: number,
	maxResults: number,
	fetchOptions: RequestInit = {}
): Promise<string[]> {
	const path = buildPath('auth/history');
	path.searchParams.set('page', page.toString());
	path.searchParams.set('max_results', maxResults.toString());

	const resp = await fetchErrorHandle(
		await fetch(path, { ...buildAuthHeaders(), ...fetchOptions })
	);
	return await resp.json();
}

export async function deleteHistoryItemInvidious(videoId: string) {
	await fetchErrorHandle(
		await fetch(buildPath(`auth/history/${videoId}`), {
			method: 'DELETE',
			...buildAuthHeaders()
		})
	);
}

export async function clearHistoryInvidious() {
	await fetchErrorHandle(
		await fetch(buildPath('auth/history'), {
			method: 'DELETE',
			...buildAuthHeaders()
		})
	);
}
