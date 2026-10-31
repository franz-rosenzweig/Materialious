import { get } from 'svelte/store';
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

// Refetch a pinned playlist into the cache Home renders from.
export async function refreshHomeTab(playlistId: string) {
	const { videos } = await fetchEntirePlaylist(playlistId);
	homeTabsCacheStore.update((cache) => ({ ...cache, [playlistId]: videos }));
}
