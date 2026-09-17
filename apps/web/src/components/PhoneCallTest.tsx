import React, { useState, useEffect, useRef } from 'react';
import { api, PhoneTestResult } from '../services/api';
import { CallSession } from '../types';

interface PhoneCallTestProps {
  clientId: string;
  agentId: string;
}

export const normalizePhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `+91${cleaned.slice(1)}`;
  }
  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  return cleaned ? `+${cleaned}` : '';
};

export const isValidE164Phone = (phone: string): boolean => {
  const normalized = normalizePhoneNumber(phone);
  return /^\+[1-9]\d{1,14}$/.test(normalized);
};

export default function PhoneCallTest({ clientId, agentId }: PhoneCallTestProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDialForm, setShowDialForm] = useState(false);
  const [callResult, setCallResult] = useState<PhoneTestResult | null>(null);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechDiagnostics, setShowTechDiagnostics] = useState(false);
  const [fetchingTranscript, setFetchingTranscript] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const pollIntervalRef = useRef<number | null>(null);
  const pollCountRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch past call sessions for history dropdown
  const loadCallHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await api.getClientCalls({ agentId, tenantId: clientId, limit: 15 });
      const calls = response.calls || (response as any).sessions || [];
      setCallHistory(calls);
    } catch (err) {
      console.warn('Failed to load call history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load latest call session and history automatically on mount or when agentId/clientId changes
  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      try {
        const response = await api.getClientCalls({ agentId, tenantId: clientId, limit: 15 });
        const calls = response.calls || (response as any).sessions || [];
        if (isMounted) {
          setCallHistory(calls);
          if (calls.length > 0 && !callSession) {
            setCallSession(calls[0]);
          }
        }
      } catch (err) {
        console.warn('Initial call session fetch failed:', err);
      }
    };
    loadInitialData();
    return () => {
      isMounted = false;
    };
  }, [agentId, clientId]);

  // Auto-scroll transcript to bottom when updated
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [callSession?.turnsJson, callSession?.transcriptText]);

  const handleStartCall = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!phoneNumber.trim()) {
      setError('Please enter a destination phone number.');
      return;
    }

    if (!isValidE164Phone(phoneNumber)) {
      setError('Please enter a valid phone number (e.g. +91 98765 43210 or 10-digit mobile number).');
      return;
    }

    const normalized = normalizePhoneNumber(phoneNumber);

    setError(null);
    setLoading(true);
    setCallSession(null);

    try {
      const result = await api.startPhoneTest(clientId, agentId, normalized);
      setCallResult(result);
      setIsPolling(true);
      setShowDialForm(false);
      pollCountRef.current = 0;
    } catch (err: any) {
      const msg = err?.message || 'Failed to initiate outbound phone call.';
      if (msg.includes('No active TEST deployment')) {
        setError('No active TEST deployment found for this agent. Please save your agent configuration first.');
      } else if (msg.includes('Invalid phone number')) {
        setError('The phone number format is invalid. Must be E.164 (e.g. +919876543210).');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Poll for CallSession updates after initiation or when active
  useEffect(() => {
    if (!isPolling && callSession?.status !== 'ACTIVE') return;

    const poll = async () => {
      pollCountRef.current += 1;
      try {
        const response = await api.getClientCalls({ agentId, tenantId: clientId, limit: 5 });
        const calls = response.calls || (response as any).sessions || [];
        const normalized = normalizePhoneNumber(phoneNumber);
        const match =
          calls.find(
            (c: any) =>
              (callResult?.deploymentId && c.deploymentId === callResult.deploymentId) ||
              (c.callerNumber && normalized && c.callerNumber.includes(normalized.slice(-8))) ||
              (c.roomName && callResult?.callId && c.roomName.includes(callResult.callId)) ||
              (c.agentId === agentId)
          ) || calls[0];

        if (match) {
          setCallSession(match);
          if (['COMPLETED', 'FAILED', 'MISSED'].includes(match.status)) {
            setIsPolling(false);
            loadCallHistory();
          }
        }
      } catch (err) {
        console.error('Error polling call session:', err);
      }

      // Stop polling after 3 minutes if no completion
      if (pollCountRef.current > 90) {
        setIsPolling(false);
      }
    };

    pollIntervalRef.current = window.setInterval(poll, 2000);
    poll(); // immediate check

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isPolling, callSession?.status, callResult, agentId, clientId, phoneNumber]);

  const handleReset = () => {
    setCallResult(null);
    setCallSession(null);
    setIsPolling(false);
    setError(null);
    setShowDialForm(true);
  };

  const handleSelectSession = async (session: CallSession) => {
    setShowHistoryDropdown(false);
    setFetchingTranscript(true);
    setError(null);
    try {
      const fullCall = await api.getClientCall(session.id, clientId);
      if (fullCall) {
        setCallSession(fullCall);
      } else {
        setCallSession(session);
      }
    } catch (err: any) {
      console.warn('Failed to fetch full session details, using cached session:', err);
      setCallSession(session);
    } finally {
      setFetchingTranscript(false);
    }
  };

  const handleGetCallTranscript = async () => {
    setFetchingTranscript(true);
    setError(null);
    try {
      if (callSession?.id) {
        const updated = await api.getClientCall(callSession.id, clientId);
        if (updated) {
          setCallSession(updated);
          loadCallHistory();
          return;
        }
      }

      // Query client calls for latest session
      const response = await api.getClientCalls({ agentId, tenantId: clientId, limit: 5 });
      const calls = response.calls || (response as any).sessions || [];
      const normalized = normalizePhoneNumber(phoneNumber);
      const match =
        calls.find(
          (c: any) =>
            (callResult?.deploymentId && c.deploymentId === callResult.deploymentId) ||
            (c.callerNumber && normalized && c.callerNumber.includes(normalized.slice(-8))) ||
            (c.roomName && callResult?.callId && c.roomName.includes(callResult.callId)) ||
            (c.agentId === agentId)
        ) || calls[0];

      if (match) {
        setCallSession(match);
        loadCallHistory();
        if (!callResult) {
          setCallResult({
            success: true,
            callId: match.roomName,
            roomName: match.roomName,
            participantIdentity: match.callerNumber || 'tester-phone',
            deploymentId: match.deploymentId,
          });
        }
      } else {
        setError('No call transcript found for this agent yet. Initiate a call first.');
      }
    } catch (err: any) {
      console.error('Error fetching transcript:', err);
      setError(err?.message || 'Failed to fetch the latest call transcript.');
    } finally {
      setFetchingTranscript(false);
    }
  };

  // Build clean message list from turnsJson or plain transcript text
  const turnsList = callSession?.turnsJson || [];

  const conversationMessages: Array<{
    role: 'user' | 'agent';
    text: string;
    timestamp?: string;
    timeLabel?: string;
  }> = [];

  if (turnsList && turnsList.length > 0) {
    turnsList.forEach((turn: any) => {
      // User message
      if (turn.user && (turn.user.transcript || turn.user.text)) {
        const text = (turn.user.transcript || turn.user.text || '').trim();
        if (text) {
          let timeLabel = '';
          if (turn.user.timestamp) {
            try {
              timeLabel = new Date(turn.user.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } catch {
              timeLabel = '';
            }
          }
          conversationMessages.push({
            role: 'user',
            text,
            timestamp: turn.user.timestamp,
            timeLabel,
          });
        }
      }
      // Agent message
      if (turn.agent && (turn.agent.response || turn.agent.text)) {
        const text = (turn.agent.response || turn.agent.text || '').trim();
        if (text) {
          let timeLabel = '';
          if (turn.agent.timestamp) {
            try {
              timeLabel = new Date(turn.agent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } catch {
              timeLabel = '';
            }
          }
          conversationMessages.push({
            role: 'agent',
            text,
            timestamp: turn.agent.timestamp,
            timeLabel,
          });
        }
      }
    });
  } else if (callSession?.transcriptText) {
    // Parse plain text fallback
    const lines = callSession.transcriptText.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.toLowerCase().startsWith('user:') || trimmed.toLowerCase().startsWith('caller:')) {
        conversationMessages.push({
          role: 'user',
          text: trimmed.replace(/^(user|caller):\s*/i, '').trim(),
        });
      } else if (trimmed.toLowerCase().startsWith('agent:') || trimmed.toLowerCase().startsWith('assistant:')) {
        conversationMessages.push({
          role: 'agent',
          text: trimmed.replace(/^(agent|assistant):\s*/i, '').trim(),
        });
      } else {
        conversationMessages.push({
          role: 'agent',
          text: trimmed,
        });
      }
    });
  }

  const handleCopyTranscript = () => {
    const textToCopy =
      conversationMessages.length > 0
        ? conversationMessages
            .map((m) => `${m.role === 'user' ? 'Caller' : 'Agent'}${m.timeLabel ? ` [${m.timeLabel}]` : ''}: ${m.text}`)
            .join('\n\n')
        : callSession?.transcriptText || '';

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  const isPhoneValid = isValidE164Phone(phoneNumber);

  // Extract structured metrics from call session
  const metrics = callSession?.metricsJson || {};
  const startupBreakdown = metrics.startupBreakdown || metrics.startupMetrics?.breakdown || {};
  const completedTurns = metrics.turns || [];
  const baseline = metrics.callBaseline;

  // Pickup to First Greeting Audio ms
  const pickupToGreetingMs =
    startupBreakdown.pickupToFirstGreetingAudioMs ||
    metrics.startupMetrics?.totalCallStartupToFirstAudioMs ||
    null;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="el-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#0c0a09]/5 rounded-2xl flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-[#0c0a09]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-display-serif font-bold text-[#0c0a09]">Admin Phone Call Test</h3>
              <p className="text-xs text-[#777169]">
                Live Conversational Transcript, Telephony Verification & Latency Analytics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDialForm(!showDialForm)}
              className="el-btn-primary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5"
            >
              <span>📞</span>
              <span>{showDialForm ? 'Close Dial Form' : 'Dial New Call'}</span>
            </button>

            {/* Session History Dropdown Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowHistoryDropdown(!showHistoryDropdown);
                  if (!showHistoryDropdown) loadCallHistory();
                }}
                className="el-btn-outline px-3 py-2 text-xs font-medium flex items-center gap-1.5 bg-white border-[#d6d3d1] hover:bg-[#f5f5f4]"
                title="Select past call session to view transcript"
              >
                <span>🕒</span>
                <span>Past Sessions ({callHistory.length})</span>
                <span className="text-[10px] text-[#777169]">▼</span>
              </button>

              {showHistoryDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-[#e7e5e4] rounded-2xl shadow-xl z-50 overflow-hidden py-1">
                  <div className="px-3.5 py-2.5 bg-[#fafaf9] border-b border-[#e7e5e4] flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0c0a09]">Recent Call Sessions</span>
                    <button
                      onClick={loadCallHistory}
                      disabled={loadingHistory}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {loadingHistory ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-[#f5f5f4]">
                    {callHistory.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#777169]">No past call sessions found.</div>
                    ) : (
                      callHistory.map((s) => {
                        const isSelected = callSession?.id === s.id;
                        const dateStr = s.startedAt
                          ? new Date(s.startedAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Recent call';

                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleSelectSession(s)}
                            className={`w-full text-left px-3.5 py-2.5 hover:bg-[#f5f5f4] transition-colors flex items-center justify-between text-xs ${
                              isSelected ? 'bg-blue-50/70 font-semibold text-blue-950' : 'text-[#44403c]'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    s.status === 'COMPLETED'
                                      ? 'bg-emerald-500'
                                      : s.status === 'ACTIVE'
                                      ? 'bg-blue-500 animate-pulse'
                                      : 'bg-amber-500'
                                  }`}
                                />
                                <span>{dateStr}</span>
                              </div>
                              <div className="text-[11px] text-[#777169] font-mono">
                                {s.callerNumber || 'Unknown'} • {s.durationSeconds || 0}s • {s.primaryLanguage || 'en-IN'}
                              </div>
                            </div>
                            {isSelected && <span className="text-xs text-blue-600 font-bold">✓ Active</span>}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {callSession && (
              <button
                type="button"
                onClick={handleGetCallTranscript}
                disabled={fetchingTranscript}
                className="el-btn-outline px-3 py-2 text-xs font-medium flex items-center gap-1.5 bg-white border-[#d6d3d1]"
                title="Fetch latest transcript from server"
              >
                {fetchingTranscript ? (
                  <span>Fetching...</span>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>Get Transcript</span>
                  </>
                )}
              </button>
            )}

            {callSession && (
              <button
                type="button"
                onClick={handleReset}
                className="el-btn-outline px-2.5 py-2 text-xs text-[#777169]"
                title="Clear current view"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
            <span className="text-red-500 font-bold">⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Dial Form (Collapsible / Triggered) */}
      {(showDialForm || (!callSession && !isPolling)) && (
        <div className="el-card p-6 border-2 border-blue-100 bg-[#f8fafc]">
          <form onSubmit={handleStartCall} className="space-y-4 max-w-xl mx-auto">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wider">
                📞 Destination Phone Number (E.164)
              </label>
              {callSession && (
                <button
                  type="button"
                  onClick={() => setShowDialForm(false)}
                  className="text-xs text-[#64748b] hover:text-[#0f172a]"
                >
                  ✕ Close
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="+91 98765 43210"
                disabled={loading}
                className="flex-1 px-4 py-3 bg-white border border-[#cbd5e1] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={loading || !phoneNumber.trim() || !isPhoneValid}
                className="el-btn-primary px-6 py-3 text-sm flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
              >
                {loading ? 'Dialing...' : 'Start Call'}
              </button>
            </div>
            <p className="text-[11px] text-[#64748b]">
              Plivo PSTN dials this phone number. Answer the call to test the live voice agent.
            </p>
          </form>
        </div>
      )}

      {/* Live Ringing Banner */}
      {isPolling && !callSession && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600"></span>
            </span>
            <div>
              <h4 className="text-sm font-semibold text-emerald-950">Call Initiated — Ringing Destination</h4>
              <p className="text-xs text-emerald-700">
                Dialing <span className="font-mono font-semibold">{normalizePhoneNumber(phoneNumber)}</span>... Please answer the phone.
              </p>
            </div>
          </div>
          <button
            onClick={handleGetCallTranscript}
            disabled={fetchingTranscript}
            className="el-btn-primary py-2 px-4 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            {fetchingTranscript ? 'Connecting...' : 'Fetch Live Transcript'}
          </button>
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Controls, Latency Breakdown & Technical Telemetry (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Call Status & Latency Overview Card */}
          <div className="el-card p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e7e5e4]">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    callSession?.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : callSession?.status === 'ACTIVE'
                      ? 'bg-blue-100 text-blue-800 animate-pulse'
                      : callSession?.status === 'MISSED'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {callSession?.status || 'STANDBY'}
                </span>
                {callSession?.durationSeconds !== undefined && (
                  <span className="text-xs font-mono text-[#777169]">
                    Duration: {callSession.durationSeconds}s
                  </span>
                )}
              </div>

              {callSession?.primaryLanguage && (
                <span className="text-xs font-semibold bg-[#f5f5f4] text-[#44403c] px-2.5 py-0.5 rounded-md border border-[#e7e5e4]">
                  {callSession.primaryLanguage}
                </span>
              )}
            </div>

            {/* Top Latency Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-[#fafaf9] border border-[#e7e5e4] rounded-xl">
                <div className="text-[10px] uppercase font-semibold text-[#777169] tracking-wider">
                  Pickup → First Audio
                </div>
                <div className="text-xl font-bold font-mono text-[#0c0a09] mt-1">
                  {pickupToGreetingMs !== null ? `${pickupToGreetingMs} ms` : '—'}
                </div>
                <div className="text-[10px] text-[#a8a29e] mt-0.5">Greeting Latency</div>
              </div>

              <div className="p-3.5 bg-[#fafaf9] border border-[#e7e5e4] rounded-xl">
                <div className="text-[10px] uppercase font-semibold text-[#777169] tracking-wider">
                  Response Latency (P50)
                </div>
                <div className="text-xl font-bold font-mono text-[#0c0a09] mt-1">
                  {baseline?.responseLatencyP50Ms ? `${baseline.responseLatencyP50Ms} ms` : '—'}
                </div>
                <div className="text-[10px] text-[#a8a29e] mt-0.5">Turn Response</div>
              </div>
            </div>

            {callSession?.callerNumber && (
              <div className="text-xs text-[#777169] flex justify-between pt-1 font-mono">
                <span>Caller Contact:</span>
                <span className="font-semibold text-[#0c0a09]">{callSession.callerNumber}</span>
              </div>
            )}
          </div>

          {/* Startup Latency Breakdown Tiles */}
          <div className="el-card p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#777169] flex items-center justify-between">
              <span>⏱️ Startup Latency Breakdown</span>
              <span className="font-mono text-[#0c0a09]">{pickupToGreetingMs ? `${pickupToGreetingMs}ms` : ''}</span>
            </h4>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                <div className="text-[10px] text-[#777169]">WebSocket</div>
                <div className="text-xs font-bold font-mono text-[#0c0a09] mt-0.5">
                  {startupBreakdown.websocketToStartFrameMs !== undefined ? `${startupBreakdown.websocketToStartFrameMs}ms` : '—'}
                </div>
              </div>

              <div className="p-2.5 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                <div className="text-[10px] text-[#777169]">Runtime Config</div>
                <div className="text-xs font-bold font-mono text-[#0c0a09] mt-0.5">
                  {startupBreakdown.startFrameToRuntimeConfigMs !== undefined ? `${startupBreakdown.startFrameToRuntimeConfigMs}ms` : '—'}
                </div>
              </div>

              <div className="p-2.5 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                <div className="text-[10px] text-[#777169]">Call Session</div>
                <div className="text-xs font-bold font-mono text-[#0c0a09] mt-0.5">
                  {startupBreakdown.runtimeConfigToCallSessionMs !== undefined ? `${startupBreakdown.runtimeConfigToCallSessionMs}ms` : '—'}
                </div>
              </div>

              <div className="p-2.5 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                <div className="text-[10px] text-[#777169]">Pipeline Setup</div>
                <div className="text-xs font-bold font-mono text-[#0c0a09] mt-0.5">
                  {startupBreakdown.callSessionToPipelineMs || startupBreakdown.servicesToPipelineMs || '—'}ms
                </div>
              </div>

              <div className="p-2.5 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                <div className="text-[10px] text-[#777169]">TTS Connect</div>
                <div className="text-xs font-bold font-mono text-[#0c0a09] mt-0.5">
                  {startupBreakdown.pipelineToTTSReadyMs !== undefined ? `${startupBreakdown.pipelineToTTSReadyMs}ms` : '—'}
                </div>
              </div>

              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="text-[10px] text-emerald-800 font-semibold">Greeting Audio</div>
                <div className="text-xs font-bold font-mono text-emerald-950 mt-0.5">
                  {startupBreakdown.greetingQueuedToFirstAudioMs !== undefined ? `${startupBreakdown.greetingQueuedToFirstAudioMs}ms` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible Technical Latency Diagnostics (For Developers) */}
          <div className="el-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#57534e] flex items-center gap-1.5 uppercase tracking-wider">
                <span>⚙️ Technical Latency Details</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowTechDiagnostics(!showTechDiagnostics)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                {showTechDiagnostics ? 'Hide Details ▲' : 'Show Details ▼'}
              </button>
            </div>

            {showTechDiagnostics && (
              <div className="space-y-3 pt-2 border-t border-[#e7e5e4] text-xs">
                {completedTurns.length === 0 ? (
                  <p className="text-[#777169] text-xs">No per-turn timing data recorded yet.</p>
                ) : (
                  completedTurns.map((turn: any, idx: number) => (
                    <div key={idx} className="p-3 bg-[#fafaf9] border border-[#e7e5e4] rounded-xl space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between font-semibold text-[#0c0a09]">
                        <span>Turn {idx + 1}</span>
                        <span className="text-emerald-700">{turn.speechStopToFirstAudioMs || turn.responseLatencyMs || '—'}ms</span>
                      </div>
                      <div className="text-[#777169] flex justify-between">
                        <span>STT Final: {turn.speechStopToFinalTranscriptMs || '—'}ms</span>
                        <span>LLM TTFT: {turn.llmStartToFirstOutputMs || '—'}ms</span>
                        <span>TTS: {turn.ttsStartToFirstAudioMs || '—'}ms</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Real Conversational Call Transcript (7 cols - Main Focus) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="el-card p-5 flex flex-col h-[740px] shadow-sm">
            {/* Transcript Card Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#e7e5e4] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <div>
                  <h4 className="text-sm font-bold text-[#0c0a09] flex items-center gap-2">
                    <span>Call Conversation Transcript</span>
                    {conversationMessages.length > 0 && (
                      <span className="text-[11px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full font-mono">
                        {conversationMessages.length} messages
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-[#777169]">
                    Natural time-stamped dialog between caller and voice agent
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {conversationMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyTranscript}
                    className="el-btn-outline px-2.5 py-1.5 text-xs flex items-center gap-1.5 bg-white hover:bg-[#f5f5f4]"
                    title="Copy formatted dialogue text"
                  >
                    {copySuccess ? (
                      <>
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span className="text-emerald-700 font-semibold">Copied!</span>
                      </>
                    ) : (
                      <>
                        <span>📋</span>
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleGetCallTranscript}
                  disabled={fetchingTranscript}
                  className="el-btn-outline px-2.5 py-1.5 text-xs flex items-center gap-1.5 bg-white hover:bg-[#f5f5f4]"
                  title="Refresh transcript"
                >
                  {fetchingTranscript ? <span>...</span> : <span>🔄 Refresh</span>}
                </button>
              </div>
            </div>

            {/* Transcript Scrollable Dialogue Feed */}
            <div className="flex-1 overflow-y-auto p-4 my-3 bg-[#fafaf9] border border-[#e7e5e4] rounded-2xl space-y-4">
              {conversationMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#777169] space-y-3">
                  <div className="w-14 h-14 bg-white border border-[#e7e5e4] rounded-2xl flex items-center justify-center text-2xl shadow-2xs">
                    💬
                  </div>
                  <div className="max-w-xs space-y-1">
                    <h5 className="text-sm font-semibold text-[#0c0a09]">No Conversation Recorded Yet</h5>
                    <p className="text-xs text-[#777169]">
                      Place a test call using the dial button, or click <strong className="text-[#0c0a09]">Past Sessions</strong> above to load a previous call transcript.
                    </p>
                  </div>
                </div>
              ) : (
                conversationMessages.map((msg, idx) => {
                  const isUser = msg.role === 'user';

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      {/* Speaker label & clean timestamp */}
                      <div className="flex items-center gap-2 px-1 text-[11px] text-[#777169]">
                        <span className={`font-semibold ${isUser ? 'text-blue-900' : 'text-emerald-900'}`}>
                          {isUser ? '👤 Caller' : '🤖 Agent'}
                        </span>
                        {msg.timeLabel && <span className="text-[10px] text-[#a8a29e] font-mono">{msg.timeLabel}</span>}
                      </div>

                      {/* Natural Speech Bubble */}
                      <div
                        className={`max-w-[85%] p-4 text-sm leading-relaxed ${
                          isUser
                            ? 'bg-blue-600 text-white rounded-2xl rounded-tr-xs shadow-sm font-sans'
                            : 'bg-white border border-[#e2e8f0] text-[#0f172a] rounded-2xl rounded-tl-xs shadow-xs font-sans'
                        }`}
                      >
                        <p className="whitespace-pre-wrap selection:bg-amber-200 selection:text-black">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* Bottom Status Footer */}
            {callSession && (
              <div className="pt-2 border-t border-[#e7e5e4] flex items-center justify-between text-xs text-[#777169] shrink-0 font-mono">
                <div>
                  Call ID: <span className="text-[#0c0a09]">{callSession.roomName || callSession.id?.slice(0, 8)}</span>
                </div>
                <div>
                  Status: <span className="font-semibold text-[#0c0a09]">{callSession.status}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
