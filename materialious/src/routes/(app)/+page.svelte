<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ItemsList from '#lib/components/layout/ItemsList.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import PageLoading from '#lib/components/PageLoading.svelte';
	import Search from '#lib/components/Search.svelte';
	import { refreshHomeTab } from '#lib/homeTabs';
	import { _ } from '#lib/i18n/index';
	import {
		feedCacheStore,
		hideSearchStore,
		homeTabsCacheStore,
		interfaceHomeActiveTabStore,
		interfaceHomeTabsStore,
		invidiousAuthStore
	} from '#lib/store';
	import { isAndroidTv } from '#lib/utils';
	import { onDestroy, onMount } from 'svelte';
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
	let tabErrors: Record<string, string> = $state({});

	// Cached videos show at once; the tab is refetched every time it is opened.
	function loadTab(tabId: string | undefined) {
		if (!tabId || tabId === popularTab) return;

		refreshHomeTab(tabId)
			.then(() => delete tabErrors[tabId])
			.catch((loadError) => (tabErrors[tabId] = String(loadError)));
	}

	function selectTab(tabId: string) {
		interfaceHomeActiveTabStore.set(tabId);
		loadTab(tabId);
	}

	onMount(() => {
		if (showTabs) {
			loadTab(activeTab);
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
	});
</script>

{#if showTabs}
	<div class="row scroll home-tabs" role="tablist">
		{#each tabs as tab (tab.id)}
			<button
				role="tab"
				aria-selected={tab.id === activeTab}
				class="chip no-margin"
				class:fill={tab.id === activeTab}
				onclick={() => selectTab(tab.id)}
			>
				<span>{tab.title}</span>
			</button>
		{/each}
	</div>

	{#key activeTab}
		{#if activeTab === popularTab}
			<ItemsList items={$feedCacheStore.popular ?? []} />
		{:else if activeTab && $homeTabsCacheStore[activeTab]}
			<ItemsList items={$homeTabsCacheStore[activeTab]} playlistId={activeTab} />
		{:else if activeTab && tabErrors[activeTab]}
			<article class="surface-container-highest">
				<p style="white-space: pre-line;word-wrap: break-word;">{tabErrors[activeTab]}</p>
			</article>
		{:else}
			<PageLoading />
		{/if}
	{/key}
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

	.home-tabs {
		gap: 0.5rem;
		padding: 0 1em 1em;
		flex-wrap: nowrap;
	}

	.home-tabs .chip {
		flex-shrink: 0;
	}
</style>
