import { useMemo } from 'react';
import { Typography } from 'antd';
import type { QueryResult } from '../../types';

const { Text } = Typography;

type Aggregation = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface PivotConfig {
  rowField: string;
  colField: string;
  valueField: string;
  aggregation: Aggregation;
}

function aggregate(values: number[], fn: Aggregation): number {
  if (values.length === 0) return 0;
  switch (fn) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'count': return values.length;
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}

const TH: React.CSSProperties = {
  padding: '6px 10px',
  textAlign: 'left',
  background: '#1e2030',
  color: '#94a3b8',
  fontWeight: 600,
  borderBottom: '2px solid #2d2e4a',
  borderRight: '1px solid #2d2e4a',
  whiteSpace: 'nowrap',
  fontSize: 12,
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const TD_LABEL: React.CSSProperties = {
  padding: '4px 10px',
  background: '#1a1b2e',
  color: '#94a3b8',
  borderBottom: '1px solid #1e2030',
  borderRight: '2px solid #2d2e4a',
  whiteSpace: 'nowrap',
  fontSize: 12,
};

const TD_VALUE: React.CSSProperties = {
  padding: '4px 10px',
  textAlign: 'right',
  borderBottom: '1px solid #1e2030',
  borderRight: '1px solid #1e2030',
  color: '#e2e8f0',
  fontSize: 12,
};

interface Props {
  data: QueryResult;
  config: PivotConfig;
  height?: number;
}

export default function PivotTable({ data, config, height = 280 }: Props) {
  const { rowField, colField, valueField, aggregation } = config;

  const pivot = useMemo(() => {
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    const groups: Record<string, Record<string, number[]>> = {};

    for (const row of data.rows) {
      const r = String(row[rowField] ?? '');
      const c = String(row[colField] ?? '');
      const v = Number(row[valueField] ?? 0);
      rowSet.add(r);
      colSet.add(c);
      if (!groups[r]) groups[r] = {};
      if (!groups[r][c]) groups[r][c] = [];
      groups[r][c].push(v);
    }

    const rowValues = [...rowSet];
    const colValues = [...colSet];
    const cells: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};

    for (const r of rowValues) {
      cells[r] = {};
      const allRowVals: number[] = [];
      for (const c of colValues) {
        const vals = groups[r]?.[c] ?? [];
        cells[r][c] = aggregate(vals, aggregation);
        allRowVals.push(...vals);
      }
      rowTotals[r] = aggregate(allRowVals, aggregation);
    }

    for (const c of colValues) {
      const allColVals: number[] = [];
      for (const r of rowValues) allColVals.push(...(groups[r]?.[c] ?? []));
      colTotals[c] = aggregate(allColVals, aggregation);
    }

    const allVals = data.rows.map((r) => Number(r[valueField] ?? 0));
    const grandTotal = aggregate(allVals, aggregation);

    return { rowValues, colValues, cells, rowTotals, colTotals, grandTotal };
  }, [data, rowField, colField, valueField, aggregation]);

  const { rowValues, colValues, cells, rowTotals, colTotals, grandTotal } = pivot;

  if (rowValues.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text type="secondary">No data</Text>
      </div>
    );
  }

  return (
    <div style={{ height, overflowY: 'auto', overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...TH, minWidth: 120 }}>{rowField} \ {colField}</th>
            {colValues.map((c) => (
              <th key={c} style={{ ...TH, textAlign: 'right', minWidth: 80 }}>{c}</th>
            ))}
            <th style={{ ...TH, textAlign: 'right', color: '#a5b4fc', minWidth: 80 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rowValues.map((r) => (
            <tr key={r}>
              <td style={TD_LABEL}>{r}</td>
              {colValues.map((c) => (
                <td key={c} style={TD_VALUE}>{fmt(cells[r]?.[c] ?? 0)}</td>
              ))}
              <td style={{ ...TD_VALUE, color: '#6366f1', fontWeight: 600 }}>{fmt(rowTotals[r] ?? 0)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...TD_LABEL, color: '#a5b4fc', fontWeight: 600 }}>Total</td>
            {colValues.map((c) => (
              <td key={c} style={{ ...TD_VALUE, color: '#6366f1', fontWeight: 600 }}>{fmt(colTotals[c] ?? 0)}</td>
            ))}
            <td style={{ ...TD_VALUE, color: '#a5b4fc', fontWeight: 700 }}>{fmt(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
