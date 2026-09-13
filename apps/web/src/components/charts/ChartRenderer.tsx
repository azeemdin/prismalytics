import ReactECharts from 'echarts-for-react';
import { Typography } from 'antd';
import AgDataTable from '../common/AgDataTable';
import PivotTable from './PivotTable';
import type { ChartType, QueryResult } from '../../types';

const { Text } = Typography;

interface ColumnMapping {
  xAxis?: string;
  yAxis?: string | string[];
  series?: string;
  value?: string;
  label?: string;
}

interface Props {
  chartType: ChartType;
  data?: QueryResult;
  columnMapping?: ColumnMapping;
  chartConfig?: Record<string, unknown>;
  height?: number;
  onElementClick?: (params: { field: string; value: unknown }) => void;
}

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

// Normalize column names and row keys to lowercase so that columnMapping always
// resolves correctly regardless of datasource case conventions (Oracle → UPPER,
// PostgreSQL → lower, MSSQL → mixed).  Only applied inside chart rendering;
// table/pivot views intentionally receive the original casing.
// `folded` reports whether the rename actually happened — every column reference
// used against the returned data (columnMapping, chartConfig fields) must be
// folded the same way, or lookups miss and every value reads as undefined.
function normalizeData(data: QueryResult): { data: QueryResult; folded: boolean } {
  const lowered = data.columns.map((c) => c.name.toLowerCase());
  const needed  = data.columns.some((c, i) => c.name !== lowered[i]);
  // Skip folding when it would collide: a case-sensitive datasource can expose
  // both "Total" and "total", and merging them would silently drop a column.
  if (!needed || new Set(lowered).size !== lowered.length) return { data, folded: false };
  return {
    data: {
      ...data,
      columns: data.columns.map((c, i) => ({ ...c, name: lowered[i] })),
      rows: data.rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) out[k.toLowerCase()] = v;
        return out;
      }),
    },
    folded: true,
  };
}

// columnMapping is captured from the query's original column names (Oracle hands
// back CHANNEL / TOTAL), so it has to travel through the same fold as the rows.
function normalizeMapping(mapping: ColumnMapping | undefined, folded: boolean): ColumnMapping {
  if (!mapping) return {};
  if (!folded) return mapping;
  const fold = (v?: string) => (v === undefined ? undefined : v.toLowerCase());
  return {
    ...mapping,
    xAxis:  fold(mapping.xAxis),
    yAxis:  Array.isArray(mapping.yAxis) ? mapping.yAxis.map((c) => c.toLowerCase()) : fold(mapping.yAxis),
    series: fold(mapping.series),
    value:  fold(mapping.value),
    label:  fold(mapping.label),
  };
}

function getColumnValues(data: QueryResult, col: string): unknown[] {
  return data.rows.map((r) => r[col]);
}

function buildOption(props: Props): unknown {
  const { chartType, chartConfig = {} } = props;
  if (!props.data || props.data.rows.length === 0) return {};
  const { data, folded } = normalizeData(props.data);
  const columnMapping = normalizeMapping(props.columnMapping, folded);

  const showLegend = chartConfig.legend !== false;
  const isStacked  = Boolean(chartConfig.stacked);
  const isSmooth   = chartConfig.smooth !== false;
  const isHoriz    = Boolean(chartConfig.horizontal);
  const isDonut    = Boolean(chartConfig.donut);

  const axisBase = {
    axisLine: { lineStyle: { color: '#2d2e4a' } },
    axisLabel: { color: '#94a3b8' },
    splitLine: { lineStyle: { color: '#2d2e4a' } },
  };
  const tooltipBase = {
    trigger: 'axis' as const,
    backgroundColor: '#1a1b2e',
    borderColor: '#2d2e4a',
    textStyle: { color: '#e2e8f0' },
  };
  const gridBase = { left: 50, right: 20, top: showLegend ? 50 : 24, bottom: 40 };
  const legendOpt = showLegend ? { legend: { textStyle: { color: '#94a3b8' }, top: 8 } } : {};

  const xCol = columnMapping?.xAxis ?? data.columns[0]?.name ?? '';
  const rawYCol = columnMapping?.yAxis ?? data.columns[1]?.name ?? '';
  const yCols: string[] = Array.isArray(rawYCol) ? rawYCol : rawYCol ? [rawYCol] : [];
  const xData = getColumnValues(data, xCol);

  switch (chartType) {
    case 'line': {
      const series = yCols.map((col, i) => ({
        name: col,
        type: 'line' as const,
        data: getColumnValues(data, col),
        smooth: isSmooth,
        lineStyle: { color: PALETTE[i % PALETTE.length], width: 2 },
        itemStyle: { color: PALETTE[i % PALETTE.length] },
        areaStyle: i === 0 && yCols.length === 1
          ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#6366f140' }, { offset: 1, color: 'transparent' }] } }
          : undefined,
      }));
      return {
        ...legendOpt,
        tooltip: tooltipBase,
        grid: gridBase,
        xAxis: { type: 'category', data: xData, ...axisBase, splitLine: { show: false } },
        yAxis: { type: 'value', ...axisBase },
        backgroundColor: 'transparent',
        series,
      };
    }

    case 'bar': {
      const series = yCols.map((col, i) => ({
        name: col,
        type: 'bar' as const,
        data: getColumnValues(data, col),
        stack: isStacked ? 'total' : undefined,
        itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: isStacked ? 0 : [4, 4, 0, 0] },
      }));
      return {
        ...legendOpt,
        tooltip: tooltipBase,
        grid: gridBase,
        xAxis: isHoriz ? { type: 'value', ...axisBase } : { type: 'category', data: xData, ...axisBase, splitLine: { show: false } },
        yAxis: isHoriz ? { type: 'category', data: xData, ...axisBase, splitLine: { show: false } } : { type: 'value', ...axisBase },
        backgroundColor: 'transparent',
        series: isHoriz ? series.map((s) => ({ ...s, itemStyle: { ...s.itemStyle, borderRadius: [0, 4, 4, 0] } })) : series,
      };
    }

    case 'area': {
      const series = yCols.map((col, i) => ({
        name: col,
        type: 'line' as const,
        data: getColumnValues(data, col),
        smooth: isSmooth,
        stack: isStacked ? 'total' : undefined,
        lineStyle: { color: PALETTE[i % PALETTE.length] },
        itemStyle: { color: PALETTE[i % PALETTE.length] },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: PALETTE[i % PALETTE.length] + '80' }, { offset: 1, color: PALETTE[i % PALETTE.length] + '10' }] },
        },
      }));
      return {
        ...legendOpt,
        tooltip: tooltipBase,
        grid: gridBase,
        xAxis: { type: 'category', data: xData, ...axisBase, splitLine: { show: false } },
        yAxis: { type: 'value', ...axisBase },
        backgroundColor: 'transparent',
        series,
      };
    }

    case 'scatter': {
      const yCol = yCols[0] ?? '';
      return {
        ...legendOpt,
        tooltip: { ...tooltipBase, trigger: 'item' },
        grid: gridBase,
        xAxis: { type: 'value', ...axisBase },
        yAxis: { type: 'value', ...axisBase },
        backgroundColor: 'transparent',
        series: [{ type: 'scatter', data: data.rows.map((r) => [r[xCol], r[yCol]]), itemStyle: { color: '#6366f1', opacity: 0.8 }, symbolSize: 8 }],
      };
    }

    case 'pie': {
      const labelCol = columnMapping?.label ?? data.columns[0]?.name ?? '';
      const valCol   = columnMapping?.value  ?? data.columns[1]?.name ?? '';
      return {
        ...legendOpt,
        tooltip: { ...tooltipBase, trigger: 'item' },
        backgroundColor: 'transparent',
        series: [{
          type: 'pie',
          radius: isDonut ? ['40%', '70%'] : ['0%', '70%'],
          data: data.rows.map((r, i) => ({ name: String(r[labelCol] ?? ''), value: r[valCol], itemStyle: { color: PALETTE[i % PALETTE.length] } })),
          label: { color: '#94a3b8' },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: '#6366f140' } },
        }],
      };
    }

    case 'funnel': {
      const labelCol = columnMapping?.label ?? data.columns[0]?.name ?? '';
      const valCol   = columnMapping?.value  ?? data.columns[1]?.name ?? '';
      return {
        ...legendOpt,
        tooltip: { ...tooltipBase, trigger: 'item' },
        backgroundColor: 'transparent',
        series: [{
          type: 'funnel',
          left: '10%',
          width: '80%',
          label: { position: 'inside', color: '#e2e8f0' },
          data: data.rows.map((r, i) => ({ name: String(r[labelCol] ?? ''), value: r[valCol], itemStyle: { color: PALETTE[i % PALETTE.length] } })),
        }],
      };
    }

    case 'gauge': {
      const valCol = columnMapping?.value ?? data.columns[0]?.name ?? '';
      const rawVal = data.rows[0]?.[valCol];
      const val    = typeof rawVal === 'number' ? rawVal : Number(rawVal ?? 0);
      return {
        tooltip: { ...tooltipBase, trigger: 'item' },
        backgroundColor: 'transparent',
        series: [{
          type: 'gauge',
          detail: { formatter: '{value}', color: '#e2e8f0' },
          axisLabel: { color: '#94a3b8' },
          axisTick: { lineStyle: { color: '#2d2e4a' } },
          splitLine: { lineStyle: { color: '#2d2e4a' } },
          axisLine: { lineStyle: { color: [[1, '#6366f1']] } },
          data: [{ value: val, name: valCol }],
        }],
      };
    }

    case 'heatmap': {
      const yCol   = yCols[0] ?? data.columns[1]?.name ?? '';
      const valCol = columnMapping?.value ?? data.columns[2]?.name ?? '';
      const xValues = [...new Set(data.rows.map((r) => String(r[xCol] ?? '')))];
      const yValues = [...new Set(data.rows.map((r) => String(r[yCol] ?? '')))];
      const heatData = data.rows.map((r) => [
        xValues.indexOf(String(r[xCol] ?? '')),
        yValues.indexOf(String(r[yCol] ?? '')),
        r[valCol],
      ]);
      return {
        tooltip: { ...tooltipBase, trigger: 'item' },
        backgroundColor: 'transparent',
        grid: gridBase,
        xAxis: { type: 'category', data: xValues, ...axisBase, splitLine: { show: false } },
        yAxis: { type: 'category', data: yValues, ...axisBase, splitLine: { show: false } },
        visualMap: { min: 0, max: Math.max(...data.rows.map((r) => Number(r[valCol] ?? 0))), calculable: true, inRange: { color: ['#1e1f36', '#6366f1'] }, textStyle: { color: '#94a3b8' } },
        series: [{ type: 'heatmap', data: heatData, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: '#6366f140' } } }],
      };
    }

    case 'treemap': {
      const labelCol = columnMapping?.label ?? data.columns[0]?.name ?? '';
      const valCol   = columnMapping?.value  ?? data.columns[1]?.name ?? '';
      return {
        tooltip: { ...tooltipBase, trigger: 'item' },
        backgroundColor: 'transparent',
        series: [{
          type: 'treemap',
          data: data.rows.map((r, i) => ({ name: String(r[labelCol] ?? ''), value: r[valCol], itemStyle: { color: PALETTE[i % PALETTE.length] } })),
          label: { show: true, color: '#e2e8f0' },
          breadcrumb: { show: false },
          itemStyle: { borderColor: '#1a1b2e', borderWidth: 2, gapWidth: 2 },
          levels: [{ itemStyle: { borderColor: '#2d2e4a', borderWidth: 3, gapWidth: 3 } }],
        }],
      };
    }

    default:
      return {};
  }
}

export default function ChartRenderer({ chartType, data, columnMapping, chartConfig, height = 280, onElementClick }: Props) {
  if (chartType === 'metric') {
    if (!data || data.rows.length === 0) {
      return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text type="secondary">No data</Text></div>;
    }
    const { data: nd, folded } = normalizeData(data);
    const cm     = normalizeMapping(columnMapping, folded);
    const valCol = cm.value ?? nd.columns[0]?.name ?? '';
    const rawVal = nd.rows[0]?.[valCol];
    const label  = cm.label ? String(nd.rows[0]?.[cm.label] ?? valCol) : valCol;
    return (
      <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Text style={{ fontSize: 48, fontWeight: 700, color: '#6366f1', lineHeight: 1 }}>
          {typeof rawVal === 'number' ? rawVal.toLocaleString() : String(rawVal ?? '-')}
        </Text>
        <Text type="secondary" style={{ fontSize: 13 }}>{label}</Text>
      </div>
    );
  }

  if (chartType === 'table') {
    if (!data || data.rows.length === 0) {
      return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text type="secondary">No data</Text></div>;
    }
    return <AgDataTable result={data} height={height - 44} showExport={true} />;
  }

  if (chartType === 'pivot') {
    if (!data || data.rows.length === 0) {
      return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text type="secondary">No data</Text></div>;
    }
    const { data: nd, folded } = normalizeData(data);
    const field = (configured: unknown, fallback?: string) => {
      const name = (configured as string) || fallback || '';
      return folded ? name.toLowerCase() : name;
    };
    const rowField    = field(chartConfig?.rowField,   nd.columns[0]?.name);
    const colField    = field(chartConfig?.colField,   nd.columns[1]?.name);
    const valueField  = field(chartConfig?.valueField, nd.columns[2]?.name);
    const aggregation = (chartConfig?.aggregation as 'sum' | 'count' | 'avg' | 'min' | 'max') || 'sum';
    return <PivotTable data={nd} config={{ rowField, colField, valueField, aggregation }} height={height} />;
  }

  if (!data || data.rows.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text type="secondary">No data</Text>
      </div>
    );
  }

  // buildOption handles all chartConfig flags internally — never spread chartConfig
  // directly into ECharts options (booleans like `legend: false` crash ECharts).
  const option = buildOption({ chartType, data, columnMapping, chartConfig });

  const handleClick = onElementClick
    ? (eParams: Record<string, unknown>) => {
        const field = ['pie', 'funnel', 'treemap'].includes(chartType)
          ? (columnMapping?.label ?? data.columns[0]?.name ?? '')
          : (columnMapping?.xAxis ?? data.columns[0]?.name ?? '');
        onElementClick({ field, value: eParams.name });
      }
    : undefined;

  return (
    <ReactECharts
      option={option}
      style={{ height }}
      opts={{ renderer: 'canvas' }}
      notMerge
      onEvents={handleClick ? { click: handleClick } : undefined}
    />
  );
}
