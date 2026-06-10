import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import {
  Button,
  Select,
  Input,
  Space,
  Typography,
  Switch,
  AutoComplete,
  Tooltip,
  DatePicker,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  GroupOutlined,
  CalendarOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

const FILTER_OPS = [
  { value: '$eq', label: '= equals' },
  { value: '$ne', label: '!= not equals' },
  { value: '$gt', label: '> greater than' },
  { value: '$gte', label: '>= greater or equal' },
  { value: '$lt', label: '< less than' },
  { value: '$lte', label: '<= less or equal' },
  { value: '$regex', label: '~ contains (regex)' },
  { value: '$in', label: 'in list (a,b,c)' },
  { value: '$exists', label: 'exists' },
  { value: '$nexists', label: 'does not exist' },
];

const AGG_FNS = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];

export const PAGE_SIZES = [10, 25, 50, 100, 500];

interface FilterRow { id: string; field: string; op: string; value: string; valueType: 'text' | 'date' }
interface SortRow   { id: string; field: string; dir: '1' | '-1' }
interface GroupAgg  { id: string; alias: string; fn: string; field: string }

export interface MongoBuilderState {
  filters: FilterRow[];
  sort: SortRow[];
  groupEnabled: boolean;
  groupField: string;
  aggs: GroupAgg[];
  limit: number;
}

export interface MongoQueryBuilderProps {
  fields: Array<{ name: string; type: string }>;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  onQueryChange: (pipeline: string) => void;
  onRun: () => void;
  isRunning: boolean;
  initialState?: MongoBuilderState;
}

let _id = 0;
const uid = () => String(++_id);

function parseVal(s: string): unknown {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  const n = Number(s);
  return !isNaN(n) && s.trim() !== '' ? n : s;
}

function valToString(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '$date' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>)['$date'] as string;
  }
  return String(v);
}

export function parsePipeline(sql: string): MongoBuilderState {
  const empty: MongoBuilderState = {
    filters: [], sort: [], groupEnabled: false, groupField: '',
    aggs: [{ id: uid(), alias: 'count', fn: 'count', field: '' }], limit: 50,
  };
  try {
    const pipeline = JSON.parse(sql);
    if (!Array.isArray(pipeline)) return empty;

    const filters: FilterRow[] = [];
    const sort: SortRow[] = [];
    let groupEnabled = false;
    let groupField = '';
    const aggs: GroupAgg[] = [];
    let limit = 50;

    for (const stage of pipeline as Record<string, unknown>[]) {
      if (stage.$match) {
        for (const [field, cond] of Object.entries(stage.$match as Record<string, unknown>)) {
          if (cond === null || typeof cond !== 'object') {
            filters.push({ id: uid(), field, op: '$eq', value: valToString(cond), valueType: 'text' });
            continue;
          }
          const c = cond as Record<string, unknown>;
          const ops = Object.keys(c);
          const op = ops[0];
          if (!op) continue;

          if (op === '$exists') {
            filters.push({ id: uid(), field, op: c.$exists ? '$exists' : '$nexists', value: '', valueType: 'text' });
          } else if (op === '$in') {
            const arr = (c.$in as unknown[]) ?? [];
            const firstItem = arr[0];
            const isDate = firstItem !== null && typeof firstItem === 'object' && '$date' in (firstItem as Record<string, unknown>);
            const valueStr = isDate
              ? ((firstItem as Record<string, unknown>)['$date'] as string)
              : arr.map(valToString).join(',');
            filters.push({ id: uid(), field, op: '$in', value: valueStr, valueType: isDate ? 'date' : 'text' });
          } else if (op === '$regex') {
            filters.push({ id: uid(), field, op: '$regex', value: String(c.$regex ?? ''), valueType: 'text' });
          } else {
            const rawVal = c[op];
            const isDate = rawVal !== null && typeof rawVal === 'object' && '$date' in (rawVal as Record<string, unknown>);
            filters.push({
              id: uid(), field, op,
              value: isDate ? ((rawVal as Record<string, unknown>)['$date'] as string) : valToString(rawVal),
              valueType: isDate ? 'date' : 'text',
            });
          }
        }
      } else if (stage.$group) {
        groupEnabled = true;
        const g = stage.$group as Record<string, unknown>;
        if (typeof g._id === 'string' && g._id.startsWith('$')) {
          groupField = g._id.slice(1);
        }
        for (const [alias, expr] of Object.entries(g)) {
          if (alias === '_id') continue;
          const e = expr as Record<string, unknown>;
          if (e.$sum === 1 || e.$sum === '1') {
            aggs.push({ id: uid(), alias, fn: 'count', field: '' });
          } else if (e.$sum !== undefined) {
            aggs.push({ id: uid(), alias, fn: 'sum', field: typeof e.$sum === 'string' ? e.$sum.replace(/^\$/, '') : '' });
          } else if (e.$avg !== undefined) {
            aggs.push({ id: uid(), alias, fn: 'avg', field: typeof e.$avg === 'string' ? e.$avg.replace(/^\$/, '') : '' });
          } else if (e.$min !== undefined) {
            aggs.push({ id: uid(), alias, fn: 'min', field: typeof e.$min === 'string' ? e.$min.replace(/^\$/, '') : '' });
          } else if (e.$max !== undefined) {
            aggs.push({ id: uid(), alias, fn: 'max', field: typeof e.$max === 'string' ? e.$max.replace(/^\$/, '') : '' });
          }
        }
      } else if (stage.$sort) {
        for (const [field, dir] of Object.entries(stage.$sort as Record<string, unknown>)) {
          sort.push({ id: uid(), field, dir: String(dir) as '1' | '-1' });
        }
      } else if (stage.$limit !== undefined) {
        limit = Number(stage.$limit) || 50;
      }
    }

    return {
      filters,
      sort,
      groupEnabled,
      groupField,
      aggs: aggs.length > 0 ? aggs : [{ id: uid(), alias: 'count', fn: 'count', field: '' }],
      limit,
    };
  } catch {
    return empty;
  }
}

function buildPipeline(
  filters: FilterRow[],
  sort: SortRow[],
  groupEnabled: boolean,
  groupField: string,
  aggs: GroupAgg[],
  limit: number,
): string {
  const stages: Record<string, unknown>[] = [];

  const match: Record<string, unknown> = {};
  for (const f of filters) {
    if (!f.field) continue;
    if (f.op === '$exists')  { match[f.field] = { $exists: true };  continue; }
    if (f.op === '$nexists') { match[f.field] = { $exists: false }; continue; }
    if (!f.value) continue;
    if (f.op === '$regex')   { match[f.field] = { $regex: f.value, $options: 'i' }; continue; }
    if (f.op === '$in') {
      match[f.field] = {
        $in: f.valueType === 'date'
          ? [{ $date: f.value }]
          : f.value.split(',').map(v => parseVal(v.trim())),
      };
      continue;
    }
    match[f.field] = { [f.op]: f.valueType === 'date' ? { $date: f.value } : parseVal(f.value) };
  }
  if (Object.keys(match).length > 0) stages.push({ $match: match });

  if (groupEnabled && groupField) {
    const g: Record<string, unknown> = { _id: `$${groupField}` };
    for (const a of aggs) {
      if (!a.alias) continue;
      g[a.alias] = a.fn === 'count' ? { $sum: 1 } : { [`$${a.fn}`]: a.field ? `$${a.field}` : 1 };
    }
    stages.push({ $group: g });
  }

  const sortDoc: Record<string, 1 | -1> = {};
  for (const s of sort) {
    if (s.field) sortDoc[s.field] = Number(s.dir) as 1 | -1;
  }
  if (Object.keys(sortDoc).length > 0) stages.push({ $sort: sortDoc });

  stages.push({ $limit: limit });

  if (stages.length === 1) stages.unshift({ $match: {} });

  return JSON.stringify(stages, null, 2);
}

function FieldInput({
  value,
  fields,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  fields: Array<{ name: string; type?: string }>;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const opts = fields.map(f => ({ value: f.name }));
  return (
    <AutoComplete
      size="small"
      value={value}
      options={opts}
      onChange={onChange}
      placeholder={placeholder ?? 'field'}
      filterOption={(input, opt) =>
        (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())
      }
      style={style}
    />
  );
}

export default function MongoQueryBuilder({
  fields,
  pageSize,
  onPageSizeChange,
  onQueryChange,
  onRun,
  isRunning,
  initialState,
}: MongoQueryBuilderProps) {
  const [filters, setFilters]           = useState<FilterRow[]>(initialState?.filters ?? []);
  const [sort, setSort]                 = useState<SortRow[]>(initialState?.sort ?? []);
  const [groupEnabled, setGroupEnabled] = useState(initialState?.groupEnabled ?? false);
  const [groupField, setGroupField]     = useState(initialState?.groupField ?? '');
  const [aggs, setAggs]                 = useState<GroupAgg[]>(
    initialState?.aggs ?? [{ id: uid(), alias: 'count', fn: 'count', field: '' }],
  );

  const regenerate = useCallback(() => {
    onQueryChange(buildPipeline(filters, sort, groupEnabled, groupField, aggs, pageSize));
  }, [filters, sort, groupEnabled, groupField, aggs, pageSize, onQueryChange]);

  useEffect(() => { regenerate(); }, [regenerate]);

  const addFilter    = () => setFilters(p => [...p, { id: uid(), field: '', op: '$eq', value: '', valueType: 'text' }]);
  const removeFilter = (id: string) => setFilters(p => p.filter(f => f.id !== id));
  const patchFilter  = (id: string, patch: Partial<FilterRow>) =>
    setFilters(p => p.map(f => f.id === id ? { ...f, ...patch } : f));

  const addSort    = () => setSort(p => [...p, { id: uid(), field: '', dir: '-1' }]);
  const removeSort = (id: string) => setSort(p => p.filter(s => s.id !== id));
  const patchSort  = (id: string, patch: Partial<SortRow>) =>
    setSort(p => p.map(s => s.id === id ? { ...s, ...patch } : s));

  const addAgg    = () => setAggs(p => [...p, { id: uid(), alias: '', fn: 'count', field: '' }]);
  const removeAgg = (id: string) => setAggs(p => p.filter(a => a.id !== id));
  const patchAgg  = (id: string, patch: Partial<GroupAgg>) =>
    setAggs(p => p.map(a => a.id === id ? { ...a, ...patch } : a));

  const labelStyle: React.CSSProperties = { fontSize: 11, color: '#a5b4fc', fontWeight: 600, letterSpacing: '0.05em' };
  const emptyStyle: React.CSSProperties = { fontSize: 11, color: '#4a5568' };

  return (
    <div style={{ background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)', padding: '10px 16px' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── Filters ─────────────────────────────────────── */}
        <div style={{ flex: '1 1 320px', minWidth: 260 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Space size={4}>
              <FilterOutlined style={{ color: '#6366f1', fontSize: 11 }} />
              <Text style={labelStyle}>FILTER</Text>
            </Space>
            <Button size="small" type="text" icon={<PlusOutlined />} onClick={addFilter} style={{ color: '#6366f1', fontSize: 11 }}>
              Add
            </Button>
          </div>
          {filters.length === 0
            ? <Text style={emptyStyle}>No filters — returns all documents</Text>
            : filters.map(f => (
              <div key={f.id} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                <FieldInput
                  value={f.field} fields={fields}
                  onChange={v => {
                    const fieldDef = fields.find(fd => fd.name === v);
                    const isDate = fieldDef?.type === 'date';
                    patchFilter(f.id, { field: v, valueType: isDate ? 'date' : 'text', value: '' });
                  }}
                  style={{ flex: '2 1 80px', minWidth: 70 }}
                />
                <Select size="small" value={f.op} onChange={v => patchFilter(f.id, { op: v })} style={{ flex: '1.5 1 80px', minWidth: 90 }}>
                  {FILTER_OPS.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
                {!['$exists', '$nexists'].includes(f.op) && (
                  f.valueType === 'date' ? (
                    <DatePicker
                      size="small"
                      showTime
                      value={f.value ? dayjs(f.value) : null}
                      onChange={(d: Dayjs | null) => patchFilter(f.id, { value: d ? d.toISOString() : '' })}
                      style={{ flex: '2 1 80px', minWidth: 160 }}
                    />
                  ) : (
                    <Input
                      size="small" value={f.value} placeholder="value"
                      onChange={e => patchFilter(f.id, { value: e.target.value })}
                      style={{ flex: '2 1 80px', minWidth: 70 }}
                    />
                  )
                )}
                <Tooltip title={f.valueType === 'date' ? 'Switch to text input' : 'Switch to date picker'}>
                  <Button
                    size="small"
                    type="text"
                    icon={<CalendarOutlined />}
                    onClick={() => patchFilter(f.id, { valueType: f.valueType === 'date' ? 'text' : 'date', value: '' })}
                    style={{ color: f.valueType === 'date' ? '#6366f1' : '#4a5568' }}
                  />
                </Tooltip>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeFilter(f.id)} />
              </div>
            ))
          }
        </div>

        {/* ── Sort ────────────────────────────────────────── */}
        <div style={{ flex: '0 1 220px', minWidth: 180 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Space size={4}>
              <SortAscendingOutlined style={{ color: '#6366f1', fontSize: 11 }} />
              <Text style={labelStyle}>SORT</Text>
            </Space>
            <Button size="small" type="text" icon={<PlusOutlined />} onClick={addSort} style={{ color: '#6366f1', fontSize: 11 }}>
              Add
            </Button>
          </div>
          {sort.length === 0
            ? <Text style={emptyStyle}>Natural order</Text>
            : sort.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                <FieldInput
                  value={s.field} fields={fields}
                  onChange={v => patchSort(s.id, { field: v })}
                  style={{ flex: 2 }}
                />
                <Select size="small" value={s.dir} onChange={v => patchSort(s.id, { dir: v })} style={{ flex: 1, minWidth: 70 }}>
                  <Option value="-1">Desc</Option>
                  <Option value="1">Asc</Option>
                </Select>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeSort(s.id)} />
              </div>
            ))
          }
        </div>

        {/* ── Group By ────────────────────────────────────── */}
        <div style={{ flex: '0 1 280px', minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Switch size="small" checked={groupEnabled} onChange={setGroupEnabled} />
            <Space size={4}>
              <GroupOutlined style={{ color: groupEnabled ? '#6366f1' : '#4a5568', fontSize: 11 }} />
              <Text style={{ ...labelStyle, color: groupEnabled ? '#a5b4fc' : '#4a5568' }}>GROUP BY</Text>
            </Space>
          </div>
          {!groupEnabled
            ? <Text style={emptyStyle}>Off — returns raw documents</Text>
            : (
              <>
                <FieldInput
                  value={groupField} fields={fields}
                  onChange={setGroupField}
                  placeholder="Group by field"
                  style={{ width: '100%', marginBottom: 6 }}
                />
                {aggs.map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                    <Select size="small" value={a.fn} onChange={v => patchAgg(a.id, { fn: v })} style={{ flex: 1, minWidth: 70 }}>
                      {AGG_FNS.map(fn => <Option key={fn.value} value={fn.value}>{fn.label}</Option>)}
                    </Select>
                    {a.fn !== 'count' && (
                      <FieldInput
                        value={a.field} fields={fields}
                        onChange={v => patchAgg(a.id, { field: v })}
                        placeholder="field"
                        style={{ flex: 1 }}
                      />
                    )}
                    <Input
                      size="small" value={a.alias} placeholder="alias"
                      onChange={e => patchAgg(a.id, { alias: e.target.value })}
                      style={{ flex: 1, minWidth: 60 }}
                    />
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeAgg(a.id)} />
                  </div>
                ))}
                <Button size="small" type="text" icon={<PlusOutlined />} onClick={addAgg} style={{ color: '#6366f1', fontSize: 11, marginTop: 2 }}>
                  Add aggregation
                </Button>
              </>
            )
          }
        </div>

        {/* ── Limit + Run ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 20, justifyContent: 'flex-start' }}>
          <Space size={6}>
            <Text style={{ fontSize: 11, color: '#94a3b8' }}>Limit</Text>
            <Select size="small" value={pageSize} onChange={onPageSizeChange} style={{ width: 72 }}>
              {PAGE_SIZES.map(n => <Option key={n} value={n}>{n}</Option>)}
            </Select>
          </Space>
          <Tooltip title="Ctrl+Enter">
            <Button type="primary" size="small" icon={<PlayCircleOutlined />} loading={isRunning} onClick={onRun}>
              Run
            </Button>
          </Tooltip>
        </div>

      </div>
    </div>
  );
}
