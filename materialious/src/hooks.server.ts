import { isOwnBackend } from '#lib/shared/index';
import { getSequelize, runSequelizeMigrations } from '#lib/server/database';
import { unsign } from 'cookie-signature';

import {
	DATABASE_CONNECTION_URI,
	COOKIE_SECRET,
	RATE_LIMIT_DISABLED,
	PUBLIC_RATE_LIMIT_DISABLED,
	CF_ACCESS_EXEMPT_HOSTS
} from '$app/env/private';

import { RateLimiter } from 'sveltekit-rate-limiter/server';
import sodium from 'libsodium-wrappers-sumo';

let captchaKey = '';
let captchaSignature = '';
sodium.ready.then(() => {
	captchaKey = sodium.to_base64(sodium.randombytes_buf(32));
	captchaSignature = sodium.to_base64(sodium.randombytes_buf(32));
});

let sequelizeAuthenticated = false;

const strictLimiter = new RateLimiter({
	IP: [10, 'm']
});

const quickConnectLimiter = new RateLimiter({
	IP: [120, 'm']
});

const sensitivePaths = [/^\/api\/user\/create$/, /^\/api\/user\/login$/];

export async function handle({ event, resolve }) {
	// Published through Cloudflare Access: only the listed hosts (direct, private
	// addresses) may skip it, so a request without Access's header on any other
	// host means Access is missing or was bypassed.
	if (CF_ACCESS_EXEMPT_HOSTS) {
		const exempt = CF_ACCESS_EXEMPT_HOSTS.split(',').map((host) => host.trim().toLowerCase());
		const host = (event.request.headers.get('host') ?? '').replace(/:\d+$/, '').toLowerCase();
		if (!exempt.includes(host) && !event.request.headers.has('cf-access-jwt-assertion')) {
			return new Response('Forbidden', { status: 403 });
		}
	}

	if (!isOwnBackend()?.internalAuth) {
		return await resolve(event);
	}

	event.locals.captchaKey = captchaKey;
	event.locals.captchaSignature = captchaSignature;

	if (DATABASE_CONNECTION_URI) {
		const sequelize = getSequelize();
		if (!sequelizeAuthenticated) {
			await sequelize.sequelize.sync();
			await sequelize.sequelize.authenticate();
			await runSequelizeMigrations();
			sequelizeAuthenticated = true;
		}

		if (!COOKIE_SECRET) {
			throw new Error('Cookie secret must be set');
		}

		if (COOKIE_SECRET.length < 16) {
			throw new Error('COOKIE_SECRET must be at least 16 characters long');
		}

		const signedUserId = event.cookies.get('userid');
		if (signedUserId) {
			const userId = unsign(signedUserId, COOKIE_SECRET);
			if (userId) {
				event.locals.userId = userId;
			}
		}

		const authorization = event.request.headers.get('authorization');
		if (!event.locals.userId && authorization?.startsWith('Bearer ')) {
			const token = authorization.slice(7);
			const userId = unsign(token, COOKIE_SECRET);
			if (userId) {
				event.locals.userId = userId;
			}
		}
	}

	if (!RATE_LIMIT_DISABLED && !PUBLIC_RATE_LIMIT_DISABLED) {
		const tooManyRequests = () =>
			new Response(JSON.stringify({ error: 'Too Many Requests' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});

		if (sensitivePaths.some((p) => p.test(event.url.pathname))) {
			if (await strictLimiter.isLimited(event)) {
				return tooManyRequests();
			}
		}

		if (event.url.pathname.startsWith('/api/user/quickConnect')) {
			if (await quickConnectLimiter.isLimited(event)) {
				return tooManyRequests();
			}
		}
	}

	return await resolve(event);
}
