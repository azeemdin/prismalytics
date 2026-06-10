import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Typography,
  Card,
  Select,
  Button,
  Space,
  Tag,
  Alert,
  Tabs,
  List,
  Tooltip,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Checkbox,
  Spin,
  App,
  Drawer,
  Avatar,
  TreeSelect,
  Popconfirm,
  Empty,
} from 'antd';
import dayjs from 'dayjs';
import {
  PlayCircleOutlined,
  SaveOutlined,
  HistoryOutlined,
  TableOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FolderAddOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RobotOutlined,
  FileTextOutlined,
  MessageOutlined,
  SendOutlined,
  UserOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  LockOutlined,
  TeamOutlined,
  GlobalOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  FileOutlined,
  FolderOutlined as FolderMoveIcon,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { format as formatSql } from 'sql-formatter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import { useThemeStore } from '../stores/theme.store';
import AgDataTable from '../components/common/AgDataTable';
import MongoQueryBuilder, { parsePipeline } from '../components/mongo/MongoQueryBuilder';
import type { MongoBuilderState } from '../components/mongo/MongoQueryBuilder';
import type { QueryResult, Datasource, SavedQuery, QueryExecution, QueryFolder, QueryVisibility } from '../types';

interface SchemaTable {
  name: string;
  schema?: string;
  columns: { name: string; type: string; nullable: boolean; isPrimary?: boolean }[];
}

const { Title, Text } = Typography;
const { Option } = Select;

const EDITOR_THEME_DARK = 'prismalytics-dark';
const EDITOR_THEME_LIGHT = 'prismalytics-light';

// Extract unique :paramName placeholders. Works for both SQL and MongoDB JSON.
// Requires param name to start with a letter/underscore to avoid matching
// digits in timestamps (:00, :30) or MongoDB operators.
function extractSqlParams(sql: string): string[] {
  const matches = [...sql.matchAll(/:([a-zA-Z_]\w*)/g)];
  return [...new Set(matches.map((m) => m[1]).filter((p): p is string => p !== undefined))];
}

function groupBySchema(tables: SchemaTable[]): Map<string, SchemaTable[]> {
  const map = new Map<string, SchemaTable[]>();
  for (const t of tables) {
    const s = t.schema ?? 'public';
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(t);
  }
  return map;
}

function buildSchemaContext(
  groups: Map<string, SchemaTable[]>,
  selectedSchemas: string[],
  selectedTables: Record<string, string[]> | null,
): string {
  const multiSchema = selectedSchemas.length > 1;
  const lines: string[] = [];
  for (const schema of selectedSchemas) {
    const tables = (groups.get(schema) ?? []).filter((t) =>
      selectedTables ? (selectedTables[schema] ?? []).includes(t.name) : true,
    );
    if (!tables.length) continue;
    if (multiSchema) lines.push(`Schema: ${schema}`);
    for (const table of tables) {
      const cols = table.columns.map((c) => `${c.name} ${c.type}${c.isPrimary ? ' PK' : ''}`).join(', ');
      lines.push(`${multiSchema ? '  ' : ''}Table ${table.name}(${cols})`);
    }
  }
  return lines.join('\n');
}

function useDatasources() {
  return useQuery<Datasource[]>({
    queryKey: ['datasources'],
    queryFn: async () => {
      const { data } = await api.get('/datasources');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : (payload.datasources ?? []);
    },
  });
}

function useDatasourceSchema(datasourceId: string) {
  return useQuery<{ tables: SchemaTable[] }>({
    queryKey: ['datasource-schema', datasourceId],
    queryFn: async () => {
      const { data } = await api.get(`/datasources/${datasourceId}/schema`);
      return data.data ?? data;
    },
    enabled: !!datasourceId,
    staleTime: 60_000,
  });
}

function useDatasourceDatabases(datasourceId: string) {
  return useQuery<string[]>({
    queryKey: ['datasource-databases', datasourceId],
    queryFn: async () => {
      const { data } = await api.get(`/datasources/${datasourceId}/databases`);
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
    enabled: !!datasourceId,
    staleTime: 60_000,
  });
}

function useDatasourceCollections(datasourceId: string, database: string) {
  return useQuery<string[]>({
    queryKey: ['datasource-collections', datasourceId, database],
    queryFn: async () => {
      const { data } = await api.get(
        `/datasources/${datasourceId}/collections?database=${encodeURIComponent(database)}`,
      );
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
    enabled: !!datasourceId && !!database,
    staleTime: 30_000,
  });
}

function useSavedQueries() {
  return useQuery<{ queries: SavedQuery[]; total: number }>({
    queryKey: ['saved-queries'],
    queryFn: async () => {
      const { data } = await api.get('/queries?limit=200');
      return data.data ?? data;
    },
  });
}

function useQueryFolders() {
  return useQuery<QueryFolder[]>({
    queryKey: ['query-folders'],
    queryFn: async () => {
      const { data } = await api.get('/query-folders');
      return data.data ?? data;
    },
  });
}

// Visibility badge helpers
const VISIBILITY_CONFIG: Record<QueryVisibility, { label: string; color: string; icon: React.ReactNode }> = {
  private: { label: 'Private', color: 'default', icon: <LockOutlined /> },
  team:    { label: 'Team',    color: 'blue',    icon: <TeamOutlined /> },
  editors: { label: 'Editors', color: 'green',   icon: <GlobalOutlined /> },
};

function VisibilityTag({ v }: { v: QueryVisibility }) {
  const cfg = VISIBILITY_CONFIG[v] ?? VISIBILITY_CONFIG.private;
  return (
    <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 10, lineHeight: '16px' }}>
      {cfg.label}
    </Tag>
  );
}

// Build a nested folder tree from a flat list
interface FolderNode { folder: QueryFolder; children: FolderNode[] }
function buildFolderTree(folders: QueryFolder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  folders.forEach((f) => map.set(f.id, { folder: f, children: [] }));
  const roots: FolderNode[] = [];
  folders.forEach((f) => {
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(map.get(f.id)!);
    } else {
      roots.push(map.get(f.id)!);
    }
  });
  return roots;
}

// Flatten folder tree into TreeSelect-compatible options
type FolderSelectNode = { value: string; title: string; children?: FolderSelectNode[] };
function folderTreeToSelectOptions(nodes: FolderNode[]): FolderSelectNode[] {
  return nodes.map(({ folder, children }) => ({
    value: folder.id,
    title: folder.name,
    children: children.length > 0 ? folderTreeToSelectOptions(children) : undefined,
  }));
}

// â”€â”€â”€ Stable module-level sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface QueryRowProps {
  q: SavedQuery;
  indent?: number;
  onLoad: (q: SavedQuery) => void;
  onDelete: (id: string) => void;
  onMove: (q: SavedQuery) => void;
  canDelete: boolean;
}
function SavedQueryRow({ q, indent = 0, onLoad, onDelete, onMove, canDelete }: QueryRowProps) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', paddingLeft: 8 + indent * 20,
        borderRadius: 6, background: 'transparent', transition: '100ms',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-elevated)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <FileOutlined style={{ color: 'var(--color-text-muted)', fontSize: 13, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{ fontSize: 13, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {q.name}
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {q.datasource?.name} Â· {q.runCount} run{q.runCount !== 1 ? 's' : ''}
        </Text>
      </div>
      <VisibilityTag v={q.visibility ?? 'editors'} />
      <Space size={4}>
        <Button size="small" onClick={() => onLoad(q)}>Load</Button>
        {canDelete && (
          <>
            <Tooltip title="Move to folder">
              <Button size="small" icon={<FolderMoveIcon />} onClick={() => onMove(q)} />
            </Tooltip>
            <Popconfirm title="Delete this query?" onConfirm={() => onDelete(q.id)} okButtonProps={{ danger: true }}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </>
        )}
      </Space>
    </div>
  );
}

interface FolderSectionProps {
  node: FolderNode;
  depth: number;
  savedQueries: SavedQuery[];
  expandedFolderIds: Set<string>;
  onToggle: (id: string) => void;
  onLoad: (q: SavedQuery) => void;
  onDeleteQuery: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onAddSubfolder: (parentId: string) => void;
  onEditFolder: (folder: QueryFolder) => void;
  onMoveQuery: (q: SavedQuery) => void;
  canModify: boolean;
}
function FolderSection({
  node, depth, savedQueries, expandedFolderIds,
  onToggle, onLoad, onDeleteQuery, onDeleteFolder, onAddSubfolder, onEditFolder, onMoveQuery, canModify,
}: FolderSectionProps) {
  const isExpanded = expandedFolderIds.has(node.folder.id);
  const folderQueries = savedQueries.filter((q) => q.folderId === node.folder.id);
  const sharedProps = { savedQueries, expandedFolderIds, onToggle, onLoad, onDeleteQuery, onDeleteFolder, onAddSubfolder, onEditFolder, onMoveQuery, canModify };
  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px', paddingLeft: 8 + depth * 20,
          borderRadius: 6, cursor: 'pointer', transition: '100ms',
          background: 'transparent',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-elevated)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        onClick={() => onToggle(node.folder.id)}
      >
        <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
          {isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
        </span>
        {isExpanded
          ? <FolderOpenOutlined style={{ color: '#6366f1', fontSize: 14 }} />
          : <FolderOutlined style={{ color: '#6366f1', fontSize: 14 }} />}
        <Text strong style={{ fontSize: 13, flex: 1 }}>{node.folder.name}</Text>
        <VisibilityTag v={node.folder.visibility} />
        <Text type="secondary" style={{ fontSize: 11 }}>{folderQueries.length}</Text>
        {canModify && (
          <Space size={2} onClick={(e) => e.stopPropagation()}>
            <Tooltip title="Add subfolder">
              <Button size="small" type="text" icon={<FolderAddOutlined />} style={{ padding: '0 4px' }}
                onClick={() => onAddSubfolder(node.folder.id)} />
            </Tooltip>
            <Tooltip title="Rename folder">
              <Button size="small" type="text" icon={<EditOutlined />} style={{ padding: '0 4px' }}
                onClick={() => onEditFolder(node.folder)} />
            </Tooltip>
            <Popconfirm title="Delete folder?" description="All queries inside will be permanently deleted." okButtonProps={{ danger: true }}
              onConfirm={() => onDeleteFolder(node.folder.id)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ padding: '0 4px' }} />
            </Popconfirm>
          </Space>
        )}
      </div>
      {isExpanded && (
        <div>
          {node.children.map((child) => (
            <FolderSection key={child.folder.id} node={child} depth={depth + 1} {...sharedProps} />
          ))}
          {folderQueries.map((q) => (
            <SavedQueryRow key={q.id} q={q} indent={depth + 1} onLoad={onLoad} onDelete={onDeleteQuery} onMove={onMoveQuery} canDelete={canModify} />
          ))}
          {node.children.length === 0 && folderQueries.length === 0 && (
            <Text type="secondary" style={{ display: 'block', fontSize: 11, paddingLeft: 8 + (depth + 1) * 20, paddingBottom: 4 }}>
              Empty folder
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

function useQueryHistory() {
  return useQuery<{ executions: QueryExecution[]; total: number }>({
    queryKey: ['query-history'],
    queryFn: async () => {
      const { data } = await api.get('/queries/history?limit=50');
      return data.data ?? data;
    },
  });
}

function ResultTable({ result, pageSize }: { result: QueryResult; pageSize: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text type="secondary">
          {result.rowCount.toLocaleString()} row{result.rowCount !== 1 ? 's' : ''} in {result.durationMs}ms
          {result.truncated && <Tag color="orange" style={{ marginLeft: 8 }}>Truncated at 10,000 rows</Tag>}
        </Text>
      </div>
      <AgDataTable result={result} height={300} pageSize={pageSize} />
    </div>
  );
}

export default function QueriesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const isViewer = useAuthStore((s) => s.user?.role === 'viewer');
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const themeMode = useThemeStore((s) => s.mode);
  const { data: datasources = [] } = useDatasources();
  const { data: historyData, isLoading: historyLoading } = useQueryHistory();
  const history = historyData?.executions ?? [];

  const [selectedDatasource, setSelectedDatasource] = useState<string>('');
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [mongoPageSize, setMongoPageSize] = useState<number>(50);
  const [mongoBuilderState, setMongoBuilderState] = useState<MongoBuilderState | undefined>(undefined);
  const [mongoBuilderKey, setMongoBuilderKey] = useState<string>('new');
  const selectedDs = datasources.find((d) => d.id === selectedDatasource);
  const isMongoDatasource = selectedDs?.type === 'mongodb';
  const isRestApiDatasource = selectedDs?.type === 'rest_api';
  const [sql, setSql] = useState<string>('SELECT * FROM ');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('editor');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  const [activeQueryName, setActiveQueryName] = useState<string>('');
  const [saveForm] = Form.useForm();
  const [nlPrompt, setNlPrompt] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [nlFlow, setNlFlow] = useState<'schema' | 'table' | null>(null);
  const [nlSelectedSchemas, setNlSelectedSchemas] = useState<string[]>([]);
  const [nlSelectedTables, setNlSelectedTables] = useState<Record<string, string[]>>({});
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [paramTypes, setParamTypes] = useState<Record<string, 'text' | 'number' | 'date' | 'datetime'>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<{ title: string; sections: { heading: string; content: string }[]; insights: string[] } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);

  // Saved queries folder tree and search
  const [querySearch, setQuerySearch] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderEditTarget, setFolderEditTarget] = useState<QueryFolder | null>(null);
  const [folderModalParentId, setFolderModalParentId] = useState<string | null>(null);
  const [folderForm] = Form.useForm();
  const [moveQueryTarget, setMoveQueryTarget] = useState<SavedQuery | null>(null);
  const [moveQueryFolderId, setMoveQueryFolderId] = useState<string | undefined>(undefined);

  const { data: savedQueriesData, refetch: refetchQueries } = useSavedQueries();
  const allSavedQueries = savedQueriesData?.queries ?? [];
  // Client-side search filter
  const savedQueries = querySearch.trim()
    ? allSavedQueries.filter((q) => q.name.toLowerCase().includes(querySearch.toLowerCase().trim()))
    : allSavedQueries;

  const { data: folders = [], refetch: refetchFolders } = useQueryFolders();
  const [optimizeSuggestions, setOptimizeSuggestions] = useState<{ category: string; description: string; severity: 'high' | 'medium' | 'low' }[]>([]);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  // Named params detected in the current SQL or MongoDB JSON
  const sqlParams = useMemo(() => extractSqlParams(sql), [sql]);

  const { data: schemaData } = useDatasourceSchema(selectedDatasource);
  const { data: databases = [] } = useDatasourceDatabases(selectedDatasource);
  const { data: collections = [] } = useDatasourceCollections(selectedDatasource, selectedDatabase);

  // Fields for the selected collection from schema if loaded, else from last result
  const schemaFields = useMemo(() => {
    const table = schemaData?.tables?.find(
      (t) => t.name === selectedCollection && (!t.schema || t.schema === selectedDatabase),
    );
    if (table) return table.columns.map((c) => ({ name: c.name, type: c.type }));
    if (result) return result.columns.map((c) => ({ name: c.name, type: c.type }));
    return [];
  }, [schemaData, selectedCollection, selectedDatabase, result]);
  const completionProviderRef = useRef<{ dispose: () => void } | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDatasource) throw new Error('Please select a data source first');
      // Build parameters object from only the params referenced in the current SQL
      const parameters =
        sqlParams.length > 0
          ? Object.fromEntries(sqlParams.map((p) => [p, paramValues[p] ?? '']))
          : undefined;
      const { data } = await api.post('/queries/execute', {
        sql,
        datasourceId: selectedDatasource,
        ...(selectedDatabase ? { targetDatabase: selectedDatabase } : {}),
        ...(selectedCollection ? { targetCollection: selectedCollection } : {}),
        ...(parameters ? { parameters } : {}),
      });
      return (data.data ?? data) as QueryResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setQueryError(null);
      setActiveTab('results');
      qc.invalidateQueries({ queryKey: ['query-history'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? (err as Error).message;
      setQueryError(msg);
      setResult(null);
      setActiveTab('results');
      qc.invalidateQueries({ queryKey: ['query-history'] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: { name: string; description?: string; folderId?: string; visibility?: QueryVisibility }) => {
      return api.post('/queries', {
        name: values.name,
        description: values.description,
        folderId: values.folderId || undefined,
        visibility: values.visibility ?? 'editors',
        datasourceId: selectedDatasource,
        sql,
        ...(isMongoDatasource && selectedCollection
          ? { targetCollection: selectedCollection, targetDatabase: selectedDatabase || undefined }
          : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-queries'] });
      message.success('Query saved');
      setSaveModalOpen(false);
      saveForm.resetFields();
      if (saveAsNew) {
        setActiveQueryId(null);
        setActiveQueryName('');
      }
    },
    onError: () => message.error('Failed to save query'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      return api.patch(`/queries/${activeQueryId}`, {
        sql,
        ...(isMongoDatasource && selectedCollection
          ? { targetCollection: selectedCollection, targetDatabase: selectedDatabase || undefined }
          : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-queries'] });
      message.success('Query updated');
    },
    onError: () => message.error('Failed to update query'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/queries/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-queries'] });
      message.success('Query deleted');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Failed to delete query';
      void message.error(msg, 6);
    },
  });

  const handleLoadQuery = useCallback((q: SavedQuery) => {
    const ds = datasources.find((d) => d.id === q.datasourceId);
    const isMongo = ds?.type === 'mongodb';
    setSql(q.sql);
    setSelectedDatasource(q.datasourceId);
    if (q.targetDatabase) setSelectedDatabase(q.targetDatabase);
    if (q.targetCollection) setSelectedCollection(q.targetCollection);
    setActiveQueryId(q.id);
    setActiveQueryName(q.name);
    setActiveTab('editor');
    if (isMongo) {
      const parsed = parsePipeline(q.sql);
      if (parsed.limit !== 50) setMongoPageSize(parsed.limit);
      setMongoBuilderState(parsed);
      setMongoBuilderKey(q.id);
    }
  }, [datasources]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleFolder = useCallback((id: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleAddSubfolder = useCallback((parentId: string) => {
    setFolderEditTarget(null);
    setFolderModalParentId(parentId);
    folderForm.resetFields();
    setFolderModalOpen(true);
  }, [folderForm]);

  const handleEditFolder = useCallback((folder: QueryFolder) => {
    setFolderEditTarget(folder);
    setFolderModalParentId(null);
    folderForm.setFieldsValue({ name: folder.name, visibility: folder.visibility });
    setFolderModalOpen(true);
  }, [folderForm]);

  const createFolderMutation = useMutation({
    mutationFn: (vals: { name: string; parentId?: string; visibility: QueryVisibility }) =>
      api.post('/query-folders', vals),
    onSuccess: () => {
      void refetchFolders();
      message.success('Folder created');
      setFolderModalOpen(false);
      folderForm.resetFields();
    },
    onError: () => message.error('Failed to create folder'),
  });

  const updateFolderMutation = useMutation({
    mutationFn: ({ id, ...vals }: { id: string; name: string; visibility: QueryVisibility }) =>
      api.patch(`/query-folders/${id}`, vals),
    onSuccess: () => {
      void refetchFolders();
      message.success('Folder updated');
      setFolderModalOpen(false);
      setFolderEditTarget(null);
      folderForm.resetFields();
    },
    onError: () => message.error('Failed to update folder'),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/query-folders/${id}`),
    onSuccess: () => {
      void refetchFolders();
      void refetchQueries();
      if (activeFolderId === deleteFolderMutation.variables) setActiveFolderId(undefined);
      message.success('Folder deleted queries moved to root');
    },
    onError: () => message.error('Failed to delete folder'),
  });

  const moveQueryMutation = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      api.patch(`/queries/${id}`, { folderId: folderId ?? '' }),
    onSuccess: () => {
      void refetchQueries();
      setMoveQueryTarget(null);
      setMoveQueryFolderId(undefined);
      message.success('Query moved');
    },
    onError: () => message.error('Failed to move query'),
  });

  const executeNlToSql = async (schemas: string[], tables: Record<string, string[]> | null) => {
    setNlFlow(null);
    setNlLoading(true);
    const allTables = schemaData?.tables ?? [];
    const groups = groupBySchema(allTables);
    const schemaContext = allTables.length > 0 ? buildSchemaContext(groups, schemas, tables) : undefined;
    try {
      const { data } = await api.post('/ai/nl-to-sql', {
        prompt: nlPrompt,
        datasourceId: selectedDatasource,
        ...(schemaContext ? { schemaContext } : {}),
      });
      const result = data.data ?? data;
      if (result.sql) {
        setSql(result.sql);
        setActiveTab('editor');
        message.success(`SQL generated via ${result.provider} (${result.model})`);
      } else {
        message.warning(result.message ?? 'No SQL generated');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? (err as Error).message;
      message.error(msg);
    } finally {
      setNlLoading(false);
    }
  };

  const handleNlToSql = () => {
    if (!selectedDatasource) {
      message.error('Select a data source before generating SQL');
      return;
    }
    if (!nlPrompt.trim()) return;

    const allTables = schemaData?.tables ?? [];
    const groups = groupBySchema(allTables);
    const schemaNames = [...groups.keys()];

    if (schemaNames.length > 2) {
      setNlSelectedSchemas(schemaNames);
      setNlSelectedTables(Object.fromEntries(schemaNames.map((s) => [s, (groups.get(s) ?? []).map((t) => t.name)])));
      setNlFlow('schema');
      return;
    }

    const totalTables = allTables.length;
    if (totalTables > 50) {
      setNlSelectedSchemas(schemaNames);
      setNlSelectedTables(Object.fromEntries(schemaNames.map((s) => [s, (groups.get(s) ?? []).map((t) => t.name)])));
      setNlFlow('table');
      return;
    }

    // â‰¤2 schemas and â‰¤50 tables send full context immediately
    void executeNlToSql(schemaNames.length > 0 ? schemaNames : ['public'], null);
  };

  // When user confirms schema selection, check table count and proceed or open table modal
  const handleSchemaConfirm = () => {
    const allTables = schemaData?.tables ?? [];
    const groups = groupBySchema(allTables);
    const tablesInSelectedSchemas = nlSelectedSchemas.flatMap((s) => groups.get(s) ?? []);
    if (tablesInSelectedSchemas.length > 50) {
      setNlSelectedTables(
        Object.fromEntries(nlSelectedSchemas.map((s) => [s, (groups.get(s) ?? []).map((t) => t.name)])),
      );
      setNlFlow('table');
    } else {
      void executeNlToSql(nlSelectedSchemas, null);
    }
  };

  const handleGenerateReport = async () => {
    if (!activeQueryId) {
      message.warning('Save the query first to generate a report.');
      return;
    }
    setReportOpen(true);
    setReportLoading(true);
    setReportData(null);
    try {
      const { data } = await api.post('/ai/generate-report', { queryId: activeQueryId });
      setReportData(data);
    } catch {
      message.error('Report generation failed. Check your AI configuration.');
    } finally {
      setReportLoading(false);
    }
  };

  const handleChatSend = async () => {
    const content = chatInput.trim();
    if (!content || chatLoading) return;
    const updated = [...chatMessages, { role: 'user', content }];
    setChatMessages(updated);
    setChatInput('');
    setChatLoading(true);
    try {
      const { data } = await api.post('/ai/chat', {
        messages: updated,
        datasourceId: selectedDatasource ?? undefined,
      });
      setChatMessages([...updated, { role: 'assistant', content: data.reply }]);
    } catch {
      message.error('Chat request failed.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!sql.trim() || !selectedDatasource) return;
    setOptimizeLoading(true);
    setOptimizeSuggestions([]);
    setOptimizeOpen(true);
    try {
      const { data } = await api.post('/ai/optimize-query', { sql, datasourceId: selectedDatasource });
      const payload = (data.data ?? data) as { suggestions: { category: string; description: string; severity: 'high' | 'medium' | 'low' }[] };
      setOptimizeSuggestions(payload.suggestions ?? []);
    } catch {
      message.error('Query optimization failed. Check your AI configuration.');
      setOptimizeOpen(false);
    } finally {
      setOptimizeLoading(false);
    }
  };

  const handleEditorMount = useCallback((editor: unknown, monaco: unknown) => {
    const m = monaco as typeof import('monaco-editor');
    monacoRef.current = m;
    m.editor.defineTheme(EDITOR_THEME_DARK, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '818cf8', fontStyle: 'bold' },
        { token: 'string', foreground: '86efac' },
        { token: 'number', foreground: 'fbbf24' },
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#0f1117',
        'editor.foreground': '#e2e8f0',
        'editor.lineHighlightBackground': '#1e2030',
        'editorLineNumber.foreground': '#4a5568',
        'editorCursor.foreground': '#6366f1',
      },
    });
    m.editor.defineTheme(EDITOR_THEME_LIGHT, {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '4f46e5', fontStyle: 'bold' },
        { token: 'string', foreground: '16a34a' },
        { token: 'number', foreground: 'd97706' },
        { token: 'comment', foreground: '94a3b8', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#1e293b',
        'editor.lineHighlightBackground': '#f1f5f9',
        'editorLineNumber.foreground': '#94a3b8',
        'editorCursor.foreground': '#6366f1',
      },
    });
    const currentMode = useThemeStore.getState().mode;
    m.editor.setTheme(currentMode === 'dark' ? EDITOR_THEME_DARK : EDITOR_THEME_LIGHT);

    const ed = editor as import('monaco-editor').editor.IStandaloneCodeEditor;

    // Ctrl+Enter to run
    ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => {
      executeMutation.mutate();
    });

    // Register SQL document formatter so "Format Document" works in SQL mode
    m.languages.registerDocumentFormattingEditProvider('sql', {
      provideDocumentFormattingEdits(model) {
        try {
          const formatted = formatSql(model.getValue(), {
            language: 'sql',
            tabWidth: 2,
            keywordCase: 'upper',
          });
          return [{ range: model.getFullModelRange(), text: formatted }];
        } catch {
          return [];
        }
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = monacoRef.current;
    if (!m) return;

    completionProviderRef.current?.dispose();
    completionProviderRef.current = null;

    if (!schemaData?.tables?.length) return;

    const tables = schemaData.tables;
    const tableNames = tables.map((t) => t.name);

    completionProviderRef.current = m.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.', '\n'],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const textUntilCursor = model
          .getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
          .toUpperCase();

        // After "tableName." â†’ column completions for that table
        const dotMatch = model
          .getValueInRange({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
          .match(/(\w+)\.\w*$/);
        if (dotMatch) {
          const tableAlias = (dotMatch[1] ?? '').toLowerCase();
          const table = tables.find((t) => t.name.toLowerCase() === tableAlias);
          if (table) {
            return {
              suggestions: table.columns.map((col) => ({
                label: col.name,
                kind: m.languages.CompletionItemKind.Field,
                detail: `${col.type}${col.nullable ? '' : ' NOT NULL'}${col.isPrimary ? ' PK' : ''}`,
                insertText: col.name,
                range,
              })),
            };
          }
        }

        const afterTableKeyword = /\b(FROM|JOIN|UPDATE|INTO)\s+\w*$/.test(textUntilCursor);
        const afterColumnKeyword = /\b(SELECT|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|ON|AND|OR|SET)\b/.test(textUntilCursor) && !afterTableKeyword;

        const suggestions: import('monaco-editor').languages.CompletionItem[] = [];

        if (afterTableKeyword) {
          tableNames.forEach((name) => {
            suggestions.push({
              label: name,
              kind: m.languages.CompletionItemKind.Class,
              detail: 'table',
              insertText: name,
              range,
            });
          });
        }

        if (afterColumnKeyword || (!afterTableKeyword && !dotMatch)) {
          tables.forEach((table) => {
            table.columns.forEach((col) => {
              suggestions.push({
                label: col.name,
                kind: m.languages.CompletionItemKind.Field,
                detail: `${table.name}.${col.name} (${col.type})`,
                insertText: col.name,
                sortText: `1_${col.name}`,
                range,
              });
            });
            // Also add qualified name
            suggestions.push({
              label: table.name,
              kind: m.languages.CompletionItemKind.Class,
              detail: 'table',
              insertText: table.name,
              sortText: `2_${table.name}`,
              range,
            });
          });
        }

        return { suggestions };
      },
    });

    return () => {
      completionProviderRef.current?.dispose();
      completionProviderRef.current = null;
    };
  }, [schemaData]);

  useEffect(() => {
    const m = monacoRef.current;
    if (!m) return;
    m.editor.setTheme(themeMode === 'dark' ? EDITOR_THEME_DARK : EDITOR_THEME_LIGHT);
  }, [themeMode]);

  const tabItems = [
    {
      key: 'editor',
      label: 'Editor',
      children: null,
    },
    {
      key: 'results',
      label: result ? `Results (${result.rowCount.toLocaleString()})` : 'Results',
      children: null,
    },
    {
      key: 'saved',
      label: `Saved (${allSavedQueries.length})`,
      children: null,
    },
    ...(isAdmin ? [{
      key: 'history',
      label: (
        <Space size={4}>
          <HistoryOutlined />
          {`History (${history.length})`}
        </Space>
      ),
      children: null,
    }] : []),
  ];

  return (
    <div style={{ height: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>SQL Editor</Title>
          <Text type="secondary">Write and execute queries against your data sources</Text>
        </div>
      </div>

      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }} styles={{ body: { padding: 0, flex: 1, display: 'flex', flexDirection: 'column' } }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <Select
            placeholder="Select data source"
            style={{ minWidth: 220 }}
            value={selectedDatasource || undefined}
            showSearch
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            onChange={(id) => {
              const ds = datasources.find((d) => d.id === id);
              setSelectedDatasource(id);
              setSelectedDatabase('');
              setSelectedCollection('');
              if (ds?.type === 'mongodb') {
                setSql('{\n  "collection": "myCollection",\n  "filter": {},\n  "limit": 100\n}');
              } else if (ds?.type === 'rest_api') {
                setSql('{\n  "method": "GET",\n  "path": "/"\n}');
              } else {
                setSql('SELECT * FROM ');
              }
            }}
          >
            {datasources.filter((d) => d.status === 'active').map((d) => (
              <Option key={d.id} value={d.id} label={d.name}>
                <Space>
                  <Tag style={{ margin: 0 }}>{d.type}</Tag>
                  {d.name}
                </Space>
              </Option>
            ))}
          </Select>

          {databases.length > 0 && (
            <Select
              placeholder={isMongoDatasource ? 'Select database' : 'Select schema'}
              style={{ minWidth: 160 }}
              value={selectedDatabase || undefined}
              allowClear
              showSearch
              filterOption={(input, option) =>
                String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(v) => {
                setSelectedDatabase(v ?? '');
                setSelectedCollection('');
              }}
            >
              {databases.map((db) => (
                <Option key={db} value={db}>{db}</Option>
              ))}
            </Select>
          )}

          {isMongoDatasource && selectedDatabase && collections.length > 0 && (
            <Select
              placeholder="Select collection"
              style={{ minWidth: 180 }}
              value={selectedCollection || undefined}
              allowClear
              showSearch
              filterOption={(input, option) =>
                String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(v) => {
                const col = v ?? '';
                setSelectedCollection(col);
                // Only seed the default template when the editor doesn't already hold
                // valid JSON (e.g. leftover SQL text). Preserves a loaded/built pipeline.
                if (col) {
                  try { JSON.parse(sql); } catch { setSql('{}'); }
                }
              }}
            >
              {collections.map((c) => (
                <Option key={c} value={c}>{c}</Option>
              ))}
            </Select>
          )}

          <Space>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={executeMutation.isPending}
              onClick={() => executeMutation.mutate()}
              disabled={!selectedDatasource || !sql.trim()}
            >
              Run
            </Button>
            {!isViewer && activeQueryId ? (
              <Space size={4}>
                <Tooltip title={`Update "${activeQueryName}"`}>
                  <Button
                    icon={<SaveOutlined />}
                    disabled={!selectedDatasource || !sql.trim()}
                    loading={updateMutation.isPending}
                    onClick={() => updateMutation.mutate()}
                  >
                    Update
                  </Button>
                </Tooltip>
                <Tooltip title="Save as a new query">
                  <Button
                    disabled={!selectedDatasource || !sql.trim()}
                    onClick={() => { setSaveAsNew(true); setSaveModalOpen(true); }}
                  >
                    Save as new
                  </Button>
                </Tooltip>
              </Space>
            ) : !isViewer ? (
              <Tooltip title="Save query">
                <Button
                  icon={<SaveOutlined />}
                  disabled={!selectedDatasource || !sql.trim()}
                  onClick={() => { setSaveAsNew(false); setSaveModalOpen(true); }}
                >
                  Save
                </Button>
              </Tooltip>
            ) : null}
          </Space>

          <Text type="secondary" style={{ marginLeft: 'auto', fontSize: 12 }}>
            Ctrl+Enter to run
          </Text>
        </div>

        {/* NL-to-SQL bar — hidden for REST API (no SQL generation applicable) */}
        <div style={{ display: isRestApiDatasource ? 'none' : 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-primary)' }}>
          <RobotOutlined style={{ color: '#6366f1', fontSize: 16, marginTop: 4 }} />
          <Input
            placeholder="Ask in plain English, e.g. Show top 10 customers by revenue this month"
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            onPressEnter={handleNlToSql}
            disabled={!selectedDatasource}
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          />
          <Button
            icon={<RobotOutlined />}
            loading={nlLoading}
            onClick={handleNlToSql}
            disabled={!selectedDatasource || !nlPrompt.trim()}
            style={{ borderColor: '#6366f1', color: '#6366f1' }}
          >
            Generate SQL
          </Button>
          <Tooltip title="Generate AI report for the active query">
            <Button
              icon={<FileTextOutlined />}
              onClick={() => void handleGenerateReport()}
              style={{ borderColor: '#6366f1', color: '#6366f1' }}
            >
              Report
            </Button>
          </Tooltip>
          <Tooltip title="Open AI chat assistant">
            <Button
              icon={<MessageOutlined />}
              onClick={() => setChatOpen(true)}
              style={{ borderColor: '#6366f1', color: '#6366f1' }}
            />
          </Tooltip>
          <Tooltip title="Analyse query for optimization opportunities">
            <Button
              icon={<ThunderboltOutlined />}
              loading={optimizeLoading}
              onClick={() => void handleOptimize()}
              disabled={!selectedDatasource || !sql.trim()}
              style={{ borderColor: '#6366f1', color: '#6366f1' }}
            />
          </Tooltip>
        </div>

        {/* Named parameter inputs shown when SQL contains :paramName placeholders */}
        {sqlParams.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Parameters:</Text>
            {sqlParams.map((param) => {
              const ptype = paramTypes[param] ?? 'text';
              return (
                <Space key={param} size={4} align="center">
                  <Text style={{ fontSize: 12, color: '#a5b4fc', fontFamily: 'monospace' }}>:{param}</Text>
                  <Select
                    size="small"
                    value={ptype}
                    style={{ width: 100 }}
                    onChange={(val: 'text' | 'number' | 'date' | 'datetime') =>
                      setParamTypes((prev) => ({ ...prev, [param]: val }))
                    }
                    options={[
                      { value: 'text', label: 'Text' },
                      { value: 'number', label: 'Number' },
                      { value: 'date', label: 'Date' },
                      { value: 'datetime', label: 'Date & Time' },
                    ]}
                  />
                  {ptype === 'text' && (
                    <Input
                      size="small"
                      style={{ width: 160 }}
                      placeholder="value"
                      value={paramValues[param] ?? ''}
                      onChange={(e) => setParamValues((prev) => ({ ...prev, [param]: e.target.value }))}
                      onPressEnter={() => executeMutation.mutate()}
                    />
                  )}
                  {ptype === 'number' && (
                    <InputNumber
                      size="small"
                      style={{ width: 160 }}
                      placeholder="value"
                      value={paramValues[param] !== undefined && paramValues[param] !== '' ? Number(paramValues[param]) : undefined}
                      onChange={(val) => setParamValues((prev) => ({ ...prev, [param]: val !== null ? String(val) : '' }))}
                      onPressEnter={() => executeMutation.mutate()}
                    />
                  )}
                  {ptype === 'date' && (
                    <DatePicker
                      size="small"
                      style={{ width: 160 }}
                      value={paramValues[param] ? dayjs(paramValues[param]) : null}
                      onChange={(d) => setParamValues((prev) => ({ ...prev, [param]: d ? d.format('YYYY-MM-DD') : '' }))}
                    />
                  )}
                  {ptype === 'datetime' && (
                    <DatePicker
                      size="small"
                      showTime
                      style={{ width: 200 }}
                      value={paramValues[param] ? dayjs(paramValues[param]) : null}
                      onChange={(d) => setParamValues((prev) => ({ ...prev, [param]: d ? d.toISOString() : '' }))}
                    />
                  )}
                </Space>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          style={{ padding: '0 16px' }}
          tabBarStyle={{ marginBottom: 0 }}
        />

        {/* MongoDB query builder shown when a collection is selected */}
        {isMongoDatasource && selectedCollection && (
          <>
            <div style={{ padding: '6px 16px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color="purple" style={{ margin: 0 }}>{selectedDatabase} / {selectedCollection}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Builder generates the pipeline below. Edit JSON directly if needed.
              </Text>
            </div>
            <MongoQueryBuilder
              key={mongoBuilderKey}
              initialState={mongoBuilderState}
              fields={schemaFields}
              pageSize={mongoPageSize}
              onPageSizeChange={setMongoPageSize}
              onQueryChange={setSql}
              onRun={() => executeMutation.mutate()}
              isRunning={executeMutation.isPending}
            />
          </>
        )}

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'hidden', padding: activeTab !== 'editor' ? 16 : 0 }}>
          {activeTab === 'editor' && (
            <Editor
              height="100%"
              language={isMongoDatasource || isRestApiDatasource ? 'json' : 'sql'}
              value={sql}
              onChange={(v) => setSql(v ?? '')}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineHeight: 22,
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                suggest: { showKeywords: true },
              }}
            />
          )}

          {activeTab === 'results' && (
            <>
              {queryError && (
                <Alert
                  type="error"
                  message="Query Error"
                  description={queryError}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}
              {result ? (
                <ResultTable result={result} pageSize={isMongoDatasource ? mongoPageSize : 50} />
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <TableOutlined style={{ fontSize: 32, color: '#4a5568', marginBottom: 8 }} />
                  <br />
                  <Text type="secondary">Run a query to see results here</Text>
                </div>
              )}
            </>
          )}

          {activeTab === 'saved' && (() => {
            const folderTree = buildFolderTree(folders);
            const isSearching = !!querySearch.trim();
            // When searching show filtered flat list; otherwise show tree with root (no-folder) queries
            const rootQueries = isSearching
              ? savedQueries                                         // already filtered by search above
              : allSavedQueries.filter((q) => !q.folderId);        // unfiled queries only
            const folderSectionProps = {
              savedQueries: allSavedQueries,  // full list so FolderSection can filter by folderId
              expandedFolderIds,
              onToggle: handleToggleFolder,
              onLoad: handleLoadQuery,
              onDeleteQuery: (id: string) => deleteMutation.mutate(id),
              onDeleteFolder: (id: string) => deleteFolderMutation.mutate(id),
              onAddSubfolder: handleAddSubfolder,
              onEditFolder: handleEditFolder,
              onMoveQuery: (q: SavedQuery) => { setMoveQueryTarget(q); setMoveQueryFolderId(q.folderId ?? undefined); },
              canModify: !isViewer,
            };
            return (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0 }}>
                  <Input
                    prefix={<SearchOutlined style={{ color: 'var(--color-text-muted)' }} />}
                    placeholder="Search saved queries..."
                    value={querySearch}
                    onChange={(e) => setQuerySearch(e.target.value)}
                    allowClear
                    style={{ flex: 1 }}
                  />
                  {!isViewer && (
                    <Tooltip title="New root folder">
                      <Button
                        icon={<FolderAddOutlined />}
                        onClick={() => {
                          setFolderEditTarget(null);
                          setFolderModalParentId(null);
                          folderForm.resetFields();
                          setFolderModalOpen(true);
                        }}
                      />
                    </Tooltip>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {isSearching ? (
                    savedQueries.length === 0
                      ? <Empty description="No queries match your search" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
                      : savedQueries.map((q) => (
                        <SavedQueryRow key={q.id} q={q} onLoad={handleLoadQuery} onDelete={(id) => deleteMutation.mutate(id)} onMove={(q) => { setMoveQueryTarget(q); setMoveQueryFolderId(q.folderId ?? undefined); }} canDelete={!isViewer} />
                      ))
                  ) : (
                    <>
                      {folderTree.map((node) => (
                        <FolderSection key={node.folder.id} node={node} depth={0} {...folderSectionProps} />
                      ))}
                      {rootQueries.map((q) => (
                        <SavedQueryRow key={q.id} q={q} onLoad={handleLoadQuery} onDelete={(id) => deleteMutation.mutate(id)} onMove={(q) => { setMoveQueryTarget(q); setMoveQueryFolderId(q.folderId ?? undefined); }} canDelete={!isViewer} />
                      ))}
                      {folderTree.length === 0 && rootQueries.length === 0 && (
                        <Empty description="No saved queries yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {activeTab === 'history' && isAdmin && (
            historyLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : (
              <List
                dataSource={history}
                locale={{ emptyText: 'No query history yet' }}
                renderItem={(exec) => (
                  <List.Item
                    actions={[
                      <Button
                        size="small"
                        key="load"
                        onClick={() => {
                          setSql(exec.sql);
                          if (exec.datasourceId) setSelectedDatasource(exec.datasourceId);
                          setActiveQueryId(null);
                          setActiveQueryName('');
                          setActiveTab('editor');
                        }}
                      >
                        Load
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        exec.success
                          ? <CheckCircleOutlined style={{ fontSize: 20, color: '#22c55e' }} />
                          : <CloseCircleOutlined style={{ fontSize: 20, color: '#ef4444' }} />
                      }
                      title={
                        <Text
                          code
                          style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 500 }}
                        >
                          {exec.sql.replace(/\s+/g, ' ').trim()}
                        </Text>
                      }
                      description={
                        <Space size={12}>
                          {exec.success ? (
                            <>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {(exec.rowCount ?? 0).toLocaleString()} rows
                              </Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {exec.durationMs}ms
                              </Text>
                            </>
                          ) : (
                            <Text type="danger" style={{ fontSize: 11 }}>{exec.errorMessage}</Text>
                          )}
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {new Date(exec.createdAt).toLocaleString()}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )
          )}
        </div>
      </Card>

      {/* Schema selection modal shown when datasource has >2 schemas */}
      <Modal
        title="Select schemas for AI context"
        open={nlFlow === 'schema'}
        onCancel={() => setNlFlow(null)}
        onOk={handleSchemaConfirm}
        okText="Next"
        okButtonProps={{ disabled: nlSelectedSchemas.length === 0 }}
        width={480}
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          This datasource has multiple schemas. Select which schemas the AI should know about.
        </Text>
        {(() => {
          const allSchemas = [...groupBySchema(schemaData?.tables ?? []).keys()];
          const allSelected = nlSelectedSchemas.length === allSchemas.length;
          return (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <Button
                  size="small"
                  disabled={allSelected}
                  onClick={() => setNlSelectedSchemas(allSchemas)}
                >
                  Select all
                </Button>
                <Button
                  size="small"
                  disabled={nlSelectedSchemas.length === 0}
                  onClick={() => setNlSelectedSchemas([])}
                >
                  Deselect all
                </Button>
              </div>
              <Checkbox.Group
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                value={nlSelectedSchemas}
                onChange={(vals) => setNlSelectedSchemas(vals as string[])}
              >
                {allSchemas.map((schema) => {
                  const tables = groupBySchema(schemaData?.tables ?? []).get(schema) ?? [];
                  return (
                    <Checkbox key={schema} value={schema}>
                      <Text strong>{schema}</Text>
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{tables.length} table{tables.length !== 1 ? 's' : ''}</Text>
                    </Checkbox>
                  );
                })}
              </Checkbox.Group>
            </>
          );
        })()}
      </Modal>

      {/* Table selection modal shown when selected schemas have >50 tables */}
      <Modal
        title="Select tables for AI context"
        open={nlFlow === 'table'}
        onCancel={() => setNlFlow(null)}
        onOk={() => executeNlToSql(nlSelectedSchemas, nlSelectedTables)}
        okText="Generate SQL"
        okButtonProps={{ disabled: nlSelectedSchemas.every((s) => !(nlSelectedTables[s]?.length)) }}
        width={540}
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Many tables found. Select only the tables relevant to your query to keep the AI prompt focused.
        </Text>
        {(() => {
          const groups = groupBySchema(schemaData?.tables ?? []);
          return nlSelectedSchemas.map((schema) => {
            const tables = groups.get(schema) ?? [];
            const selected = nlSelectedTables[schema] ?? [];
            const allSelected = selected.length === tables.length;
            return (
              <div key={schema} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text strong>{schema}</Text>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selected.length > 0 && !allSelected}
                    onChange={(e) =>
                      setNlSelectedTables((prev) => ({
                        ...prev,
                        [schema]: e.target.checked ? tables.map((t) => t.name) : [],
                      }))
                    }
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>Select all ({tables.length})</Text>
                  </Checkbox>
                </div>
                <Checkbox.Group
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 16, maxHeight: 200, overflowY: 'auto' }}
                  value={selected}
                  onChange={(vals) => setNlSelectedTables((prev) => ({ ...prev, [schema]: vals as string[] }))}
                >
                  {tables.map((t) => (
                    <Checkbox key={t.name} value={t.name}>
                      <Text style={{ fontSize: 13 }}>{t.name}</Text>
                      <Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>{t.columns.length} cols</Text>
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </div>
            );
          });
        })()}
      </Modal>

      <Modal
        title={saveAsNew ? 'Save as New Query' : 'Save Query'}
        open={saveModalOpen}
        onCancel={() => { setSaveModalOpen(false); saveForm.resetFields(); }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={saveForm}
          layout="vertical"
          onFinish={(v) => saveMutation.mutate(v)}
          initialValues={saveAsNew ? { name: `${activeQueryName} (copy)`, visibility: 'editors' } : { visibility: 'editors' }}
        >
          <Form.Item name="name" label="Query name" rules={[{ required: true }]}>
            <Input placeholder="Monthly revenue summary" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea placeholder="What does this query do?" rows={2} />
          </Form.Item>
          <Form.Item name="folderId" label="Save in folder">
            <TreeSelect
              placeholder="Root (no folder)"
              treeData={folderTreeToSelectOptions(buildFolderTree(folders))}
              allowClear
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item name="visibility" label="Visibility" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="private"><Space><LockOutlined />Private only me</Space></Select.Option>
              <Select.Option value="team"><Space><TeamOutlined />My team</Space></Select.Option>
              <Select.Option value="editors"><Space><GlobalOutlined />All editors</Space></Select.Option>
            </Select>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setSaveModalOpen(false); saveForm.resetFields(); }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>Save</Button>
          </div>
        </Form>
      </Modal>

      {/* Folder create / rename modal */}
      <Modal
        title={folderEditTarget ? 'Rename Folder' : 'New Folder'}
        open={folderModalOpen}
        onCancel={() => { setFolderModalOpen(false); setFolderEditTarget(null); folderForm.resetFields(); }}
        footer={null}
        destroyOnHidden
        width={380}
      >
        <Form
          form={folderForm}
          layout="vertical"
          initialValues={{ visibility: 'private' }}
          onFinish={(v: { name: string; visibility: QueryVisibility }) => {
            if (folderEditTarget) {
              updateFolderMutation.mutate({ id: folderEditTarget.id, name: v.name, visibility: v.visibility });
            } else {
              createFolderMutation.mutate({ name: v.name, visibility: v.visibility, parentId: folderModalParentId ?? undefined });
            }
          }}
        >
          <Form.Item name="name" label="Folder name" rules={[{ required: true, min: 1, max: 100 }]}>
            <Input placeholder="e.g. Finance Reports" autoFocus />
          </Form.Item>
          <Form.Item name="visibility" label="Visibility" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="private"><Space><LockOutlined />Private only me</Space></Select.Option>
              <Select.Option value="team"><Space><TeamOutlined />My team</Space></Select.Option>
              <Select.Option value="editors"><Space><GlobalOutlined />All editors</Space></Select.Option>
            </Select>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setFolderModalOpen(false); setFolderEditTarget(null); folderForm.resetFields(); }}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createFolderMutation.isPending || updateFolderMutation.isPending}
            >
              {folderEditTarget ? 'Save' : 'Create Folder'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Move Query Modal */}
      <Modal
        title={`Move "${moveQueryTarget?.name ?? ''}" to folder`}
        open={!!moveQueryTarget}
        onCancel={() => { setMoveQueryTarget(null); setMoveQueryFolderId(undefined); }}
        footer={
          <Space>
            <Button onClick={() => { setMoveQueryTarget(null); setMoveQueryFolderId(undefined); }}>Cancel</Button>
            <Button
              type="primary"
              loading={moveQueryMutation.isPending}
              onClick={() => moveQueryTarget && moveQueryMutation.mutate({ id: moveQueryTarget.id, folderId: moveQueryFolderId ?? null })}
            >
              Move
            </Button>
          </Space>
        }
      >
        <TreeSelect
          style={{ width: '100%' }}
          placeholder="Root (no folder)"
          value={moveQueryFolderId}
          onChange={(v) => setMoveQueryFolderId(v as string | undefined)}
          treeData={folderTreeToSelectOptions(buildFolderTree(folders))}
          allowClear
          treeDefaultExpandAll
          showSearch
          treeNodeFilterProp="title"
        />
      </Modal>

            {/* AI Report Modal */}
      <Modal
        title="AI Report"
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        width={720}
        footer={
          <Space>
            <Button onClick={() => window.print()}>Export as PDF</Button>
            <Button type="primary" onClick={() => setReportOpen(false)}>Close</Button>
          </Space>
        }
      >
        {reportLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" tip="Analyzing data..." />
          </div>
        ) : reportData ? (
          <div>
            <Typography.Title level={4}>{reportData.title}</Typography.Title>
            {reportData.sections.map((s, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <Typography.Title level={5} style={{ marginBottom: 4 }}>{s.heading}</Typography.Title>
                <Typography.Paragraph>{s.content}</Typography.Paragraph>
              </div>
            ))}
            {reportData.insights.length > 0 && (
              <div>
                <Typography.Title level={5}>Key Insights</Typography.Title>
                <ul style={{ paddingLeft: 20 }}>
                  {reportData.insights.map((insight, i) => <li key={i}>{insight}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
            Save the query first, then click Report to generate an AI analysis.
          </div>
        )}
      </Modal>

      {/* Query Optimization Modal */}
      <Modal
        title={<span><ThunderboltOutlined style={{ color: '#6366f1', marginRight: 8 }} />Query Optimization Advisor</span>}
        open={optimizeOpen}
        onCancel={() => setOptimizeOpen(false)}
        footer={<Button type="primary" onClick={() => setOptimizeOpen(false)}>Close</Button>}
        width={640}
      >
        {optimizeLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" tip="Analyzing query..." />
          </div>
        ) : optimizeSuggestions.length === 0 ? (
          <Alert type="success" showIcon message="No optimization opportunities found query looks good!" />
        ) : (
          <List
            dataSource={optimizeSuggestions}
            renderItem={(s) => (
              <List.Item>
                <List.Item.Meta
                  avatar={
                    <Tag color={s.severity === 'high' ? 'red' : s.severity === 'medium' ? 'orange' : 'blue'}>
                      {s.severity}
                    </Tag>
                  }
                  title={<Text style={{ textTransform: 'capitalize' }}>{s.category}</Text>}
                  description={s.description}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>

      {/* AI Chat Drawer */}
      <Drawer
        title="AI Assistant"
        placement="right"
        width={400}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        mask={false}
        styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0, height: '100%' } }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {chatMessages.length === 0 && (
            <Typography.Text type="secondary" style={{ textAlign: 'center', marginTop: 32, display: 'block' }}>
              Ask me to write SQL, explain data, or help with analysis.
            </Typography.Text>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <Avatar
                size={28}
                icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                style={{ backgroundColor: msg.role === 'user' ? '#6366f1' : 'var(--color-bg-elevated)', flexShrink: 0 }}
              />
              <div style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: 8,
                background: msg.role === 'user' ? '#6366f1' : 'var(--color-bg-elevated)',
                border: msg.role === 'assistant' ? '1px solid var(--color-border)' : 'none',
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Avatar size={28} icon={<RobotOutlined />} style={{ backgroundColor: 'var(--color-bg-elevated)' }} />
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}>
                <Spin size="small" />
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8 }}>
          <Input.TextArea
            rows={2}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleChatSend(); } }}
            placeholder="Ask about your data..."
            style={{ resize: 'none' }}
            disabled={chatLoading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => void handleChatSend()}
            loading={chatLoading}
            style={{ alignSelf: 'flex-end', height: 32 }}
          />
        </div>
      </Drawer>
    </div>
  );
}
