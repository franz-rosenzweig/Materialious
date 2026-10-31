import { resolve } from '$app/paths';
import { getPopular } from '#lib/api/index';
import { HTTPError } from '#lib/api/invidious/request';
import { isYTBackend } from '#lib/backend';
import { feedCacheStore, interfaceHomeTabsStore, invidiousInstanceStore } from '#lib/store';
import { error, redirect } from '@sveltejs/kit';
import { get } from 'svelte/store';

export async function load() {
	if (isYTBackend()) {
		throw redirect(302, resolve('/(app)/subscriptions'));
	}

	if (!get(invidiousInstanceStore)) {
		return {
			popularDisabled: true
		};
	}

	// With pinned playlists Popular is only one tab, so it failing must not take Home down.
	const hasHomeTabs = get(interfaceHomeTabsStore).length > 0;

	let popular = get(feedCacheStore).popular;
	let popularDisabled: boolean = false;

	if (!popular) {
		let errorObj: HTTPError | undefined;
		try {
			popular = await getPopular();
		} catch (popularError) {
			if (popularError instanceof HTTPError) errorObj = popularError;
		}

		if (errorObj) {
			if (errorObj.response.status === 403 || hasHomeTabs) {
				popularDisabled = true;
			} else {
				throw error(500, errorObj.toString());
			}
		}

		feedCacheStore.set({ ...get(feedCacheStore), popular });
	} else {
		getPopular().then((newPopular) =>
			feedCacheStore.set({ ...get(feedCacheStore), popular: newPopular })
		);
	}

	return {
		popularDisabled: popularDisabled
	};
}
