import { useRef, useMemo, useCallback, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  colorSchemeDark,
} from 'ag-grid-community';
import type { GridReadyEvent, ColDef, ICellRendererParams, CellDoubleClickedEvent } from 'ag-grid-community';
import { Button, Space, Typography, Modal } from 'antd';
import { DownloadOutlined, ExpandAltOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import type { QueryResult } from '../../types';

ModuleRegistry.registerModules([AllCommunityModule]);

const { Text } = Typography;

const appTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: '#1a1b2e',
  headerBackgroundColor: '#1e1f36',
  oddRowBackgroundColor: '#1a1b2e',
  rowHoverColor: '#1e2030',
  borderColor: '#2d2e4a',
  foregroundColor: '#e2e8f0',
  headerTextColor: '#e2e8f0',
  inputFocusBorder: { color: '#6366f1' },
  selectedRowBackgroundColor: '#6366f120',
  rangeSelectionBorderColor: '#6366f1',
  fontSize: 12,
  rowHeight: 36,
  headerHeight: 38,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
});

function isJsonObject(v: unknown): v is object {
  return typeof v === 'object' && v !== null;
}

function tryParseJson(v: unknown): object | null {
  if (isJsonObject(v)) return v;
  if (typeof v === 'string' && v.length > 1 && (v[0] === '{' || v[0] === '[')) {
    try { return JSON.parse(v) as object; } catch { return null; }
  }
  return null;
}

function DefaultCell({ value }: ICellRendererParams) {
  if (value === null || value === undefined) {
    return <Text type="secondary" italic style={{ fontSize: 12 }}>NULL</Text>;
  }
  if (typeof value === 'boolean') {
    return <span style={{ color: value ? '#22c55e' : '#ef4444', fontSize: 12 }}>{String(value)}</span>;
  }
  const parsed = tryParseJson(value);
  if (parsed !== null) {
    const label = Array.isArray(parsed)
      ? `[ ${(parsed as unknown[]).length} item${(parsed as unknown[]).length !== 1 ? 's' : ''} ]`
      : '{ ... }';
    return (
      <span style={{ color: '#a5b4fc', fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
        {label}
        <ExpandAltOutlined style={{ marginLeft: 4, fontSize: 10, color: '#6366f1' }} />
      </span>
    );
  }
  return <span style={{ fontSize: 12 }}>{String(value)}</span>;
}

interface Props {
  result: QueryResult;
  height?: number;
  showExport?: boolean;
  pageSize?: number;
}

export default function AgDataTable({ result, height = 320, showExport = true, pageSize = 50 }: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const [jsonModal, setJsonModal] = useState<object | null>(null);

  const columnDefs = useMemo<ColDef[]>(() =>
    result.columns.map((col) => ({
      field: col.name,
      headerName: col.name,
      filter: true,
      sortable: true,
      resizable: true,
      minWidth: 80,
      flex: 1,
      cellRenderer: DefaultCell,
    })),
    [result.columns],
  );

  const rowData = useMemo(() => result.rows, [result.rows]);

  const onGridReady = useCallback((event: GridReadyEvent) => {
    event.api.sizeColumnsToFit();
  }, []);

  const onCellDoubleClicked = useCallback((event: CellDoubleClickedEvent) => {
    const parsed = tryParseJson(event.value);
    if (parsed !== null) setJsonModal(parsed);
  }, []);

  const exportCsv = useCallback(() => {
    gridRef.current?.api?.exportDataAsCsv({ fileName: 'query-results.csv' });
  }, []);

  const exportExcel = useCallback(() => {
    const ws = XLSX.utils.json_to_sheet(result.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, 'query-results.xlsx');
  }, [result.rows]);

  return (
    <div>
      {showExport && (
        <Space style={{ marginBottom: 8 }}>
          <Button size="small" icon={<DownloadOutlined />} onClick={exportCsv}>CSV</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={exportExcel}>Excel</Button>
        </Space>
      )}
      <div style={{ height, width: '100%' }}>
        <AgGridReact
          ref={gridRef}
          theme={appTheme}
          columnDefs={columnDefs}
          rowData={rowData}
          onGridReady={onGridReady}
          onCellDoubleClicked={onCellDoubleClicked}
          pagination
          paginationPageSize={pageSize}
          paginationPageSizeSelector={[10, 25, 50, 100, 500]}
          defaultColDef={{ filter: true, sortable: true, resizable: true }}
          enableCellTextSelection
        />
      </div>

      <Modal
        title="Field value"
        open={jsonModal !== null}
        onCancel={() => setJsonModal(null)}
        footer={<Button onClick={() => setJsonModal(null)}>Close</Button>}
        width={680}
      >
        <pre style={{
          background: '#0f1117',
          border: '1px solid #2d2e4a',
          borderRadius: 6,
          padding: 16,
          maxHeight: 480,
          overflow: 'auto',
          fontSize: 12,
          color: '#e2e8f0',
          margin: 0,
        }}>
          {jsonModal !== null ? JSON.stringify(jsonModal, null, 2) : ''}
        </pre>
      </Modal>
    </div>
  );
}
