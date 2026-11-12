/**
 * Outbound proxy support for the main process.
 *
 * On a network where the only way out is an HTTP proxy (typical for a
 * corporate machine), the provider SDKs fail with a bare "Connection error":
 * unlike the renderer, Node sockets in the main process ignore the system
 * proxy. This module asks Chromium which proxy the system would use for each
 * provider host (so PAC files and the Windows proxy settings are honoured)
 * and hands the clients a matching agent.
 *
 * `HTTPS_PROXY` / `HTTP_PROXY` (environment or the app's .env file) override
 * the system settings. Proxy authentication is not handled for the agent
 * path; a proxy that needs credentials in the URL can be given as
 * `http://user:password@host:port` in HTTPS_PROXY.
 */
import { net, session } from 'electron';
import type { Agent } from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';

type LogLike = { info: (...a: any[]) => void; warn: (...a: any[]) => void };

/** Hosts the app talks to; each is resolved separately because a PAC file can route them differently. */
const PROVIDER_URLS = [
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
  'https://api.anthropic.com',
  'https://api.z.ai',
];
const REFRESH_MS = 5 * 60 * 1000;
/**
 * Chromium loads the system proxy settings asynchronously, so a lookup made
 * the moment the app is ready can still answer "direct". Ask again shortly
 * after startup rather than trusting the first answer for five minutes.
 */
const STARTUP_RECHECK_MS = [1500, 6000, 20000];
/** A request made this long after the last lookup triggers a fresh one for the next request. */
const STALE_MS = 30 * 1000;

/** host → proxy URL, or null for a direct connection. */
const proxyByHost = new Map<string, string | null>();
const agents = new Map<string, Agent>();
let envProxy: string | null = null;
let lastResolvedAt = 0;
let activeLog: LogLike | null = null;

function readEnvProxy(): string | null {
  const raw =
    process.env['HTTPS_PROXY'] || process.env['https_proxy'] ||
    process.env['HTTP_PROXY'] || process.env['http_proxy'] || '';
  const value = raw.trim();
  if (!value) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

/**
 * First usable entry of a Chromium proxy list such as
 * "PROXY proxy.corp:8080; DIRECT". Exported for the unit test.
 */
export function parseProxyList(list: string): string | null {
  for (const entry of (list || '').split(';')) {
    const [kind, target] = entry.trim().split(/\s+/);
    if (!kind) continue;
    if (/^DIRECT$/i.test(kind)) return null;
    if (!target) continue;
    if (/^PROXY$/i.test(kind)) return `http://${target}`;
    if (/^HTTPS$/i.test(kind)) return `https://${target}`;
    // SOCKS is left to a direct attempt: the agent used here speaks HTTP CONNECT only.
  }
  return null;
}

function isLocal(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || /^127\./.test(hostname);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

async function resolveAll(log: LogLike): Promise<void> {
  lastResolvedAt = Date.now();
  for (const url of PROVIDER_URLS) {
    let proxy = envProxy;
    if (!proxy) {
      try {
        proxy = parseProxyList(await session.defaultSession.resolveProxy(url));
      } catch (err) {
        log.warn(`Proxy lookup failed for ${url}:`, err);
        proxy = null;
      }
    }
    const host = hostOf(url);
    if (proxyByHost.get(host) !== proxy) {
      // Credentials, if any, stay out of the log.
      log.info(`Network: ${host} → ${proxy ? `proxy ${proxy.replace(/\/\/[^@/]*@/, '//***@')}` : 'direct'}`);
    }
    proxyByHost.set(host, proxy);
  }
}

/**
 * Call once the app is ready. Resolves the proxy for every provider host,
 * keeps it fresh (the answer changes when the machine moves between office,
 * VPN and home), and routes the global `fetch` through Chromium's network
 * stack, which follows the same proxy settings.
 */
export async function initNetworkProxy(log: LogLike): Promise<void> {
  envProxy = readEnvProxy();
  if (envProxy) {
    try {
      const u = new URL(envProxy);
      await session.defaultSession.setProxy({ proxyRules: `${u.protocol}//${u.host}`, proxyBypassRules: '<local>' });
    } catch (err) {
      log.warn('Could not apply HTTPS_PROXY to the session:', err);
    }
  }
  activeLog = log;
  await resolveAll(log);
  for (const delay of STARTUP_RECHECK_MS) setTimeout(() => { void resolveAll(log); }, delay).unref?.();
  const timer = setInterval(() => { void resolveAll(log); }, REFRESH_MS);
  timer.unref?.();

  // The Gemini SDK calls the global fetch, which takes no agent. When the
  // target sits behind a proxy the request goes through Chromium's network
  // stack instead; with a direct connection nothing changes.
  const directFetch = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    return proxyFor(url) ? net.fetch(input, init) : directFetch(input, init);
  }) as typeof fetch;
}

/** Proxy URL in effect for `targetUrl`, or null for a direct connection. */
function proxyFor(targetUrl: string): string | null {
  const host = hostOf(targetUrl);
  if (!host || isLocal(host)) return null;
  if (activeLog && Date.now() - lastResolvedAt > STALE_MS) void resolveAll(activeLog);
  // An endpoint that was not resolved up front (a custom base URL) follows the override only.
  return (proxyByHost.has(host) ? proxyByHost.get(host) : envProxy) || null;
}

/**
 * Agent for a request to `targetUrl`, or undefined for a direct connection
 * (no proxy configured, a local endpoint such as LM Studio, or before
 * initNetworkProxy has run). Accepted by the OpenAI SDK (`httpAgent`),
 * node-fetch (`agent`) and ws (`agent`).
 */
export function getProxyAgent(targetUrl: string): Agent | undefined {
  const proxy = proxyFor(targetUrl);
  if (!proxy) return undefined;
  let agent = agents.get(proxy);
  if (!agent) {
    agent = new HttpsProxyAgent(proxy);
    agents.set(proxy, agent);
  }
  return agent;
}

/**
 * Error text for a failed provider call that says what actually went wrong.
 * The SDKs wrap socket failures in a bare "Connection error."; the cause
 * (DNS, refused proxy, certificate) and the route taken are what tell a
 * proxy problem apart from a bad key.
 */
export function describeNetworkError(error: any, targetUrl: string): string {
  const message = String(error?.message || 'Connection failed');
  // Walk the cause chain: the useful code is usually one or two levels down.
  const details: string[] = [];
  let cause = error?.cause;
  for (let depth = 0; cause && depth < 4; depth++, cause = cause.cause) {
    const text = [cause.code, cause.message].filter(Boolean).join(' ');
    if (text && !details.includes(text) && !message.includes(text)) details.push(text);
  }
  // An HTTP status came back, so the network path works: leave the message alone.
  if (typeof error?.status === 'number' && details.length === 0) return message;
  const looksLikeNetwork = details.length > 0 || /connection error|fetch failed|net::|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|certificate|socket/i.test(message);
  if (!looksLikeNetwork) return message;
  const proxy = proxyFor(targetUrl);
  const route = proxy ? `via proxy ${proxy.replace(/\/\/[^@/]*@/, '//***@')}` : 'direct, no proxy detected';
  return `${message}${details.length ? ` (${details.join('; ')})` : ''} [${route}]`;
}
