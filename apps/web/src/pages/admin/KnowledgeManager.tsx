import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api';
import type { KnowledgeSource } from '../../types';

interface Props {
  clientId: string;
  agentId: string;
}

const ACCEPTED_TYPES = '.txt,.md';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusBadge(status: KnowledgeSource['status']) {
  if (status === 'READY')
    return (
      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-xs font-medium">
        Ready
      </span>
    );
  if (status === 'PROCESSING')
    return (
      <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-medium">
        Processing
      </span>
    );
  return (
    <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full text-xs font-medium">
      Failed
    </span>
  );
}

function fileIcon(type: string) {
  if (type === '.txt') return 'txt';
  if (type === '.md') return 'md';
  return type.replace('.', '').toUpperCase();
}

export default function KnowledgeManager({ clientId, agentId }: Props) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSources = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getKnowledgeSources(clientId, agentId);
      setSources(data);
    } catch (err) {
      setError('Failed to load knowledge sources.');
    } finally {
      setLoading(false);
    }
  }, [clientId, agentId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return ACCEPTED_TYPES.includes(ext);
    });
    if (fileArray.length === 0) return;
    setPendingFiles((prev) => [...prev, ...fileArray]);
  }, []);

  const handleUpload = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadKnowledge(clientId, agentId, pendingFiles);
      setPendingFiles([]);
      await fetchSources();
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [clientId, agentId, pendingFiles, fetchSources]);

  const handleDelete = useCallback(
    async (sourceId: string) => {
      try {
        await api.deleteKnowledgeSource(clientId, agentId, sourceId);
        setSources((prev) => prev.filter((s) => s.id !== sourceId));
        setConfirmDeleteId(null);
      } catch (err) {
        setError('Failed to delete source.');
        setConfirmDeleteId(null);
      }
    },
    [clientId, agentId],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#0c0a09]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display-serif text-2xl tracking-tight">
            Knowledge Sources
          </h1>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="el-btn-primary"
            disabled={uploading}
          >
            Upload Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 ml-3 text-lg leading-none"
            >
              &times;
            </button>
          </div>
        )}

        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`el-card mb-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-2 border-dashed border-[#0c0a09] bg-stone-100'
              : 'border border-dashed border-[#d6d3d1] bg-white hover:bg-stone-50'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="py-10 px-6">
            <div className="text-[#777169] text-sm mb-2">
              {dragActive ? 'Drop files here' : 'Drag and drop files here, or click to browse'}
            </div>
            <div className="text-[#a8a29e] text-xs">
              Accepts .txt and .md files
            </div>
          </div>
        </div>

        {pendingFiles.length > 0 && (
          <div className="el-card mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display-serif text-base">
                Pending Upload ({pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''})
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPendingFiles([])}
                  className="el-btn-outline text-xs"
                  disabled={uploading}
                >
                  Clear
                </button>
                <button
                  onClick={handleUpload}
                  className="el-btn-primary text-xs"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload Now'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {pendingFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-[#fafaf9]"
                >
                  <span className="truncate mr-4">{file.name}</span>
                  <span className="text-[#777169] text-xs whitespace-nowrap ml-4">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
            {uploading && (
              <div className="mt-4">
                <div className="h-1 bg-[#e7e5e4] rounded-full overflow-hidden">
                  <div className="h-full bg-[#0c0a09] rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="el-card">
            <div className="py-12 text-center text-[#777169] text-sm">
              Loading knowledge sources...
            </div>
          </div>
        ) : sources.length === 0 && !uploading ? (
          <div className="el-card">
            <div className="py-12 text-center">
              <div className="text-[#777169] text-sm mb-1">
                No knowledge sources yet
              </div>
              <div className="text-[#a8a29e] text-xs">
                Upload .txt or .md files to get started
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="el-card flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-stone-100 border border-[#e7e5e4] flex items-center justify-center text-xs font-medium text-[#777169] uppercase shrink-0">
                    {fileIcon(source.fileType)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {source.fileName}
                    </div>
                    <div className="text-[#777169] text-xs mt-0.5">
                      {source.chunkCount} chunk{source.chunkCount !== 1 ? 's' : ''} &middot; {formatDate(source.createdAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {statusBadge(source.status)}
                  {confirmDeleteId === source.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-[#777169] hover:text-[#0c0a09]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(source.id)}
                      className="text-[#a8a29e] hover:text-red-500 transition-colors p-1"
                      title="Delete source"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
