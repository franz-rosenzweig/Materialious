<script lang="ts">
	import { _ } from '#lib/i18n/index';
	import { invidiousAuthStore } from '#lib/store';
	import { addTopic, getTopics, removeTopic, topicsEnabled } from '#lib/topics';

	let topics: string[] = $state([]);
	let newTopic = $state('');
	let busy = $state(false);
	let failed = $state('');

	async function change(action: () => Promise<string[]>): Promise<boolean> {
		busy = true;
		failed = '';
		try {
			topics = await action();
			return true;
		} catch (error) {
			failed = String(error);
			return false;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		if ($invidiousAuthStore && topicsEnabled()) change(getTopics);
	});

	async function add(event: SubmitEvent) {
		event.preventDefault();
		const text = newTopic;
		if (await change(() => addTopic(text))) newTopic = '';
	}
</script>

{#if $invidiousAuthStore && topicsEnabled()}
	<div class="space"></div>
	<div class="settings">
		<h6>{$_('topics')}</h6>
		{#each topics as topic (topic)}
			<nav class="no-padding">
				<div class="max" dir="auto">{topic}</div>
				<button
					class="circle transparent"
					disabled={busy}
					onclick={() => change(() => removeTopic(topic))}
				>
					<i>close</i>
				</button>
			</nav>
		{/each}
		<form onsubmit={add}>
			<nav class="no-padding">
				<div class="field label surface-container-highest max">
					<input bind:value={newTopic} name="new-topic" type="text" maxlength="80" dir="auto" />
					<label for="new-topic">{$_('addTopic')}</label>
				</div>
				<button class="circle" disabled={busy || !newTopic.trim()}>
					<i>add</i>
				</button>
			</nav>
		</form>
		{#if failed}
			<p class="error-text">{failed}</p>
		{/if}
	</div>
{/if}
