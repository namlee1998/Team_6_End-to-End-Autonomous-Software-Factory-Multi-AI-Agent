import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Tree,
  type MoveHandler,
  type NodeApi,
  type NodeRendererProps,
  type RenameHandler,
} from 'react-arborist';
import { createPortal } from 'react-dom';
import { renderAsync } from 'docx-preview';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApiActions } from '@/hooks/useApiActions';
import { useAppStore } from '@/store';
import type { DocumentItem, FolderItem, ProjectItem } from '@/services/api';
import type { DocPreviewCacheItem } from '@/store/useAppStore';

const TEXT_TYPES = ['text/plain', 'text/markdown', 'application/json', 'text/yaml', 'text/x-yaml'];
const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTS = ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'txt', 'md', 'json', 'yaml', 'yml'];

type TreeNodeType = 'project' | 'folder' | 'file';

interface TreeNodeData {
  id: string;
  type: TreeNodeType;
  name: string;
  projectId: string;
  folderId?: string | null;
  parentId?: string | null;
  document?: DocumentItem;
  children?: TreeNodeData[];
}

interface NameDialogState {
  open: boolean;
  title: string;
  label: string;
  submitLabel: string;
  mode: 'create-project' | 'create-folder' | 'rename';
  initialValue: string;
  parentNodeId?: string | null;
  targetNodeId?: string | null;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  nodeId: string | null;
}

interface ProcessingState {
  message: string;
  nodeId: string | null;
}

function makeNodeId(type: TreeNodeType, id: string) {
  return `${type}:${id}`;
}

function parseNodeId(nodeId: string): { type: TreeNodeType; rawId: string } {
  const [type, rawId] = nodeId.split(':');
  return { type: type as TreeNodeType, rawId };
}

function isTextType(type: string, name?: string) {
  if (TEXT_TYPES.includes(type)) return true;
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  return ['txt', 'md', 'json', 'yaml', 'yml'].includes(ext);
}

function isMarkdownType(type: string, name?: string) {
  if (type === 'text/markdown' || type === 'text/x-markdown') return true;
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  return ['md', 'markdown'].includes(ext);
}

function isImageType(type: string, name?: string) {
  if (IMAGE_TYPES.includes(type)) return true;
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
}

function isPdfType(type: string, name?: string) {
  return type.includes('pdf') || (name?.toLowerCase().endsWith('.pdf') ?? false);
}

function isDocxType(type: string, name?: string) {
  if (type.includes('word') || type.includes('docx') || type.includes('wordprocessingml'))
    return true;
  return name?.toLowerCase().endsWith('.docx') ?? false;
}

function isJsonType(type: string, name?: string) {
  if (type.includes('json')) return true;
  return name?.toLowerCase().endsWith('.json') ?? false;
}

function fileIcon(type: string, name?: string) {
  if (type.includes('pdf')) return 'picture_as_pdf';
  if (type.includes('word') || type.includes('document')) return 'description';
  if (type.includes('image')) return 'image';
  if (type.includes('text')) return 'text_snippet';
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'txt'].includes(ext)) return 'text_snippet';
  if (['json'].includes(ext)) return 'data_object';
  if (['yaml', 'yml'].includes(ext)) return 'code';
  return 'insert_drive_file';
}

function fileColor(type: string, name?: string) {
  if (type.includes('pdf')) return 'text-red-500';
  if (type.includes('word') || type.includes('document')) return 'text-blue-500';
  if (type.includes('image')) return 'text-green-600';
  const ext = name?.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'txt'].includes(ext)) return 'text-amber-600';
  if (['json'].includes(ext)) return 'text-purple-600';
  if (['yaml', 'yml'].includes(ext)) return 'text-teal-600';
  return 'text-on-surface-variant';
}

function statusBadge(status: string, t: any) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    uploaded: { bg: 'bg-primary/10', text: 'text-primary', label: t('doc.status.uploaded', 'Uploaded') },
    processing: { bg: 'bg-tertiary-fixed/20', text: 'text-tertiary', label: t('doc.status.processing', 'Processing') },
    processed: { bg: 'bg-primary/10', text: 'text-primary', label: t('doc.status.ready', 'Ready') },
    failed: { bg: 'bg-error/10', text: 'text-error', label: t('doc.status.failed', 'Failed') },
  };
  const s = map[status] ?? map.uploaded;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

const markdownComponents: Components = {
  a: ({ children, href, ...props }) => (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  ),
  input: ({ ...props }) => <input {...props} disabled readOnly />,
};

function buildTree(
  projects: ProjectItem[],
  folders: FolderItem[],
  docs: DocumentItem[],
): TreeNodeData[] {
  const folderByParent = new Map<string | null, FolderItem[]>();
  const docsByFolder = new Map<string | null, DocumentItem[]>();

  folders.forEach((f) => {
    const key = f.parent_id ?? null;
    const list = folderByParent.get(key) ?? [];
    list.push(f);
    folderByParent.set(key, list);
  });
  docs.forEach((d) => {
    const key = d.folder_id ?? null;
    const list = docsByFolder.get(key) ?? [];
    list.push(d);
    docsByFolder.set(key, list);
  });

  const buildFolder = (folder: FolderItem): TreeNodeData => {
    const childFolders = (folderByParent.get(folder.folder_id) ?? []).map(buildFolder);
    const childFiles = (docsByFolder.get(folder.folder_id) ?? []).map((doc) => ({
      id: makeNodeId('file', doc.document_id),
      type: 'file' as const,
      name: doc.file_name,
      projectId: doc.project_id,
      folderId: doc.folder_id ?? null,
      parentId: folder.folder_id,
      document: doc,
    }));

    return {
      id: makeNodeId('folder', folder.folder_id),
      type: 'folder',
      name: folder.name,
      projectId: folder.project_id,
      folderId: folder.folder_id,
      parentId: folder.parent_id,
      children: [...childFolders, ...childFiles],
    };
  };

  return projects.map((project) => {
    const rootFolders = folders
      .filter((f) => f.project_id === project.project_id && !f.parent_id)
      .map(buildFolder);

    const rootFiles = docs
      .filter((d) => d.project_id === project.project_id && !d.folder_id)
      .map((doc) => ({
        id: makeNodeId('file', doc.document_id),
        type: 'file' as const,
        name: doc.file_name,
        projectId: doc.project_id,
        folderId: null,
        parentId: null,
        document: doc,
      }));

    return {
      id: makeNodeId('project', project.project_id),
      type: 'project' as const,
      name: project.name,
      projectId: project.project_id,
      parentId: null,
      children: [...rootFolders, ...rootFiles],
    };
  });
}

function collectNodes(nodes: TreeNodeData[]) {
  const map = new Map<string, TreeNodeData>();
  const walk = (list: TreeNodeData[]) => {
    list.forEach((n) => {
      map.set(n.id, n);
      if (n.children) walk(n.children);
    });
  };
  walk(nodes);
  return map;
}

function TreeNode({
  node,
  style,
  dragHandle,
  onNodeContextMenu,
  processingNodeId,
  flashNodeId,
  togglingNodeId,
  onToggleNode,
}: NodeRendererProps<TreeNodeData> & {
  onNodeContextMenu: (event: React.MouseEvent, node: NodeApi<TreeNodeData>) => void;
  processingNodeId: string | null;
  flashNodeId: string | null;
  togglingNodeId: string | null;
  onToggleNode: (nodeId: string) => void;
}) {
  const { t } = useTranslation();
  const data = node.data;
  const isFile = data.type === 'file';
  const isProcessing = processingNodeId === data.id;
  const isFlashing = flashNodeId === data.id;
  const isToggling = togglingNodeId === data.id;

  let icon = 'folder';
  let colorClass = 'text-primary';
  if (data.type === 'project') {
    icon = 'workspaces';
    colorClass = 'text-indigo-600';
  } else if (data.type === 'folder') {
    icon = node.isOpen ? 'folder_open' : 'folder';
    colorClass = 'text-amber-600';
  } else if (data.document) {
    icon = fileIcon(data.document.file_type, data.document.file_name);
    colorClass = fileColor(data.document.file_type, data.document.file_name);
  }

  return (
    <div
      style={style}
      className={`w-full min-w-0 flex items-center gap-2 h-full rounded-lg px-2 text-xs border transition-all duration-200 cursor-pointer select-none ${
        isProcessing ? 'opacity-70' : ''
      } ${isFlashing ? 'ring-1 ring-primary/35 bg-primary/5' : ''} ${
        isToggling ? 'scale-[1.01]' : ''
      } ${
        node.isSelected
          ? 'bg-primary/10 border-primary/30'
          : 'border-transparent hover:bg-surface-container'
      }`}
      onContextMenu={(e) => onNodeContextMenu(e, node)}
      onMouseDown={(e) => {
        if (e.button === 2) onNodeContextMenu(e, node);
      }}
    >
      {!isFile && (
        <button
          type="button"
          className="w-4 h-4 flex items-center justify-center text-on-surface-variant"
          onClick={(e) => {
            e.stopPropagation();
            onToggleNode(data.id);
            node.toggle();
          }}
        >
          <span
            className={`material-symbols-outlined text-sm transition-transform duration-200 ${node.isOpen ? 'rotate-0' : '-rotate-90'}`}
          >
            expand_more
          </span>
        </button>
      )}
      {isFile && <span className="w-4 h-4" />}
      <span
        ref={dragHandle}
        className={`material-symbols-outlined text-base transition-transform duration-200 ${colorClass} ${node.isSelected ? 'scale-105' : ''}`}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0 truncate text-left">{data.name}</span>
      <span className="shrink-0 w-[86px] flex items-center justify-end gap-1">
        {isProcessing && (
          <span className="material-symbols-outlined text-sm animate-spin text-primary">
            progress_activity
          </span>
        )}
        {data.type === 'file' && data.document && statusBadge(data.document.status, t)}
      </span>
    </div>
  );
}

function NameInputModal({
  open,
  title,
  label,
  initialValue,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-2xl p-5">
        <h4 className="text-base font-bold text-on-surface mb-3">{title}</h4>
        <label className="block text-xs text-on-surface-variant mb-1">{label}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter') {
              e.preventDefault();
              const next = value.trim();
              if (!next || submitting) return;
              setSubmitting(true);
              void onSubmit(next).finally(() => setSubmitting(false));
            }
          }}
          className="w-full rounded-xl border border-outline-variant/30 px-3 py-2 text-sm outline-none focus:border-primary"
          placeholder="Nhập tên..."
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-surface-container-high text-on-surface disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              const next = value.trim();
              if (!next || submitting) return;
              setSubmitting(true);
              void onSubmit(next).finally(() => setSubmitting(false));
            }}
            disabled={submitting || !value.trim()}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-primary text-white disabled:opacity-50"
          >
            {submitting ? 'Đang lưu...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

export const DocumentManagement: React.FC = () => {
  const { t } = useTranslation();
  const api = useApiActions();
  const {
    documents,
    projects,
    folders,
    currentProjectId,
    documentsLoading,
    treeLoaded,
    docMgmtSelectedNodeId,
    docMgmtSelectedDocId,
    docMgmtPreviewCache,
    fetchTree,
    upsertProject,
    removeProject,
    upsertFolder,
    removeFolder,
    upsertDocument,
    removeDocument,
    setDocMgmtSelection,
    setDocMgmtPreviewCache,
    setCurrentProject,
    setCurrentDocument,
  } = useAppStore();

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    nodeId: null,
  });
  const [nameDialog, setNameDialog] = useState<NameDialogState>({
    open: false,
    title: '',
    label: '',
    submitLabel: '',
    mode: 'create-project',
    initialValue: '',
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewDocxBuffer, setPreviewDocxBuffer] = useState<ArrayBuffer | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [flashNodeId, setFlashNodeId] = useState<string | null>(null);
  const [togglingNodeId, setTogglingNodeId] = useState<string | null>(null);
  const selectedDoc = useMemo(
    () =>
      docMgmtSelectedDocId
        ? (documents.find((d) => d.document_id === docMgmtSelectedDocId) ?? null)
        : null,
    [docMgmtSelectedDocId, documents],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<any>(null);
  const docxPreviewRef = useRef<HTMLDivElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(560);

  useEffect(() => {
    if (!treeLoaded) {
      void fetchTree();
    }
  }, [fetchTree, treeLoaded]);

  useEffect(() => {
    const container = docxPreviewRef.current;
    if (!container) return;

    if (!previewDocxBuffer) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '';
    void renderAsync(previewDocxBuffer, container, undefined, {
      inWrapper: false,
      ignoreHeight: true,
      ignoreWidth: false,
      breakPages: false,
    }).catch(() => {
      setPreviewError('Không thể render preview DOCX');
    });
  }, [previewDocxBuffer]);

  useEffect(() => {
    if (!treeContainerRef.current) return;
    const el = treeContainerRef.current;
    const updateHeight = () => setTreeHeight(Math.max(280, Math.floor(el.clientHeight)));
    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const applyPreviewState = (preview: DocPreviewCacheItem) => {
    setPreviewUrl(preview.url ?? null);
    setPreviewText(preview.text ?? null);
    setPreviewDocxBuffer(preview.docxBuffer ?? null);
    setPreviewError(preview.error ?? null);
    setPreviewLoading(false);
  };

  useEffect(() => {
    if (docMgmtSelectedDocId && !selectedDoc) {
      setDocMgmtSelection(null, null);
      setCurrentDocument(null);
      setPreviewUrl(null);
      setPreviewText(null);
      setPreviewDocxBuffer(null);
      setPreviewError(null);
      setPreviewLoading(false);
    }
  }, [docMgmtSelectedDocId, selectedDoc, setCurrentDocument, setDocMgmtSelection]);

  const triggerFlash = (nodeId: string | null) => {
    if (!nodeId) return;
    setFlashNodeId(nodeId);
    setTimeout(() => {
      setFlashNodeId((prev) => (prev === nodeId ? null : prev));
    }, 1200);
  };

  const withProcessing = async <T,>(
    message: string,
    action: () => Promise<T>,
    nodeId: string | null = null,
  ): Promise<T> => {
    setProcessing({ message, nodeId });
    try {
      return await action();
    } finally {
      setProcessing(null);
    }
  };

  const treeData = useMemo(
    () => buildTree(projects, folders, documents),
    [projects, folders, documents],
  );
  const nodeMap = useMemo(() => collectNodes(treeData), [treeData]);

  // Chỉ hiển thị nội dung của project đang chọn (không hiện project node)
  const visibleTreeData = useMemo(() => {
    if (!currentProjectId) return [];
    const projectNode = treeData.find(
      (n) => n.type === 'project' && n.projectId === currentProjectId,
    );
    return projectNode?.children ?? [];
  }, [treeData, currentProjectId]);

  const selectedNode = docMgmtSelectedNodeId ? nodeMap.get(docMgmtSelectedNodeId) : undefined;
  const contextMenuNode = contextMenu.nodeId ? nodeMap.get(contextMenu.nodeId) : undefined;
  const uploadTarget = useMemo(() => {
    if (selectedNode?.type === 'folder') {
      const project = projects.find((p) => p.project_id === selectedNode.projectId);
      return {
        projectName: project?.name ?? '',
        folderName: selectedNode.name,
      };
    }
    if (currentProjectId) {
      const project = projects.find((p) => p.project_id === currentProjectId);
      return {
        projectName: project?.name ?? '',
        folderName: null as string | null,
      };
    }
    return null;
  }, [selectedNode, projects, currentProjectId]);
  const currentProject = projects.find((project) => project.project_id === currentProjectId);
  const currentProjectRole = currentProject?.role;
  const canMutateProject = currentProjectRole !== 'viewer';
  const canUpload = !!uploadTarget && canMutateProject;

  useEffect(() => {
    if (!contextMenu.open) return;
    const close = () => setContextMenu((s) => ({ ...s, open: false }));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu.open]);

  const getUploadContext = () => {
    if (selectedNode?.type === 'folder') {
      return { projectId: selectedNode.projectId, folderId: selectedNode.folderId ?? null };
    }
    if (currentProjectId) {
      return { projectId: currentProjectId, folderId: null as string | null };
    }
    return null;
  };

  const createProjectNode = async (name: string) => {
    const created = await withProcessing('Đang tạo project...', () => api.createProject(name));
    upsertProject(created.data);
    setCurrentProject(created.data.project_id);
    const nodeId = makeNodeId('project', created.data.project_id);
    setDocMgmtSelection(nodeId, null);
    triggerFlash(nodeId);
    return created.data.project_id;
  };

  const createFolderNode = async (parentNodeId: string, name: string) => {
    if (!canMutateProject) return null;
    const parent = nodeMap.get(parentNodeId);
    if (!parent) return null;
    const projectId = parent.projectId;
    const folderParentId = parent.type === 'folder' ? parent.folderId : null;
    const created = await withProcessing(
      'Đang tạo folder...',
      () =>
        api.createFolder({
          project_id: projectId,
          parent_id: folderParentId,
          name,
        }),
      parent.id,
    );
    upsertFolder(created.data);
    setCurrentProject(projectId);
    const folderNodeId = makeNodeId('folder', created.data.folder_id);
    setDocMgmtSelection(folderNodeId, null);
    triggerFlash(folderNodeId);
    return projectId;
  };

  const openCreateProjectDialog = () => {
    setNameDialog({
      open: true,
      title: 'Tạo project mới',
      label: 'Tên project',
      submitLabel: 'Tạo project',
      mode: 'create-project',
      initialValue: 'New Project',
    });
  };

  const openCreateFolderDialog = (sourceNodeId?: string) => {
    if (!canMutateProject) return;
    const active = sourceNodeId
      ? nodeMap.get(sourceNodeId)
      : docMgmtSelectedNodeId
        ? nodeMap.get(docMgmtSelectedNodeId)
        : selectedNode;
    const fallbackParent =
      active?.type !== 'file'
        ? active?.id
        : currentProjectId
          ? makeNodeId('project', currentProjectId)
          : null;
    if (!fallbackParent) return;
    setNameDialog({
      open: true,
      title: 'Tạo folder mới',
      label: 'Tên folder',
      submitLabel: 'Tạo folder',
      mode: 'create-folder',
      initialValue: 'New Folder',
      parentNodeId: fallbackParent,
    });
  };

  const openRenameDialog = (targetNodeId?: string) => {
    if (!canMutateProject) return;
    const effectiveNodeId = targetNodeId ?? docMgmtSelectedNodeId;
    if (!effectiveNodeId) return;
    const node = nodeMap.get(effectiveNodeId);
    if (!node) return;
    setNameDialog({
      open: true,
      title: 'Đổi tên',
      label: 'Tên mới',
      submitLabel: 'Lưu',
      mode: 'rename',
      initialValue: node.name,
      targetNodeId: effectiveNodeId,
    });
  };

  const closeNameDialog = () => {
    setNameDialog((s) => ({ ...s, open: false }));
  };

  const submitNameDialog = async (name: string) => {
    if (nameDialog.mode === 'create-project') {
      await createProjectNode(name);
    } else if (nameDialog.mode === 'create-folder') {
      if (!canMutateProject) return;
      if (!nameDialog.parentNodeId) return;
      await createFolderNode(nameDialog.parentNodeId, name);
    } else if (nameDialog.mode === 'rename') {
      if (!canMutateProject) return;
      if (!nameDialog.targetNodeId) return;
      const parsed = parseNodeId(nameDialog.targetNodeId);
      if (parsed.type === 'project') {
        const res = await withProcessing(
          'Đang đổi tên project...',
          () => api.renameProject(parsed.rawId, name),
          makeNodeId('project', parsed.rawId),
        );
        upsertProject(res.data);
      } else if (parsed.type === 'folder') {
        const res = await withProcessing(
          'Đang đổi tên folder...',
          () => api.renameFolder(parsed.rawId, name),
          makeNodeId('folder', parsed.rawId),
        );
        upsertFolder(res.data);
      } else {
        const res = await withProcessing(
          'Đang đổi tên file...',
          () => api.renameDocument(parsed.rawId, name),
          makeNodeId('file', parsed.rawId),
        );
        upsertDocument(res.data);
      }
      triggerFlash(nameDialog.targetNodeId ?? null);
    }
    closeNameDialog();
  };

  const onCreate = async (args: any) => {
    if (!canMutateProject) return { id: args?.parentId ?? 'root' };
    const parentId: string | null = args?.parentId ?? null;
    if (!parentId) {
      openCreateProjectDialog();
    } else {
      setNameDialog({
        open: true,
        title: 'Tạo folder mới',
        label: 'Tên folder',
        submitLabel: 'Tạo folder',
        mode: 'create-folder',
        initialValue: 'New Folder',
        parentNodeId: parentId,
      });
    }
    return {
      id: parentId ?? 'root',
    };
  };

  const fetchPreview = async (doc: DocumentItem) => {
    const cached = docMgmtPreviewCache[doc.document_id];
    if (cached) {
      applyPreviewState(cached);
      return;
    }

    setPreviewUrl(null);
    setPreviewText(null);
    setPreviewDocxBuffer(null);
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const res = await api.getDocumentPreview(doc.document_id);
      const url = res.data.url;
      let text: string | null = null;
      let docxBuffer: ArrayBuffer | null = null;

      if (isDocxType(doc.file_type, doc.file_name)) {
        try {
          const blobRes = await fetch(url);
          docxBuffer = await blobRes.arrayBuffer();
        } catch {
          const error = 'Không thể tải nội dung DOCX';
          setPreviewError(error);
          setPreviewLoading(false);
          return;
        }
      } else if (
        isTextType(doc.file_type, doc.file_name) ||
        isJsonType(doc.file_type, doc.file_name)
      ) {
        try {
          const contentRes = await api.getDocumentContent(doc.document_id);
          text = contentRes.data.content ?? '';
          if (isJsonType(doc.file_type, doc.file_name)) {
            try {
              text = JSON.stringify(JSON.parse(text), null, 2);
            } catch {
              // keep raw text if invalid json
            }
          }
        } catch {
          const error = 'Không thể tải nội dung tệp';
          setPreviewError(error);
          setPreviewLoading(false);
          return;
        }
      }

      const nextPreview: DocPreviewCacheItem = {
        url,
        text,
        docxBuffer,
        error: null,
      };
      setDocMgmtPreviewCache(doc.document_id, nextPreview);
      applyPreviewState(nextPreview);
    } catch {
      setPreviewError('Không thể tạo link xem trước');
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedDoc) return;
    void fetchPreview(selectedDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc?.document_id]);

  const handleUploadFiles = async (files: File[]) => {
    if (!canMutateProject) {
      setUploadError('Bạn chỉ có quyền xem project này');
      return;
    }
    const context = getUploadContext();
    if (!context) {
      setUploadError('Vui lòng chọn Project hoặc Folder để tải tài liệu');
      return;
    }

    const validFiles: File[] = [];
    const skippedFiles: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXTS.includes(ext)) {
        skippedFiles.push(`${file.name} (không hỗ trợ)`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        skippedFiles.push(`${file.name} (quá dung lượng)`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      setUploadError(`Không có file hợp lệ để tải lên. ${skippedFiles.join(', ')}`);
      return;
    }

    setUploading(true);
    setUploadError(null);
    const failedUploads: string[] = [];
    try {
      for (const file of validFiles) {
        try {
          const uploaded = await withProcessing(
            `Đang tải lên: ${file.name}`,
            () => api.uploadDocument(file, context.projectId, context.folderId ?? undefined),
            selectedNode?.id ?? null,
          );
          const detail = await api.getDocument(uploaded.data.document_id);
          upsertDocument(detail);
        } catch {
          failedUploads.push(file.name);
        }
      }
      setCurrentProject(context.projectId);
      triggerFlash(selectedNode?.id ?? makeNodeId('project', context.projectId));

      const messages: string[] = [];
      if (skippedFiles.length > 0) {
        messages.push(`Bỏ qua ${skippedFiles.length} file: ${skippedFiles.join(', ')}`);
      }
      if (failedUploads.length > 0) {
        messages.push(`Tải thất bại ${failedUploads.length} file: ${failedUploads.join(', ')}`);
      }
      if (messages.length > 0) {
        setUploadError(messages.join(' | '));
      }
    } finally {
      setUploading(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) void handleUploadFiles(files);
    if (e.target) e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    if (!canUpload) return;
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 0) void handleUploadFiles(files);
  };

  const onRename: RenameHandler<TreeNodeData> = async ({ id, name }) => {
    if (!canMutateProject) return;
    const parsed = parseNodeId(id);
    const trimmed = name.trim();
    if (!trimmed) return;
    if (parsed.type === 'project') {
      const res = await withProcessing(
        'Đang đổi tên project...',
        () => api.renameProject(parsed.rawId, trimmed),
        id,
      );
      upsertProject(res.data);
    } else if (parsed.type === 'folder') {
      const res = await withProcessing(
        'Đang đổi tên folder...',
        () => api.renameFolder(parsed.rawId, trimmed),
        id,
      );
      upsertFolder(res.data);
    } else {
      const res = await withProcessing(
        'Đang đổi tên file...',
        () => api.renameDocument(parsed.rawId, trimmed),
        id,
      );
      upsertDocument(res.data);
    }
    triggerFlash(id);
  };

  const onDelete = async ({ ids }: { ids: string[] }) => {
    if (!canMutateProject) return;
    for (const id of ids) {
      const parsed = parseNodeId(id);
      if (parsed.type === 'project') {
        if (!window.confirm('Xóa project này và toàn bộ thư mục/tài liệu bên trong?')) return;
        await withProcessing('Đang xóa project...', () => api.deleteProject(parsed.rawId), id);
        removeProject(parsed.rawId);
        if (currentProjectId === parsed.rawId) setCurrentProject(null);
      } else if (parsed.type === 'folder') {
        await withProcessing('Đang xóa folder...', () => api.deleteFolder(parsed.rawId), id);
        removeFolder(parsed.rawId);
      } else {
        await withProcessing('Đang xóa file...', () => api.deleteDocument(parsed.rawId), id);
        removeDocument(parsed.rawId);
      }
    }
  };

  const onMove: MoveHandler<TreeNodeData> = async ({ dragIds, parentId, index }) => {
    if (!canMutateProject) return;
    const parent = parentId ? nodeMap.get(parentId) : null;

    for (const dragId of dragIds) {
      const dragged = nodeMap.get(dragId);
      if (!dragged) continue;

      let targetProjectId = dragged.projectId;
      let targetFolderId: string | null = null;

      if (parent) {
        if (parent.type === 'project') {
          targetProjectId = parent.projectId;
          targetFolderId = null;
        } else if (parent.type === 'folder') {
          targetProjectId = parent.projectId;
          targetFolderId = parent.folderId ?? null;
        } else {
          continue;
        }
      }

      if (dragged.type === 'folder') {
        const res = await withProcessing(
          'Đang di chuyển folder...',
          () =>
            api.moveFolder(parseNodeId(dragId).rawId, {
              project_id: targetProjectId,
              parent_id: targetFolderId,
              sort_order: index,
            }),
          dragId,
        );
        upsertFolder(res.data);
      } else if (dragged.type === 'file') {
        const res = await withProcessing(
          'Đang di chuyển file...',
          () =>
            api.moveDocument(parseNodeId(dragId).rawId, {
              project_id: targetProjectId,
              folder_id: targetFolderId,
            }),
          dragId,
        );
        upsertDocument(res.data);
      }
    }

    triggerFlash(dragIds[0] ?? null);
  };

  const deleteNodeById = async (nodeId: string) => {
    setDocMgmtSelection(nodeId, docMgmtSelectedDocId);
    await onDelete({ ids: [nodeId] });
  };

  const triggerUploadForNode = (nodeId: string) => {
    const node = nodeMap.get(nodeId);
    if (!node || node.type === 'file') return;
    setDocMgmtSelection(nodeId, docMgmtSelectedDocId);
    setCurrentProject(node.projectId);
    fileInputRef.current?.click();
  };

  const handleNodeContextMenu = (event: React.MouseEvent, node: NodeApi<TreeNodeData>) => {
    if (processing) return;
    event.preventDefault();
    event.stopPropagation();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = 220;
    const menuHeight = node.data.type === 'file' ? 90 : 140;
    const x = Math.min(event.clientX, viewportWidth - menuWidth - 8);
    const y = Math.min(event.clientY, viewportHeight - menuHeight - 8);
    setDocMgmtSelection(node.data.id, docMgmtSelectedDocId);
    setCurrentProject(node.data.projectId);
    setContextMenu({
      open: true,
      x: Math.max(8, x),
      y: Math.max(8, y),
      nodeId: node.data.id,
    });
  };

  const disableDrop = ({
    parentNode,
    dragNodes,
  }: {
    parentNode: NodeApi<TreeNodeData> | null;
    dragNodes: NodeApi<TreeNodeData>[];
  }) => {
    if (processing) return true;
    if (!parentNode) {
      return dragNodes.some((d) => d.data.type === 'project');
    }
    if (parentNode.data.type === 'file') return true;
    return dragNodes.some((d) => d.data.type === 'project');
  };

  const selectAndPreview = async (node: TreeNodeData) => {
    if (processing) return;
    setCurrentProject(node.projectId);

    if (node.type === 'file' && node.document) {
      setDocMgmtSelection(node.id, node.document.document_id);
      setCurrentDocument(node.document.document_id);
      await fetchPreview(node.document);
    } else {
      setDocMgmtSelection(node.id, null);
      setCurrentDocument(null);
      setPreviewUrl(null);
      setPreviewText(null);
      setPreviewDocxBuffer(null);
      setPreviewError(null);
    }
  };

  const onToggleNode = (nodeId: string) => {
    setTogglingNodeId(nodeId);
    setTimeout(() => {
      setTogglingNodeId((prev) => (prev === nodeId ? null : prev));
    }, 220);
  };

  return (
    <>
      <div className="px-6 py-4 flex flex-col gap-6 h-full overflow-hidden animate-fade-up">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-extrabold text-on-surface font-headline tracking-tight">
              {t('upload.title')}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {t('upload.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateProjectDialog}
              disabled={!!processing}
              className="flex items-center gap-1 px-3 py-2 bg-primary text-white rounded-xl text-xs font-bold"
            >
              <span className="material-symbols-outlined text-base">add</span>Project
            </button>
          </div>
        </div>

        <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
          <div className="w-[40%] flex flex-col gap-4 overflow-hidden">
            <section
              onDragOver={(e) => {
                if (!canUpload || !!processing) return;
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-2xl p-5 border-2 border-dashed text-center transition-all shrink-0 ${
                !canUpload
                  ? 'border-outline-variant/20 bg-surface-container-low opacity-60 cursor-not-allowed'
                  : dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/30 bg-surface-container-low'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.png,.jpg,.jpeg,.txt,.md,.json,.yaml,.yml"
                onChange={onFileInputChange}
                className="hidden"
              />
              <span className="material-symbols-outlined text-primary text-3xl mb-2">
                cloud_upload
              </span>
              <p className="text-xs font-bold">
                {uploading
                  ? t('upload.uploading')
                  : canUpload
                    ? t('upload.dragDrop')
                    : currentProjectRole === 'viewer'
                      ? t('upload.viewerOnly')
                    : t('upload.selectProject')}
              </p>
              <p className="text-[11px] text-on-surface-variant mt-1">
                {uploadTarget
                  ? `${t('upload.target')}: ${uploadTarget.projectName}${uploadTarget.folderName ? ` / ${uploadTarget.folderName}` : ' / Root'}`
                  : t('upload.noTarget')}
              </p>
              <button
                type="button"
                title={!canUpload && currentProjectRole === 'viewer' ? 'Viewer chỉ có quyền xem project này' : undefined}
                onClick={() => {
                  if (!canUpload || uploading || !!processing) return;
                  fileInputRef.current?.click();
                }}
                disabled={!canUpload || uploading || !!processing}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">upload_file</span>
                {t('upload.chooseFile')}
              </button>
              {uploadError && (
                <p className="text-[10px] text-error font-bold mt-2">{uploadError}</p>
              )}
            </section>

            <section className="app-panel flex-1 p-4 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                  {currentProjectId ? `Tài liệu (${visibleTreeData.length} mục)` : 'Tài liệu'}
                </h3>
                <button onClick={fetchTree} className="p-1 rounded-lg hover:bg-primary/10">
                  <span className="material-symbols-outlined text-lg text-primary">refresh</span>
                </button>
              </div>
              <div className="flex-1 overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                {documentsLoading ? (
                  <div className="h-full flex items-center justify-center text-xs text-on-surface-variant">
                    Đang tải cây dữ liệu...
                  </div>
                ) : !currentProjectId ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-40 gap-2">
                    <span className="material-symbols-outlined text-4xl">folder_open</span>
                    <p className="text-xs font-medium text-center">
                      Chọn dự án ở panel trái để xem tài liệu
                    </p>
                  </div>
                ) : (
                  <div ref={treeContainerRef} className="relative h-full overflow-hidden">
                    <Tree<TreeNodeData>
                      ref={treeRef}
                      data={visibleTreeData}
                      width="100%"
                      height={treeHeight}
                      rowHeight={34}
                      indent={20}
                      openByDefault
                      disableDrop={disableDrop}
                      onCreate={onCreate}
                      onRename={onRename}
                      onDelete={onDelete}
                      onMove={onMove}
                      onActivate={(node) => void selectAndPreview(node.data)}
                      onSelect={(nodes) => {
                        const node = nodes[0];
                        if (!node) return;
                        void selectAndPreview(node.data);
                      }}
                    >
                      {(props) => (
                        <TreeNode
                          {...props}
                          onNodeContextMenu={handleNodeContextMenu}
                          processingNodeId={processing?.nodeId ?? null}
                          flashNodeId={flashNodeId}
                          togglingNodeId={togglingNodeId}
                          onToggleNode={onToggleNode}
                        />
                      )}
                    </Tree>
                    {processing && (
                      <div className="absolute inset-0 bg-surface/70 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <div className="px-3 py-2 rounded-xl border border-outline-variant/25 bg-surface-container-lowest shadow text-xs font-semibold text-on-surface flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm animate-spin text-primary">
                            progress_activity
                          </span>
                          {processing.message}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            <section className="app-panel flex-1 overflow-hidden flex flex-col relative">
              <div className="px-5 py-3 bg-surface-container flex items-center justify-between shrink-0 z-10">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-lg">visibility</span>
                  <h3 className="font-headline font-bold text-sm uppercase tracking-wider">
                    Bản xem trước tài liệu
                  </h3>
                </div>
              </div>

              <div className="flex-1 m-4 rounded-xl shadow-inner overflow-hidden flex flex-col z-10 border border-outline-variant/20 bg-surface-container-lowest">
                {!selectedDoc ? (
                  <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                    <span className="material-symbols-outlined text-6xl mb-4">description</span>
                    <p className="text-sm font-medium">
                      Chọn một tài liệu trong cây bên trái để xem trước.
                    </p>
                  </div>
                ) : previewLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-4xl animate-spin mb-3">
                      progress_activity
                    </span>
                    <p className="text-sm">Đang tải bản xem trước...</p>
                  </div>
                ) : previewError ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-error">
                    <span className="material-symbols-outlined text-4xl mb-2">error</span>
                    <p className="text-sm font-bold">{previewError}</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {isImageType(selectedDoc.file_type, selectedDoc.file_name) && previewUrl && (
                      <div className="flex-1 flex items-center justify-center p-8">
                        <img
                          src={previewUrl}
                          alt={selectedDoc.file_name}
                          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                        />
                      </div>
                    )}

                    {isPdfType(selectedDoc.file_type, selectedDoc.file_name) && previewUrl && (
                      <iframe
                        src={previewUrl}
                        className="w-full h-full border-0"
                        title={selectedDoc.file_name}
                      />
                    )}

                    {isDocxType(selectedDoc.file_type, selectedDoc.file_name) && (
                      <div className="p-4 h-full">
                        <div
                          ref={docxPreviewRef}
                          className="docx-preview-container bg-white rounded-lg border border-outline-variant/10 p-4 overflow-auto h-full"
                        />
                      </div>
                    )}

                    {isMarkdownType(selectedDoc.file_type, selectedDoc.file_name) &&
                      previewText !== null && (
                        <article className="markdown-preview mx-auto w-full max-w-4xl p-6 sm:p-8">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {previewText}
                          </ReactMarkdown>
                        </article>
                      )}

                    {(isTextType(selectedDoc.file_type, selectedDoc.file_name) ||
                      isJsonType(selectedDoc.file_type, selectedDoc.file_name)) &&
                      !isMarkdownType(selectedDoc.file_type, selectedDoc.file_name) &&
                      previewText !== null && (
                        <div className="p-6">
                          <pre className="font-mono text-xs leading-relaxed text-on-surface whitespace-pre-wrap break-words">
                            {previewText}
                          </pre>
                        </div>
                      )}
                  </div>
                )}
              </div>
              <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            </section>
          </div>
        </div>
      </div>
      {contextMenu.open &&
        contextMenuNode &&
        createPortal(
          <div
            className="fixed z-[9999] min-w-[220px] rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-xl py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {canMutateProject && contextMenuNode.type !== 'file' && (
              <>
                <button
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2"
                  onClick={() => {
                    openCreateFolderDialog(contextMenuNode.id);
                    setContextMenu((s) => ({ ...s, open: false }));
                  }}
                >
                  <span className="material-symbols-outlined text-sm">create_new_folder</span>
                  New Folder
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2"
                  onClick={() => {
                    triggerUploadForNode(contextMenuNode.id);
                    setContextMenu((s) => ({ ...s, open: false }));
                  }}
                >
                  <span className="material-symbols-outlined text-sm">upload_file</span>
                  Upload File
                </button>
              </>
            )}

            {canMutateProject && (
            <button
              className="w-full text-left px-3 py-2 text-xs hover:bg-surface-container flex items-center gap-2"
              onClick={() => {
                openRenameDialog(contextMenuNode.id);
                setContextMenu((s) => ({ ...s, open: false }));
              }}
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              {contextMenuNode.type === 'project'
                ? 'Rename Project'
                : contextMenuNode.type === 'folder'
                  ? 'Rename Folder'
                  : 'Rename File'}
            </button>
            )}

            {canMutateProject && (
            <button
              className="w-full text-left px-3 py-2 text-xs hover:bg-error/10 text-error flex items-center gap-2"
              onClick={() => {
                void deleteNodeById(contextMenuNode.id);
                setContextMenu((s) => ({ ...s, open: false }));
              }}
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              {contextMenuNode.type === 'project'
                ? 'Delete Project'
                : contextMenuNode.type === 'folder'
                  ? 'Delete Folder'
                  : 'Delete File'}
            </button>
            )}
          </div>,
          document.body,
        )}
      <NameInputModal
        open={nameDialog.open}
        title={nameDialog.title}
        label={nameDialog.label}
        initialValue={nameDialog.initialValue}
        submitLabel={nameDialog.submitLabel}
        onCancel={closeNameDialog}
        onSubmit={submitNameDialog}
      />
    </>
  );
};
