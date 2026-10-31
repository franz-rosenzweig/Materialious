import { get } from 'svelte/store';
import { getHistoryInvidious } from '#lib/api/invidious/history';
import { buildPath } from '#lib/api/invidious/request';
import type { VideoWatchHistory } from '#lib/api/model';
import { isMaterialiousAccountActive, isYTBackend } from '#lib/backend';
import { localDb } from '#lib/dexie';
import { getPublicEnv } from '#lib/env';
import { originalFetch } from '#lib/fetchProxy';
import { invidiousAuthStore, invidiousInstanceStore } from '#lib/store';

// Signed in to Invidious, its watch history is the history: everything watched
// there, in Yattee or in any browser. This device's own records add resume
// positions; titles for the rest come from the playlist meta service, then Invidious.

type VideoDetails = { title: string; author: string; authorId?: string; lengthSeconds: number };

const HISTORY_PAGE_SIZE = 100;
const INVIDIOUS_PAGE_MAX = 1500;
const CACHE_MS = 60_000;

let watchedIds: { at: number; ids: Promise<string[]> } | null = null;

export function usesInvidiousHistory(): boolean {
	return !!get(invidiousAuthStore) && !isYTBackend() && !isMaterialiousAccountActive();
}

async function fetchAllWatchedIds(): Promise<string[]> {
	const ids: string[] = [];
	for (let page = 1; ; page++) {
		const batch = await getHistoryInvidious(page, INVIDIOUS_PAGE_MAX);
		ids.push(...batch);
		if (batch.length < INVIDIOUS_PAGE_MAX) return ids;
	}
}

// Every watched id, newest first; one request a minute at most.
export function invidiousWatchedIds(): Promise<string[]> {
	if (!watchedIds || Date.now() - watchedIds.at > CACHE_MS) {
		const ids = fetchAllWatchedIds();
		watchedIds = { at: Date.now(), ids };
		ids.catch(() => (watchedIds = null));
	}
	return watchedIds.ids;
}

export function forgetInvidiousWatchedIds() {
	watchedIds = null;
}

async function videoDetails(videoIds: string[]): Promise<Record<string, VideoDetails>> {
	const details: Record<string, VideoDetails> = {};
	if (videoIds.length === 0) return details;

	const metaInstance = getPublicEnv('PLAYLIST_META_INSTANCE');
	if (metaInstance) {
		try {
			const resp = await originalFetch(`${metaInstance}/videos?ids=${videoIds.join(',')}`, {
				signal: AbortSignal.timeout(5000)
			});
			if (resp.ok) Object.assign(details, (await resp.json()).videos);
		} catch {
			// Invidious below covers it.
		}
	}

	// The rest from Invidious, a few at a time: each one is a YouTube request.
	const missing = videoIds.filter((videoId) => !details[videoId]);
	const workers = Array.from({ length: Math.min(4, missing.length) }, async () => {
		for (let videoId = missing.shift(); videoId; videoId = missing.shift()) {
			try {
				const path = buildPath(`videos/${videoId}`);
				path.searchParams.set('fields', 'title,author,authorId,lengthSeconds');
				const resp = await fetch(path);
				if (resp.ok) details[videoId] = await resp.json();
			} catch {
				// Gone or private: left out of the list.
			}
		}
	});
	await Promise.all(workers);

	return details;
}

function historyEntry(videoId: string, details?: VideoDetails): VideoWatchHistory {
	return {
		type: 'historyVideo',
		id: videoId,
		videoId,
		title: details?.title ?? '',
		author: details?.author ?? '',
		authorId: details?.authorId || undefined,
		lengthSeconds: details?.lengthSeconds ?? 0,
		progress: 0,
		watched: new Date(0),
		thumbnail: `${get(invidiousInstanceStore)}/vi/${videoId}/mqdefault.jpg`
	};
}

// One page of the History list, in Invidious's order.
export async function getInvidiousWatchHistory(page: number): Promise<VideoWatchHistory[]> {
	const start = (page - 1) * HISTORY_PAGE_SIZE;
	const videoIds = (await invidiousWatchedIds()).slice(start, start + HISTORY_PAGE_SIZE);
	if (videoIds.length === 0) return [];

	const local = await localDb.watchHistory.bulkGet(videoIds);
	const details = await videoDetails(videoIds.filter((_, index) => !local[index]));

	return videoIds.flatMap((videoId, index) => {
		const localEntry = local[index];
		if (localEntry) return [localEntry];
		return details[videoId] ? [historyEntry(videoId, details[videoId])] : [];
	});
}

// Of these videos, the ones watched elsewhere (Invidious knows, this device doesn't),
// as entries with no position: shown as watched.
export async function watchedElsewhere(
	videoIds: string[],
	known: VideoWatchHistory[]
): Promise<VideoWatchHistory[]> {
	const knownIds = new Set(known.map((entry) => entry.videoId));
	const wanted = new Set(videoIds.filter((videoId) => !knownIds.has(videoId)));
	if (wanted.size === 0) return [];

	const watched = await invidiousWatchedIds();
	return watched.filter((videoId) => wanted.has(videoId)).map((videoId) => historyEntry(videoId));
}
