import { get } from 'svelte/store';
import type { PlaylistPageVideo } from './api/model';
import { getPublicEnv } from './env';
import { originalFetch } from './fetchProxy';
import { homeTabsCacheStore, interfaceHomeTabsStore } from './store';
import { fetchEntirePlaylist } from './playlist';

export function isPinnedToHome(playlistId: string): boolean {
	return get(interfaceHomeTabsStore).some((tab) => tab.playlistId === playlistId);
}

export function togglePinToHome(playlistId: string, title: string) {
	if (isPinnedToHome(playlistId)) {
		unpinFromHome(playlistId);
	} else {
		interfaceHomeTabsStore.set([...get(interfaceHomeTabsStore), { playlistId, title }]);
	}
}

export function unpinFromHome(playlistId: string) {
	interfaceHomeTabsStore.set(
		get(interfaceHomeTabsStore).filter((tab) => tab.playlistId !== playlistId)
	);
}

export function moveHomeTab(index: number, offset: number) {
	const tabs = [...get(interfaceHomeTabsStore)];
	const target = index + offset;
	if (target < 0 || target >= tabs.length) return;

	[tabs[index], tabs[target]] = [tabs[target], tabs[index]];
	interfaceHomeTabsStore.set(tabs);
}

type PlaylistMeta = { [videoId: string]: { published: number; viewCount: number } };

// Invidious's playlist API carries no views or upload dates. An optional service
// (PUBLIC_PLAYLIST_META_INSTANCE) can supply them; without it cards just go without.
async function fetchPlaylistMeta(playlistId: string): Promise<PlaylistMeta> {
	const instance = getPublicEnv('PLAYLIST_META_INSTANCE');
	if (!instance) return {};

	try {
		// Straight to the service: it sends CORS headers and isn't on the proxy whitelist.
		const resp = await originalFetch(`${instance}/playlist/${encodeURIComponent(playlistId)}`, {
			signal: AbortSignal.timeout(5000)
		});
		if (!resp.ok) return {};
		return (await resp.json()).videos ?? {};
	} catch {
		return {};
	}
}

// Refetch a pinned playlist into the cache Home renders from.
export async function refreshHomeTab(playlistId: string) {
	const [{ videos, info }, meta] = await Promise.all([
		fetchEntirePlaylist(playlistId),
		fetchPlaylistMeta(playlistId)
	]);

	const withMeta = videos.map((video) => {
		const extra = meta[video.videoId];
		if (!extra) return video;
		return {
			...video,
			viewCount: extra.viewCount || video.viewCount,
			...(extra.published ? { published: extra.published } : {})
		} as PlaylistPageVideo;
	});
	homeTabsCacheStore.update((cache) => ({ ...cache, [playlistId]: withMeta }));

	// A playlist renamed elsewhere renames its tab.
	const tabs = get(interfaceHomeTabsStore);
	if (info.title && tabs.some((tab) => tab.playlistId === playlistId && tab.title !== info.title)) {
		interfaceHomeTabsStore.set(
			tabs.map((tab) => (tab.playlistId === playlistId ? { ...tab, title: info.title } : tab))
		);
	}
}
