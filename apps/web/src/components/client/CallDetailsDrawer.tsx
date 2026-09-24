import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CallSession } from '../../types';
import { TranscriptViewer } from './TranscriptViewer';
import { formatPhoneNumber } from '@/utils/formatPhoneNumber';
import { formatDateTimeDDMMYYYY } from '@/utils/dateFormatters';

interface CallDetailsDrawerProps {
  call: CallSession | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenWhatsApp?: (call: CallSession) => void;
}

type TabType = 'transcript' | 'tools' | 'performance' | 'overview';

export function CallDetailsDrawer({
  call,
  isOpen,
  onClose,
}: CallDetailsDrawerProps) {
  const [activeTab] = useState<TabType>('transcript');
  const [copied, setCopied] = useState(false);

  if (!isOpen || !call) return null;

  const handleCopyPhone = () => {
    if (call.callerNumber) {
      navigator.clipboard.writeText(call.callerNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]';
      case 'ACTIVE':
        return 'bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]';
      case 'MISSED':
        return 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]';
      case 'FAILED':
      default:
        return 'bg-[#fee2e2] text-[#b91c1c] border-[#fecaca]';
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-[#f0efed] bg-[#fafafa] shrink-0">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider border ${getStatusBadge(call.status)}`}>
                {call.status}
              </span>

              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-[#777169] hover:text-[#0c0a09] hover:bg-[#f0efed] cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <svg className="w-[18px] h-[18px] text-[#0c0a09] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <h2 className="font-display-serif text-lg sm:text-xl font-light text-[#0c0a09] truncate">
                  {formatPhoneNumber(call.callerNumber || undefined) || 'Anonymous Caller'}
                </h2>
              </div>

              {call.callerNumber && (
                <button
                  onClick={handleCopyPhone}
                  className="h-8 px-3 text-xs bg-white border border-[#e7e5e4] rounded-xl hover:bg-[#fafafa] transition text-[#0c0a09] shadow-2xs shrink-0 cursor-pointer"
                >
                  {copied ? '✓ Copied' : 'Copy Number'}
                </button>
              )}
            </div>

            {/* Quick Metrics Bar */}
            <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-[#f0efed] text-xs">
              <div className="flex items-center gap-1.5 shrink-0">
                <svg className="w-3.5 h-3.5 text-[#777169] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-[#777169] text-[11px] uppercase font-semibold">Duration:</span>
                <span className="font-medium text-[#0c0a09]">{formatDuration(call.durationSeconds)}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <svg className="w-3.5 h-3.5 text-[#777169] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-[#777169] text-[11px] uppercase font-semibold">Started:</span>
                <span className="font-medium text-[#0c0a09]">
                  {formatDateTimeDDMMYYYY(call.startedAt || call.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-[#fafafa] min-h-0 scrollbar-thin">
            {activeTab === 'transcript' && (
              <TranscriptViewer
                transcriptText={call.transcriptText}
                turnsJson={call.turnsJson}
                agentName={call.agent?.name}
                callerNumber={call.callerNumber}
              />
            )}

            {/* {activeTab === 'tools' && (
              <div className="space-y-3">
                {toolsList.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#777169] bg-white rounded-xl border border-dashed border-[#e7e5e4]">
                    No autonomous AI tools were triggered during this conversation.
                  </div>
                ) : (
                  toolsList.map((t, index) => {
                    const toolName = typeof t === 'string' ? t : t.toolName || t.name || 'Tool';
                    const params = typeof t === 'object' && t.parameters ? t.parameters : null;
                    const result = typeof t === 'object' && t.result ? t.result : null;

                    return (
                      <div key={index} className="el-card p-4 bg-white space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-[#0c0a09]">
                            ✓ {toolName}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#15803d] bg-[#dcfce7] px-2 py-0.5 rounded-full">
                            Executed
                          </span>
                        </div>

                        {params && (
                          <div className="text-[11px] bg-[#f5f5f5] p-2 rounded-lg font-mono text-[#4e4e4e] overflow-x-auto">
                            <span className="text-[#777169] block text-[9px] uppercase">Parameters</span>
                            {JSON.stringify(params, null, 2)}
                          </div>
                        )}

                        {result && (
                          <div className="text-[11px] bg-[#f0fdf4] p-2 rounded-lg font-mono text-[#166534] overflow-x-auto border border-[#bbf7d0]">
                            <span className="text-[#15803d] block text-[9px] uppercase">Tool Result</span>
                            {JSON.stringify(result, null, 2)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-4">
                <div className="el-card p-5 bg-white space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#777169]">
                    Monotonic Voice Pipeline Latency
                  </h4>

                  <dl className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-[#fafafa] rounded-xl border border-[#f0efed]">
                      <dt className="text-[#777169]">Average Turn Latency</dt>
                      <dd className="font-display-serif text-2xl font-light text-[#0c0a09] mt-1">
                        {call.metricsJson?.turnLatencyMs || call.metricsJson?.e2eLatencyMs
                          ? `${call.metricsJson.turnLatencyMs || call.metricsJson.e2eLatencyMs} ms`
                          : 'N/A'}
                      </dd>
                    </div>

                    <div className="p-3 bg-[#fafafa] rounded-xl border border-[#f0efed]">
                      <dt className="text-[#777169]">STT Processing Latency</dt>
                      <dd className="font-display-serif text-2xl font-light text-[#0c0a09] mt-1">
                        {call.metricsJson?.sttLatencyMs ? `${call.metricsJson.sttLatencyMs} ms` : 'N/A'}
                      </dd>
                    </div>

                    <div className="p-3 bg-[#fafafa] rounded-xl border border-[#f0efed]">
                      <dt className="text-[#777169]">LLM Generation Latency</dt>
                      <dd className="font-display-serif text-2xl font-light text-[#0c0a09] mt-1">
                        {call.metricsJson?.llmLatencyMs ? `${call.metricsJson.llmLatencyMs} ms` : 'N/A'}
                      </dd>
                    </div>

                    <div className="p-3 bg-[#fafafa] rounded-xl border border-[#f0efed]">
                      <dt className="text-[#777169]">TTS First Chunk Latency</dt>
                      <dd className="font-display-serif text-2xl font-light text-[#0c0a09] mt-1">
                        {call.metricsJson?.ttsLatencyMs ? `${call.metricsJson.ttsLatencyMs} ms` : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {activeTab === 'overview' && (
              <div className="el-card p-5 bg-white space-y-4 text-xs">
                <dl className="space-y-3">
                  <div className="flex justify-between py-1.5 border-b border-[#f0efed]">
                    <dt className="text-[#777169]">Call Session ID</dt>
                    <dd className="font-mono text-[11px] text-[#0c0a09]">{call.id}</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#f0efed]">
                    <dt className="text-[#777169]">Room Name</dt>
                    <dd className="font-mono text-[11px] text-[#0c0a09]">{call.roomName}</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#f0efed]">
                    <dt className="text-[#777169]">Deployment Environment</dt>
                    <dd className="font-medium text-[#0c0a09]">{call.deployment?.environment || 'TEST'}</dd>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#f0efed]">
                    <dt className="text-[#777169]">Primary Language</dt>
                    <dd className="font-medium text-[#0c0a09]">{call.primaryLanguage || 'en-IN'}</dd>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <dt className="text-[#777169]">Created At</dt>
                    <dd className="font-medium text-[#0c0a09]">{new Date(call.createdAt).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
            )} */}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-[#f0efed] bg-white flex items-center justify-between gap-3 shrink-0">
            <button
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium border border-[#e7e5e4] rounded-xl bg-white hover:bg-[#fafafa] text-[#0c0a09] transition shadow-2xs cursor-pointer leading-none"
            >
              Close
            </button>

            {/* {onOpenWhatsApp && (
              <button
                onClick={() => {
                  onClose();
                  onOpenWhatsApp(call);
                }}
                className="el-btn-primary h-9 px-5 text-xs flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Follow up on WhatsApp
              </button>
            )} */}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
