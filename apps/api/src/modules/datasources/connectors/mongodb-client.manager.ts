import { MongoClient, MongoClientOptions } from 'mongodb';
import { createHash } from 'crypto';

interface ClientEntry {
  client: MongoClient;
  lastUsedAt: number;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const clients = new Map<string, ClientEntry>();

export function getSharedMongoClient(uri: string): MongoClient {
  const key = createHash('sha256').update(uri).digest('hex').slice(0, 24);
  const existing = clients.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.client;
  }

  const options: MongoClientOptions = {
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
    minPoolSize: 1,
  };

  // MongoClient v6 connects lazily — no explicit connect() call needed
  const client = new MongoClient(uri, options);
  clients.set(key, { client, lastUsedAt: Date.now() });
  return client;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of clients.entries()) {
    if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
      void entry.client.close();
      clients.delete(key);
    }
  }
}, 60_000).unref();
