<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getWatchHistory } from '#lib/api/index';
	import type { VideoWatchHistory } from '#lib/api/model';
	import { isYTBackend } from '#lib/backend';
	import ItemsList from '#lib/components/layout/ItemsList.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import PageLoading from '#lib/components/PageLoading.svelte';
	import Search from '#lib/components/Search.svelte';
	import VideoThumbnail from '#lib/components/thumbnail/VideoThumbnail.svelte';
	import { refreshHomeTab } from '#lib/homeTabs';
	import { _ } from '#lib/i18n/index';
	import { loadBlockedChannels } from '#lib/quickPlaylists';
	import {
		blockedChannelsStore,
		feedCacheStore,
		hideSearchStore,
		homeTabsCacheStore,
		interfaceHomeActiveTabStore,
		interfaceHomeTabsStore,
		invidiousAuthStore
	} from '#lib/store';
	import { isAndroidTv } from '#lib/utils';
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';

	let { data } = $props();

	const popularTab = 'popular';

	let showTabs = $derived($interfaceHomeTabsStore.length > 0);
	let tabs = $derived([
		...$interfaceHomeTabsStore.map((tab) => ({ id: tab.playlistId, title: tab.title })),
		...(data.popularDisabled ? [] : [{ id: popularTab, title: $_('popular') }])
	]);
	let activeTab = $derived(
		tabs.find((tab) => tab.id === $interfaceHomeActiveTabStore)?.id ?? tabs[0]?.id
	);
	let activeVideos = $derived(
		activeTab && activeTab !== popularTab
			? $homeTabsCacheStore[activeTab]?.filter(
					(video) => !$blockedChannelsStore.includes(video.authorId)
				)
			: undefined
	);
	let tabErrors: Record<string, string> = $state({});

	// Started but unfinished, newest first.
	let continueWatching: VideoWatchHistory[] = $state([]);

	// Cached videos show at once; a tab is refetched the first time it becomes
	// active on each visit to Home. Default settings can pin tabs after mount.
	// Plain Set on purpose: bookkeeping that must not re-run the effect below.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const refreshedTabs = new Set<string>();
	$effect(() => {
		const tabId = activeTab;
		if (!tabId || tabId === popularTab || refreshedTabs.has(tabId)) return;

		refreshedTabs.add(tabId);
		refreshHomeTab(tabId)
			.then(() => delete tabErrors[tabId])
			.catch((loadError) => (tabErrors[tabId] = String(loadError)));
	});

	let tabBar: HTMLElement | undefined = $state();
	let fadeStart = $state(false);
	let fadeEnd = $state(false);

	function updateTabBarFade() {
		if (!tabBar) return;
		fadeStart = tabBar.scrollLeft > 4;
		fadeEnd = tabBar.scrollLeft + tabBar.clientWidth < tabBar.scrollWidth - 4;
	}

	$effect(() => {
		if (!activeTab || !tabBar) return;
		tick().then(() => {
			tabBar
				?.querySelector('[aria-selected="true"]')
				?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
			updateTabBarFade();
		});
	});

	function selectTab(tabId: string) {
		if (tabId === activeTab) return;
		interfaceHomeActiveTabStore.set(tabId);
		document.getElementById('main-content')?.scrollTo({ top: 0 });
	}

	// Swipe sideways over the videos to move between tabs.
	let touchStart: { x: number; y: number } | null = null;

	function onTouchStart(event: TouchEvent) {
		const inScroller = (event.target as Element).closest('.continue-row');
		touchStart =
			event.touches.length === 1 && !inScroller
				? { x: event.touches[0].clientX, y: event.touches[0].clientY }
				: null;
	}

	function onTouchEnd(event: TouchEvent) {
		if (!touchStart) return;
		const dx = event.changedTouches[0].clientX - touchStart.x;
		const dy = event.changedTouches[0].clientY - touchStart.y;
		touchStart = null;
		if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;

		const next = tabs[tabs.findIndex((tab) => tab.id === activeTab) + (dx < 0 ? 1 : -1)];
		if (next) selectTab(next.id);
	}

	onMount(() => {
		if (showTabs) {
			addEventListener('resize', updateTabBarFade);

			if (get(invidiousAuthStore) && !isYTBackend()) {
				loadBlockedChannels().catch(() => {});
			}

			getWatchHistory()
				.then((history) => {
					continueWatching = history
						.filter((video) => video.progress > 30 && video.lengthSeconds - video.progress > 60)
						.slice(0, 12);
				})
				.catch(() => {});
			return;
		}

		if (data.popularDisabled) {
			if (isAndroidTv()) {
				if (get(invidiousAuthStore)) {
					goto(resolve('/(app)/subscriptions'), { replace: true });
					return;
				}
				goto(resolve('/(app)/search'), { replace: true });
				return;
			}
			hideSearchStore.set(true);
		}
	});

	onDestroy(() => {
		hideSearchStore.set(false);
		removeEventListener('resize', updateTabBarFade);
	});
</script>

{#if showTabs}
	<div class="home-tabs-bar">
		<div
			class="row scroll home-tabs"
			class:fade-start={fadeStart}
			class:fade-end={fadeEnd}
			role="tablist"
			bind:this={tabBar}
			onscroll={updateTabBarFade}
		>
			{#each tabs as tab (tab.id)}
				<button
					role="tab"
					aria-selected={tab.id === activeTab}
					class="chip no-margin"
					class:primary={tab.id === activeTab}
					onclick={() => selectTab(tab.id)}
				>
					<span>{tab.title}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="home-tab-content" role="group" ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
		{#if activeTab === tabs[0]?.id && continueWatching.length > 0}
			<h6 class="continue-title">{$_('continueWatching')}</h6>
			<div class="continue-row">
				{#each continueWatching as video (video.videoId)}
					<div class="continue-item">
						<VideoThumbnail {video} />
					</div>
				{/each}
			</div>
		{/if}

		{#key activeTab}
			{#if activeTab === popularTab}
				<ItemsList items={$feedCacheStore.popular ?? []} />
			{:else if activeVideos}
				<ItemsList items={activeVideos} playlistId={activeTab} />
			{:else if activeTab && tabErrors[activeTab]}
				<article class="surface-container-highest">
					<p style="white-space: pre-line;word-wrap: break-word;">{tabErrors[activeTab]}</p>
				</article>
			{:else}
				<PageLoading />
			{/if}
		{/key}
	</div>
{:else if data.popularDisabled}
	<div class="center">
		<div class="space"></div>
		<Logo size="200px" />
		<h1>Materialious</h1>
		<Search />
	</div>
{:else}
	<ItemsList items={$feedCacheStore.popular ?? []} />
{/if}

<style>
	.center {
		height: 50%;
		display: flex;
		justify-content: center;
		align-items: center;
		flex-direction: column;
	}

	.home-tabs-bar {
		position: sticky;
		top: 0;
		z-index: 5;
		background-color: var(--surface);
		padding: 0.5rem 0 0.75rem;
	}

	.home-tabs {
		gap: 0.5rem;
		padding: 0 1em;
		flex-wrap: nowrap;
		scrollbar-width: none;
	}

	.home-tabs::-webkit-scrollbar {
		display: none;
	}

	.home-tabs .chip {
		flex-shrink: 0;
	}

	.home-tabs.fade-end {
		mask-image: linear-gradient(to right, #000 calc(100% - 3rem), transparent);
	}

	.home-tabs.fade-start {
		mask-image: linear-gradient(to left, #000 calc(100% - 3rem), transparent);
	}

	.home-tabs.fade-start.fade-end {
		mask-image: linear-gradient(
			to right,
			transparent,
			#000 3rem,
			#000 calc(100% - 3rem),
			transparent
		);
	}

	.continue-title {
		margin: 0.25rem 1rem 0.5rem;
	}

	.continue-row {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		padding: 0 1rem 1rem;
		scroll-snap-type: x proximity;
	}

	.continue-item {
		flex: 0 0 18rem;
		scroll-snap-align: start;
	}

	@media only screen and (max-width: 600px) {
		.continue-item {
			flex-basis: 15rem;
		}
	}
</style>
