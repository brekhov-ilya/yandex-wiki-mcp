import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import type { AuthConfig, TokenData, YandexTokenResponse } from './types.js';

const OAUTH_PORT = 27311;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;
const OAUTH_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const OAUTH_TOKEN_URL = 'https://oauth.yandex.ru/token';
const OAUTH_TIMEOUT_MS = 120_000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>Авторизация</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;padding:2rem 3rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);text-align:center}
h1{color:#333;margin-bottom:.5rem}p{color:#666}</style></head>
<body><div class="card"><h1>Авторизация успешна</h1><p>Можете закрыть эту вкладку.</p></div></body></html>`;

function getTokenDir(): string {
	return join(homedir(), '.config', 'yandex-wiki-mcp');
}

function getTokenFilePath(): string {
	return join(getTokenDir(), 'token.json');
}

export async function loadTokenFromFile(): Promise<TokenData | null> {
	try {
		const raw = await readFile(getTokenFilePath(), 'utf-8');
		const data: unknown = JSON.parse(raw);
		if (
			typeof data === 'object' &&
			data !== null &&
			'access_token' in data &&
			'refresh_token' in data &&
			'expires_at' in data
		) {
			return data as TokenData;
		}
		return null;
	} catch {
		return null;
	}
}

export async function saveTokenToFile(token: TokenData): Promise<void> {
	const dir = getTokenDir();
	await mkdir(dir, { recursive: true });
	const filePath = getTokenFilePath();
	await writeFile(filePath, JSON.stringify(token, null, 2), 'utf-8');
	await chmod(filePath, 0o600);
}

function isTokenExpired(token: TokenData): boolean {
	return token.expires_at < Date.now() / 1000 + 60;
}

function toTokenData(response: YandexTokenResponse): TokenData {
	return {
		access_token: response.access_token,
		refresh_token: response.refresh_token,
		expires_at: Math.floor(Date.now() / 1000) + response.expires_in,
	};
}

function base64UrlEncode(buffer: Buffer): string {
	return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkcePair(): { verifier: string; challenge: string } {
	const verifier = base64UrlEncode(randomBytes(32));
	const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest());
	return { verifier, challenge };
}

async function exchangeCodeForToken(code: string, clientId: string, codeVerifier: string): Promise<TokenData> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		client_id: clientId,
		code_verifier: codeVerifier,
		redirect_uri: REDIRECT_URI,
	});

	const response = await fetch(OAUTH_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to exchange code for token (${response.status}): ${text}`);
	}

	const data = (await response.json()) as YandexTokenResponse;
	return toTokenData(data);
}

async function refreshAccessToken(refreshToken: string, clientId: string): Promise<TokenData> {
	const body = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
		client_id: clientId,
	});

	const response = await fetch(OAUTH_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to refresh token (${response.status}): ${text}`);
	}

	const data = (await response.json()) as YandexTokenResponse;
	return toTokenData(data);
}

function openBrowser(url: string): void {
	const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
	const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];

	execFile(cmd, args, err => {
		if (err) {
			process.stderr.write(`Could not open browser automatically. Open this URL manually:\n${url}\n`);
		}
	});
}

function performOAuthFlow(clientId: string): Promise<{ code: string; verifier: string }> {
	const { verifier, challenge } = generatePkcePair();

	return new Promise((resolve, reject) => {
		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			const url = new URL(req.url ?? '/', `http://localhost:${OAUTH_PORT}`);

			if (url.pathname === '/callback') {
				const code = url.searchParams.get('code');
				const error = url.searchParams.get('error');

				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(SUCCESS_HTML);

				server.close();
				clearTimeout(timeout);

				if (error) {
					reject(new Error(`OAuth error: ${error}`));
				} else if (code) {
					resolve({ code, verifier });
				} else {
					reject(new Error('No authorization code received in callback'));
				}
			} else {
				res.writeHead(404);
				res.end('Not found');
			}
		});

		const timeout = setTimeout(() => {
			server.close();
			reject(new Error('OAuth flow timed out (120s). Please try again.'));
		}, OAUTH_TIMEOUT_MS);

		server.on('error', (err: NodeJS.ErrnoException) => {
			clearTimeout(timeout);
			if (err.code === 'EADDRINUSE') {
				reject(new Error(`Port ${OAUTH_PORT} is already in use. Close the process occupying it and try again.`));
			} else {
				reject(err);
			}
		});

		server.listen(OAUTH_PORT, () => {
			const authorizeUrl = `${OAUTH_AUTHORIZE_URL}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;

			process.stderr.write('Opening browser for Yandex OAuth authorization...\n');
			process.stderr.write(`If the browser didn't open, go to:\n${authorizeUrl}\n`);
			openBrowser(authorizeUrl);
		});
	});
}

export async function resolveToken(config: AuthConfig): Promise<string> {
	if (!config.forceAuth) {
		const envToken = process.env.YANDEX_OAUTH_TOKEN;
		if (envToken) {
			return envToken;
		}

		const stored = await loadTokenFromFile();
		if (stored) {
			if (!isTokenExpired(stored)) {
				return stored.access_token;
			}

			process.stderr.write('Token expired, attempting refresh...\n');
			try {
				const refreshed = await refreshAccessToken(stored.refresh_token, config.clientId);
				await saveTokenToFile(refreshed);
				return refreshed.access_token;
			} catch {
				process.stderr.write('Refresh failed, starting OAuth flow...\n');
			}
		}
	}

	const { code, verifier } = await performOAuthFlow(config.clientId);
	const tokenData = await exchangeCodeForToken(code, config.clientId, verifier);
	await saveTokenToFile(tokenData);
	process.stderr.write('Token saved successfully.\n');
	return tokenData.access_token;
}
