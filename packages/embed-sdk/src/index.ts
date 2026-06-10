/**
 * @prismalytics/embed-sdk
 *
 * Lightweight SDK for embedding prismalytics dashboards into any web page.
 *
 * Usage (module):
 *   import { embedDashboard } from '@prismalytics/embed-sdk';
 *   embedDashboard({ token: 'abc123', container: '#dashboard', baseUrl: 'https://bi.company.com' });
 *
 * Usage (<script> tag):
 *   <script src="embed-sdk.js"></script>
 *   <script>prismalyticsEmbed.embedDashboard({ token: 'abc123', container: '#dashboard' });</script>
 */

export interface EmbedOptions {
  /** Public share token from the dashboard share dialog */
  token: string;
  /** CSS selector string or HTMLElement to mount the iframe into */
  container: HTMLElement | string;
  /** Base URL of your prismalytics instance. Defaults to window.location.origin */
  baseUrl?: string;
  /** iframe width. Defaults to '100%' */
  width?: string | number;
  /** iframe height. Defaults to '600px' */
  height?: string | number;
  /** 'dark' (default) or 'light' passed as a query param for future theme support */
  theme?: 'dark' | 'light';
  /** Extra CSS class added to the iframe element */
  className?: string;
}

export interface EmbedHandle {
  /** Remove the iframe and clean up */
  destroy(): void;
  /** Replace the share token with a new one without re-mounting */
  setToken(token: string): void;
  /** Reference to the underlying iframe element */
  iframe: HTMLIFrameElement;
}

function resolveContainer(selector: HTMLElement | string): HTMLElement {
  if (typeof selector === 'string') {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`[prismalyticsEmbed] Container not found: "${selector}"`);
    return el;
  }
  return selector;
}

function buildUrl(baseUrl: string, token: string, theme: string): string {
  const url = new URL(`/public/dashboards/${token}`, baseUrl);
  url.searchParams.set('theme', theme);
  return url.toString();
}

export function embedDashboard(options: EmbedOptions): EmbedHandle {
  const container = resolveContainer(options.container);
  const base = options.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const theme = options.theme ?? 'dark';

  const iframe = document.createElement('iframe');
  iframe.src = buildUrl(base, options.token, theme);
  iframe.style.width = typeof options.width === 'number' ? `${options.width}px` : (options.width ?? '100%');
  iframe.style.height = typeof options.height === 'number' ? `${options.height}px` : (options.height ?? '600px');
  iframe.style.border = 'none';
  iframe.style.borderRadius = '8px';
  iframe.style.display = 'block';
  iframe.allow = 'fullscreen';
  iframe.title = 'prismalytics Dashboard';
  if (options.className) iframe.className = options.className;

  container.appendChild(iframe);

  return {
    iframe,
    destroy() {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    },
    setToken(token: string) {
      iframe.src = buildUrl(base, token, theme);
    },
  };
}

// Browser global for <script> tag usage
declare global {
  interface Window {
    prismalyticsEmbed: { embedDashboard: typeof embedDashboard };
  }
}

if (typeof window !== 'undefined') {
  window.prismalyticsEmbed = { embedDashboard };
}
