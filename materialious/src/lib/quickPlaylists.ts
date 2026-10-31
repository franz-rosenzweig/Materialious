import { get } from 'svelte/store';
import {
	addPlaylistVideo,
	getPersonalPlaylists,
	invalidatePersonalPlaylists,
	postPersonalPlaylist
} from './api';
import type { PlaylistPage } from './api/model';
import { fetchEntirePlaylist } from './playlist';
import { blockedChannelsStore, homeTabsCacheStore } from './store';

// iv-suggest reads a playlist with exactly this title as its channel blocklist.
export const BLOCKED_PLAYLIST_TITLE = 'Blocked';

async function findOrCreatePlaylist(
	matches: (title: string) => boolean,
	createTitle: string
): Promise<PlaylistPage> {
	const find = async () => (await getPersonalPlaylists()).find((p) => matches(p.title));

	let playlist = await find();
	if (!playlist) {
		await postPersonalPlaylist(createTitle, 'private');
		invalidatePersonalPlaylists();
		playlist = await find();
	}
	if (!playlist) throw new Error(`Could not create the playlist ${createTitle}`);

	return playlist;
}

// Adds to the account's own watch later playlist, whatever it is called.
export async function addToWatchLater(videoId: string): Promise<string> {
	const playlist = await findOrCreatePlaylist(
		(title) => /watch\s*later/i.test(title),
		'Watch later'
	);
	await addPlaylistVideo(playlist.playlistId, videoId);
	return playlist.title;
}

// One video in Blocked blocks its whole channel. It leaves Home at once; the
// lanes drop it themselves on their next fill.
export async function dontRecommendChannel(videoId: string, authorId: string) {
	const playlist = await findOrCreatePlaylist(
		(title) => title === BLOCKED_PLAYLIST_TITLE,
		BLOCKED_PLAYLIST_TITLE
	);
	await addPlaylistVideo(playlist.playlistId, videoId);

	blockedChannelsStore.update((channels) => [...new Set([...channels, authorId])]);
	homeTabsCacheStore.update((cache) =>
		Object.fromEntries(
			Object.entries(cache).map(([tabId, videos]) => [
				tabId,
				videos.filter((video) => video.authorId !== authorId)
			])
		)
	);
}

// The channels behind every video in Blocked, so Home can hide them before the next fill.
export async function loadBlockedChannels() {
	const playlist = (await getPersonalPlaylists()).find((p) => p.title === BLOCKED_PLAYLIST_TITLE);
	if (!playlist) {
		blockedChannelsStore.set([]);
		return;
	}

	const { videos } = await fetchEntirePlaylist(playlist.playlistId);
	blockedChannelsStore.set([...new Set(videos.map((video) => video.authorId))]);
}

export function isChannelBlocked(authorId: string | undefined): boolean {
	return !!authorId && get(blockedChannelsStore).includes(authorId);
}
