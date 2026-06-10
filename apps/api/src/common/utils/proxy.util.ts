// Module-level proxy state — populated by SystemConfigModule.onModuleInit() from DB,
// and refreshed on every PATCH /system-config/proxy without a server restart.
let _enabled = false;
let _url: string | null = null;
let _noProxy: string | null = null;

export function applyProxyConfig(enabled: boolean, url: string | null, noProxy: string | null): void {
  _enabled = enabled;
  _url = url;
  _noProxy = noProxy;

  // Set environment variables so libraries that respect them (axios, node-fetch, etc.) pick them up.
  if (enabled && url) {
    process.env.HTTP_PROXY = url;
    process.env.HTTPS_PROXY = url;
    process.env.http_proxy = url;
    process.env.https_proxy = url;
    if (noProxy) {
      process.env.NO_PROXY = noProxy;
      process.env.no_proxy = noProxy;
    } else {
      delete process.env.NO_PROXY;
      delete process.env.no_proxy;
    }
  } else {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  }
}

// Returns an undici ProxyAgent when proxy is enabled.
// undici is bundled with Node 18+ so no extra package is needed.
// Falls back to undefined if undici is unavailable (env vars still apply for other libs).
export function getProxyDispatcher(): unknown {
  if (!_enabled || !_url) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ProxyAgent } = require('undici') as { ProxyAgent: new (url: string) => unknown };
    return new ProxyAgent(_url);
  } catch {
    return undefined;
  }
}

export function proxyConfig(): { enabled: boolean; url: string | null; noProxy: string | null } {
  return { enabled: _enabled, url: _url, noProxy: _noProxy };
}
