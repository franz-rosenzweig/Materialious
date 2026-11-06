<script lang="ts" module>
	import { activeCaptionTrack } from '#lib/store';
	import { get } from 'svelte/store';
	import { addToast } from '../Toast.svelte';
	import { parseResponse, CaptionsRenderer } from 'media-captions';
	import ISO6391 from 'iso-639-1';

	let renderer: CaptionsRenderer | undefined;

	// Kept by label, not language code: one video can have two tracks in the same
	// language ("English" and "English (auto-generated)"), and keyed by code the
	// second one replaced the first, so picking "English" played the auto-generated one.
	type CaptionTrack = { label: string; languageCode: string; url: string };
	let captionTracks: CaptionTrack[] = [];

	// The track a subtitle-language setting asks for: "original" takes the
	// auto-generated track (the spoken language) or else the first one; a language
	// name ("english", from Settings) takes the first track in that language, which is
	// the uploader's own before YouTube's auto-generated one.
	export function defaultCaptionLabel(setting: string): string | undefined {
		if (!setting || setting === 'original') {
			const auto = captionTracks.find((track) => /auto/i.test(track.label));
			return (auto ?? captionTracks[0])?.label;
		}
		const code = ISO6391.getCode(setting) || setting;
		return captionTracks.find((track) => track.languageCode.startsWith(code))?.label;
	}

	export function setTextTrackVisibility(visible: boolean) {
		if (!visible) {
			activeCaptionTrack.set(null);
			return;
		}
		// Re-apply the currently active track (or default language) so visibility
		// toggling stays in sync with the single source of truth.
		const active = get(activeCaptionTrack);
		if (active) {
			void selectTextTrack(active);
		}
	}

	// Fetch caption data for a selected track (by label; empty = the first track)
	export async function selectTextTrack(label: string) {
		const track = label
			? captionTracks.find((candidate) => candidate.label === label)
			: captionTracks[0];
		if (!track) return;

		const resp = await fetch(track.url, { method: 'GET' });
		if (!resp.ok) {
			addToast({
				data: {
					text: 'Unable to fetch captions'
				}
			});
			return;
		}

		try {
			renderer?.changeTrack(await parseResponse(resp));
			activeCaptionTrack.set(track.label);
		} catch {
			addToast({
				data: {
					text: 'Unable to fetch captions'
				}
			});
		}
	}
</script>

<script lang="ts">
	import type { VideoPlay } from '#lib/api/model';
	import { onDestroy, onMount } from 'svelte';
	import { getCaptionUrl } from '#lib/player/captions';
	import { subtitleSettings, playerDefaultSubtitleLanguage, playerCCByDefault } from '#lib/store';
	import 'media-captions/styles/captions.css';

	let {
		video,
		currentTime = $bindable(),
		showControls = $bindable()
	}: {
		video: VideoPlay;
		currentTime: number;
		showControls: boolean;
	} = $props();

	let captionElement: HTMLElement | undefined = $state();
	let hasTracks = $state(false);

	let trackVisible = $derived(hasTracks && $activeCaptionTrack !== null);

	onMount(async () => {
		captionTracks = [];
		if (video.captions) {
			for (const caption of video.captions) {
				const captionUrl = getCaptionUrl(caption, video.fallbackPatch);

				if (!captionUrl) continue;

				captionTracks.push({
					label: caption.label,
					languageCode: caption.language_code,
					url: captionUrl
				});
			}
			hasTracks = captionTracks.length > 0;
		}

		if (captionElement) {
			renderer = new CaptionsRenderer(captionElement);
		}

		// Apply default subtitle language on load when subtitles are enabled by default.
		if (hasTracks && get(playerCCByDefault)) {
			const label = defaultCaptionLabel(get(playerDefaultSubtitleLanguage));

			if (label) {
				await selectTextTrack(label);
			}
		}
	});

	onDestroy(() => {
		captionTracks = [];
		activeCaptionTrack.set(null);
	});

	let captionStyle = $derived({
		'--cue-color': $subtitleSettings.color,
		'--cue-bg-color': $subtitleSettings.backgroundColor,
		'--cue-font-size': `calc(var(--overlay-height) / 100 * ${$subtitleSettings.fontSize})`,
		'--cue-text-shadow': $subtitleSettings.textShadow,
		'--cue-font-family': $subtitleSettings.fontFamily ?? 'inherit',
		'--cue-text-align': $subtitleSettings.alignment ?? 'center'
	} as Record<string, string>);

	$effect(() => {
		if (!renderer) return;
		// Apply subtitle timing offset (positive = delay subtitles).
		const offset = $subtitleSettings.offset ?? 0;
		renderer.currentTime = (currentTime ?? 0) - offset;
	});
</script>

<div
	id="captions"
	class:controls-shown={showControls}
	class:hide={!trackVisible}
	bind:this={captionElement}
	style="left: 50%;bottom: {showControls
		? '80px'
		: '30px'};transform: translateX(-50%);{Object.entries(captionStyle)
		.map(([k, v]) => `${k}:${v};`)
		.join('')}"
></div>

<style>
	#captions {
		--overlay-padding: 1%;
		--cue-line-height: calc(var(--cue-font-size) * 1.2);
		--cue-padding-x: calc(var(--cue-font-size) * 0.6);
		--cue-padding-y: calc(var(--cue-font-size) * 0.4);
		text-align: var(--cue-text-align);

		position: absolute;
		z-index: 1;
		pointer-events: none;
	}

	@media screen and (max-width: 1000px) {
		#captions {
			/* Keep captions visible above controls on mobile instead of hiding them. */
			display: block !important;
		}
	}
</style>
