import { Injectable } from '@nestjs/common';

interface Counter {
  value: number;
  labels: Record<string, string>;
}

interface HistogramBucket {
  le: number;
  count: number;
}

interface Histogram {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

// Latency buckets in milliseconds
const LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

@Injectable()
export class MetricsService {
  // query_executions_total{status}
  private readonly queryCounters = new Map<string, number>();

  // query_duration_ms histogram
  private queryHistogram: Histogram = {
    buckets: LATENCY_BUCKETS.map((le) => ({ le, count: 0 })),
    sum: 0,
    count: 0,
  };

  // cache_operations_total{result}
  private readonly cacheCounters = new Map<string, number>();

  recordQuery(status: 'success' | 'error', durationMs: number) {
    const key = `status="${status}"`;
    this.queryCounters.set(key, (this.queryCounters.get(key) ?? 0) + 1);
    this.observeHistogram(this.queryHistogram, durationMs);
  }

  recordCacheHit() {
    const key = 'result="hit"';
    this.cacheCounters.set(key, (this.cacheCounters.get(key) ?? 0) + 1);
  }

  recordCacheMiss() {
    const key = 'result="miss"';
    this.cacheCounters.set(key, (this.cacheCounters.get(key) ?? 0) + 1);
  }

  private observeHistogram(h: Histogram, value: number) {
    h.sum += value;
    h.count++;
    for (const bucket of h.buckets) {
      if (value <= bucket.le) bucket.count++;
    }
  }

  renderPrometheusText(): string {
    const lines: string[] = [];

    // query_executions_total
    lines.push('# HELP prismalytics_query_executions_total Total query executions by status');
    lines.push('# TYPE prismalytics_query_executions_total counter');
    for (const [labels, value] of this.queryCounters) {
      lines.push(`prismalytics_query_executions_total{${labels}} ${value}`);
    }

    // query_duration_ms histogram
    lines.push('# HELP prismalytics_query_duration_ms Query execution latency in milliseconds');
    lines.push('# TYPE prismalytics_query_duration_ms histogram');
    for (const bucket of this.queryHistogram.buckets) {
      lines.push(`prismalytics_query_duration_ms_bucket{le="${bucket.le}"} ${bucket.count}`);
    }
    lines.push(`prismalytics_query_duration_ms_bucket{le="+Inf"} ${this.queryHistogram.count}`);
    lines.push(`prismalytics_query_duration_ms_sum ${this.queryHistogram.sum}`);
    lines.push(`prismalytics_query_duration_ms_count ${this.queryHistogram.count}`);

    // cache_operations_total
    lines.push('# HELP prismalytics_cache_operations_total Query cache hit/miss counts');
    lines.push('# TYPE prismalytics_cache_operations_total counter');
    for (const [labels, value] of this.cacheCounters) {
      lines.push(`prismalytics_cache_operations_total{${labels}} ${value}`);
    }

    return lines.join('\n') + '\n';
  }

  getJson() {
    return {
      queries: {
        total: [...this.queryCounters.values()].reduce((a, b) => a + b, 0),
        byStatus: Object.fromEntries(this.queryCounters),
        avgDurationMs:
          this.queryHistogram.count > 0
            ? Math.round(this.queryHistogram.sum / this.queryHistogram.count)
            : 0,
      },
      cache: {
        operations: Object.fromEntries(this.cacheCounters),
      },
    };
  }
}
