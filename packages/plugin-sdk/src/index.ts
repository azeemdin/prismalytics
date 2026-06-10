/**
 * @prismalytics/plugin-sdk
 *
 * SDK for developing prismalytics plugins (data connectors, chart types, auth providers).
 * Full implementation coming in Phase 3.
 */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: 'datasource' | 'visualization' | 'auth' | 'export';
  description: string;
  author: string;
}

export interface DataSourcePlugin {
  manifest: PluginManifest;
  connect(config: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  executeQuery(sql: string): Promise<unknown>;
  getSchema(): Promise<unknown>;
}

export interface VisualizationPlugin {
  manifest: PluginManifest;
  render(container: HTMLElement, data: unknown, config: unknown): void;
  destroy(): void;
}

export type Plugin = DataSourcePlugin | VisualizationPlugin;
