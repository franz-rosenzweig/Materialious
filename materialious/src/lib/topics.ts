import { get } from 'svelte/store';
import { getPersonalPlaylistsInvidious } from '#lib/api/invidious/playlist';
import { buildAuthHeaders, buildPath, fetchErrorHandle } from '#lib/api/invidious/request';
import type { PlaylistPage } from '#lib/api/model';
import { isMaterialiousAccountActive, isYTBackend } from '#lib/backend';
import { getPublicEnv } from '#lib/env';
import {
	interfaceHomeTabsStore,
	interfaceTopicTabsSeenStore,
	invidiousAuthStore,
	personalPlaylistsCacheStore
} from '#lib/store';

// Topics are one a line in the description of a private playlist on the Invidious
// account (PUBLIC_TOPICS_PLAYLIST names it), so every device and iv-suggest's fill
// read the same list. Each topic gets a private playlist marked by
// TOPIC_LANE_DESCRIPTION; iv-suggest adopts one made here and fills it.

export const TOPIC_LANE_DESCRIPTION = 'A topic lane, filled by iv-suggest.';
const MOST_TOPIC_CHARACTERS = 80;

export function topicsEnabled(): boolean {
	return (
		!!getPublicEnv('TOPICS_PLAYLIST') &&
		!!get(invidiousAuthStore) &&
		!isYTBackend() &&
		!isMaterialiousAccountActive()
	);
}

function topicsIn(description: string | undefined): string[] {
	const topics: string[] = [];
	for (const line of (description ?? '').split('\n')) {
		const topic = line.split(/\s+/).join(' ').slice(0, MOST_TOPIC_CHARACTERS).trim();
		if (topic && !topics.some((known) => known.toLowerCase() === topic.toLowerCase())) {
			topics.push(topic);
		}
	}
	return topics;
}

async function freshPlaylists(): Promise<PlaylistPage[]> {
	const playlists = await getPersonalPlaylistsInvidious();
	personalPlaylistsCacheStore.set(playlists);
	return playlists;
}

async function createPrivatePlaylist(title: string, description: string): Promise<string> {
	const resp = await fetchErrorHandle(
		await fetch(buildPath('auth/playlists'), {
			method: 'POST',
			headers: { ...buildAuthHeaders().headers, 'Content-Type': 'application/json' },
			body: JSON.stringify({ title, privacy: 'private' })
		})
	);
	const { playlistId } = await resp.json();
	await editPlaylist(playlistId, title, description);
	return playlistId;
}

// Invidious stores a new playlist as public whatever was asked, so privacy goes again.
async function editPlaylist(playlistId: string, title: string, description: string) {
	await fetchErrorHandle(
		await fetch(buildPath(`auth/playlists/${playlistId}`), {
			method: 'PATCH',
			headers: { ...buildAuthHeaders().headers, 'Content-Type': 'application/json' },
			body: JSON.stringify({ title, description, privacy: 'private' })
		})
	);
}

async function deletePlaylist(playlistId: string) {
	await fetchErrorHandle(
		await fetch(buildPath(`auth/playlists/${playlistId}`), {
			method: 'DELETE',
			headers: { ...buildAuthHeaders().headers, 'Content-Type': 'application/json' }
		})
	);
}

function topicsPlaylist(playlists: PlaylistPage[]): PlaylistPage | undefined {
	return playlists.find((playlist) => playlist.title === getPublicEnv('TOPICS_PLAYLIST'));
}

function topicLanes(playlists: PlaylistPage[]): PlaylistPage[] {
	return playlists.filter((playlist) => playlist.description === TOPIC_LANE_DESCRIPTION);
}

export async function getTopics(): Promise<string[]> {
	return topicsIn(topicsPlaylist(await freshPlaylists())?.description);
}

async function saveTopics(topics: string[], playlists: PlaylistPage[]) {
	const listTitle = getPublicEnv('TOPICS_PLAYLIST') as string;
	const list = topicsPlaylist(playlists);
	if (list) {
		await editPlaylist(list.playlistId, listTitle, topics.join('\n'));
	} else {
		await createPrivatePlaylist(listTitle, topics.join('\n'));
	}
}

function pinTab(playlistId: string, title: string) {
	interfaceTopicTabsSeenStore.update((seen) => [...new Set([...seen, playlistId])]);
	const tabs = get(interfaceHomeTabsStore);
	if (!tabs.some((tab) => tab.playlistId === playlistId)) {
		interfaceHomeTabsStore.set([...tabs, { playlistId, title }]);
	}
}

function unpinTab(playlistId: string) {
	interfaceHomeTabsStore.set(
		get(interfaceHomeTabsStore).filter((tab) => tab.playlistId !== playlistId)
	);
}

// Saves the list, then makes the topic's playlist and pins it, so the tab is there
// at once; it fills on iv-suggest's next run.
export async function addTopic(text: string): Promise<string[]> {
	const playlists = await freshPlaylists();
	const topics = topicsIn(topicsPlaylist(playlists)?.description);
	const [topic] = topicsIn(text);
	if (!topic || topics.some((known) => known.toLowerCase() === topic.toLowerCase())) {
		return topics;
	}

	await saveTopics([...topics, topic], playlists);
	const lane =
		topicLanes(playlists).find((playlist) => playlist.title === topic)?.playlistId ??
		(await createPrivatePlaylist(topic, TOPIC_LANE_DESCRIPTION));
	pinTab(lane, topic);
	await freshPlaylists();
	return [...topics, topic];
}

export async function removeTopic(topic: string): Promise<string[]> {
	const playlists = await freshPlaylists();
	const topics = topicsIn(topicsPlaylist(playlists)?.description).filter(
		(known) => known !== topic
	);

	await saveTopics(topics, playlists);
	for (const lane of topicLanes(playlists).filter((playlist) => playlist.title === topic)) {
		unpinTab(lane.playlistId);
		await deletePlaylist(lane.playlistId);
	}
	await freshPlaylists();
	return topics;
}

// Other devices: pin topic lanes this device hasn't seen, unpin the ones gone.
// Seen ones stay as the person left them, so unpinning a topic tab sticks.
export async function syncTopicTabs() {
	if (!topicsEnabled()) return;

	const lanes = topicLanes(await freshPlaylists());
	const seen = get(interfaceTopicTabsSeenStore);
	for (const lane of lanes) {
		if (!seen.includes(lane.playlistId)) pinTab(lane.playlistId, lane.title);
	}

	const present = new Set(lanes.map((lane) => lane.playlistId));
	for (const playlistId of seen) {
		if (!present.has(playlistId)) unpinTab(playlistId);
	}
	interfaceTopicTabsSeenStore.update((ids) => ids.filter((id) => present.has(id)));
}
