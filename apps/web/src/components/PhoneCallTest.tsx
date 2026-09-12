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
  const [callResult, setCallResult] = useState<PhoneTestResult | null>(null);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const [showRawTimeline, setShowRawTimeline] = useState(false);
  const [fetchingTranscript, setFetchingTranscript] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const pollIntervalRef = useRef<number | null>(null);
  const pollCountRef = useRef(0);

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

  // Poll for CallSession updates after initiation
  useEffect(() => {
    if (!isPolling || !callResult) return;

    const poll = async () => {
      pollCountRef.current += 1;
      try {
        const response = await api.getClientCalls({ agentId, tenantId: clientId, limit: 5 });
        const calls = response.calls || [];
        // Match the latest call for this test deployment or caller phone, fallback to latest call for agent
        const normalized = normalizePhoneNumber(phoneNumber);
        const match =
          calls.find(
            (c) =>
              (callResult.deploymentId && c.deploymentId === callResult.deploymentId) ||
              (c.callerNumber && normalized && c.callerNumber.includes(normalized.slice(-8))) ||
              (c.roomName && callResult.callId && c.roomName.includes(callResult.callId)) ||
              (c.agentId === agentId)
          ) || calls[0];

        if (match) {
          setCallSession(match);
          if (['COMPLETED', 'FAILED', 'MISSED'].includes(match.status)) {
            setIsPolling(false);
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
    poll(); // immediate initial check

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isPolling, callResult, agentId, clientId, phoneNumber]);

  const handleReset = () => {
    setCallResult(null);
    setCallSession(null);
    setIsPolling(false);
    setError(null);
    setExpandedTurns({});
  };

  const handleGetCallTranscript = async () => {
    setFetchingTranscript(true);
    setError(null);
    try {
      if (callSession?.id) {
        const updated = await api.getClientCall(callSession.id, clientId);
        if (updated) {
          setCallSession(updated);
          return;
        }
      }

      // Query client calls for latest session
      const response = await api.getClientCalls({ agentId, tenantId: clientId, limit: 5 });
      const calls = response.calls || [];
      const normalized = normalizePhoneNumber(phoneNumber);
      const match =
        calls.find(
          (c) =>
            (callResult?.deploymentId && c.deploymentId === callResult.deploymentId) ||
            (c.callerNumber && normalized && c.callerNumber.includes(normalized.slice(-8))) ||
            (c.roomName && callResult?.callId && c.roomName.includes(callResult.callId)) ||
            (c.agentId === agentId)
        ) || calls[0];

      if (match) {
        setCallSession(match);
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

  const handleCopyTranscript = () => {
    const textToCopy =
      callSession?.transcriptText ||
      (turnsList.length > 0
        ? turnsList
            .map((t) => {
              const u = t.user?.transcript ? `User: ${t.user.transcript}` : '';
              const a = t.agent?.response ? `Assistant: ${t.agent.response}` : '';
              return [u, a].filter(Boolean).join('\n');
            })
            .filter(Boolean)
            .join('\n')
        : '');

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  const toggleTurn = (turnKey: string) => {
    setExpandedTurns((prev) => ({ ...prev, [turnKey]: !prev[turnKey] }));
  };

  const isPhoneValid = isValidE164Phone(phoneNumber);

  // Extract structured metrics from call session
  const metrics = callSession?.metricsJson || {};
  const startupBreakdown = metrics.startupBreakdown || metrics.startupMetrics?.breakdown || {};
  const completedTurns = metrics.turns || [];
  const timelineEvents = metrics.timeline || [];
  const phoneTraces = metrics.phoneTraces || [];
  const baseline = metrics.callBaseline;

  // Pickup to First Greeting Audio ms
  const pickupToGreetingMs =
    startupBreakdown.pickupToFirstGreetingAudioMs ||
    metrics.startupMetrics?.totalCallStartupToFirstAudioMs ||
    null;

  // Build Speaker Transcript turns
  const turnsList = callSession?.turnsJson || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="el-card p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#0c0a09]/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-7 h-7 text-[#0c0a09]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-display-serif text-[#0c0a09] mb-1">Admin Phone Call Test</h3>
          <p className="text-xs text-[#777169]">
            Real-Time Call Transcript, Startup Forensics & Per-Turn Latency Analysis
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
            <span className="text-red-500 font-bold">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Phone Input Form (when no call is active) */}
        {!callResult && (
          <form onSubmit={handleStartCall} className="space-y-5 max-w-lg mx-auto">
            <div>
              <label className="block text-xs font-medium text-[#57534e] uppercase tracking-wider mb-2">
                Destination Phone Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="+91 98765 43210"
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#a8a29e] focus:border-transparent disabled:bg-[#f5f5f4] disabled:cursor-not-allowed"
                />
              </div>
              <p className="text-[11px] text-[#777169] mt-1.5">
                Enter phone number in E.164 format (e.g. +91 98765 43210 or 10-digit mobile number)
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !phoneNumber.trim() || !isPhoneValid}
              className="w-full el-btn-primary py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Initiating Call...</span>
                </>
              ) : (
                <>
                  <span>📞</span>
                  <span>Start Phone Call Test</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleGetCallTranscript}
              disabled={fetchingTranscript}
              className="w-full el-btn-outline py-2.5 text-xs flex items-center justify-center gap-2"
            >
              {fetchingTranscript ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-[#0c0a09]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Fetching Recent Call Transcript...</span>
                </>
              ) : (
                <>
                  <span>📜</span>
                  <span>Get Latest Call Transcript</span>
                </>
              )}
            </button>

            <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl">
              <h4 className="text-xs font-semibold text-blue-900 mb-1.5 flex items-center gap-1.5">
                <span>ℹ️</span>
                <span>Testing Flow</span>
              </h4>
              <ul className="text-[11px] text-blue-800 space-y-1">
                <li>• Plivo PSTN dials your phone number directly.</li>
                <li>• When answered, the pipeline connects to Pipecat realtime voice engine.</li>
                <li>• All startup stages, conversation turns, and tool executions are instrumented.</li>
                <li>• A complete timed transcript and latency breakdown will appear upon completion.</li>
              </ul>
            </div>
          </form>
        )}

        {/* Live Call In-Progress Banner */}
        {callResult && isPolling && !callSession && (
          <div className="p-5 bg-emerald-50/90 border border-emerald-200 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-3 h-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-emerald-950">Call Initiated — Ringing Destination</h4>
                <p className="text-xs text-emerald-700">
                  Dialing <span className="font-mono font-medium">{normalizePhoneNumber(phoneNumber)}</span>...
                </p>
              </div>
            </div>

            <div className="p-3 bg-white/80 border border-emerald-100 rounded-xl text-xs space-y-1 text-emerald-900 font-mono">
              <div className="flex justify-between">
                <span className="text-[#777169]">Call Request UUID:</span>
                <span>{callResult.callId || 'Initiated'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777169]">Deployment ID:</span>
                <span>{callResult.deploymentId}</span>
              </div>
            </div>

            <p className="text-xs text-emerald-800">
              Please answer the phone call and speak naturally. When you hang up, the complete time-aligned transcript and timing breakdown will appear automatically.
            </p>

            <div className="flex flex-wrap gap-2.5 pt-2 border-t border-emerald-200/60">
              <button
                type="button"
                onClick={handleGetCallTranscript}
                disabled={fetchingTranscript}
                className="flex-1 el-btn-primary py-2 text-xs flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                {fetchingTranscript ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Fetching Transcript...</span>
                  </>
                ) : (
                  <>
                    <span>📜</span>
                    <span>Get Call Transcript</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="el-btn-outline py-2 px-3 text-xs flex items-center justify-center gap-1.5 bg-white text-emerald-900 border-emerald-300"
              >
                <span>🔄</span>
                <span>Reset / New Call</span>
              </button>
            </div>
          </div>
        )}

        {/* Active/Completed Call Results */}
        {callResult && callSession && (
          <div className="space-y-6 mt-4">
            {/* Call Status & Top Summary Banner */}
            <div className="p-5 bg-[#fafaf9] border border-[#e7e5e4] rounded-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      callSession.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : callSession.status === 'ACTIVE'
                        ? 'bg-blue-100 text-blue-800 animate-pulse'
                        : callSession.status === 'MISSED'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {callSession.status}
                  </span>
                  <span className="text-xs font-mono text-[#777169]">
                    Duration: {callSession.durationSeconds}s
                  </span>
                  {callSession.primaryLanguage && (
                    <span className="text-xs bg-[#f5f5f4] text-[#57534e] px-2 py-0.5 rounded">
                      {callSession.primaryLanguage}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGetCallTranscript}
                    disabled={fetchingTranscript}
                    className="el-btn-outline px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 bg-white"
                    title="Fetch latest transcript and timing data from the server"
                  >
                    {fetchingTranscript ? (
                      <>
                        <svg className="animate-spin h-3 w-3 text-[#0c0a09]" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <span>🔄</span>
                        <span>Get Call Transcript</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleReset}
                    className="el-btn-outline px-3 py-1.5 text-xs font-medium"
                  >
                    Test Another Call
                  </button>
                </div>
              </div>

              {/* Startup Latency Highlight Banner (Pickup → Greeting) */}
              <div className="p-4 bg-white border border-[#e7e5e4] rounded-xl flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#777169] font-medium">
                    Pickup → Pipecat First Greeting Audio
                  </div>
                  <div className="text-2xl font-bold font-mono text-[#0c0a09] mt-0.5">
                    {pickupToGreetingMs !== null ? `${pickupToGreetingMs} ms` : 'Not captured'}
                    {pickupToGreetingMs !== null && (
                      <span className="text-xs font-normal text-[#777169] ml-2">
                        ({(pickupToGreetingMs / 1000).toFixed(2)}s)
                      </span>
                    )}
                  </div>
                </div>

                {baseline && baseline.responseLatencyP50Ms !== null && (
                  <div className="border-l border-[#e7e5e4] pl-4">
                    <div className="text-[11px] uppercase tracking-wider text-[#777169] font-medium">
                      Turn Response Latency (P50)
                    </div>
                    <div className="text-xl font-bold font-mono text-[#0c0a09] mt-0.5">
                      {baseline.responseLatencyP50Ms} ms
                    </div>
                  </div>
                )}

                {baseline && (
                  <div className="text-xs text-[#777169] space-y-0.5 font-mono">
                    <div>Total Turns: {baseline.totalTurns || completedTurns.length}</div>
                    <div>Interrupted: {baseline.interruptedTurns || 0}</div>
                  </div>
                )}
              </div>
            </div>

            {/* STARTUP LATENCY BREAKDOWN (PART 6) */}
            <div className="el-card p-5 space-y-3">
              <h4 className="text-sm font-semibold text-[#0c0a09] flex items-center justify-between">
                <span>⏱️ Startup Latency Breakdown</span>
                <span className="text-xs font-mono text-[#777169]">
                  Total: {pickupToGreetingMs ? `${pickupToGreetingMs}ms` : 'Not captured'}
                </span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs">
                <div className="p-3 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                  <div className="text-[10px] text-[#777169] uppercase tracking-wider">WebSocket</div>
                  <div className="text-sm font-bold font-mono text-[#0c0a09] mt-1">
                    {startupBreakdown.websocketToStartFrameMs !== undefined && startupBreakdown.websocketToStartFrameMs !== null
                      ? `${startupBreakdown.websocketToStartFrameMs}ms`
                      : 'Not captured'}
                  </div>
                  <div className="text-[10px] text-[#a8a29e] mt-0.5">WS → StartFrame</div>
                </div>

                <div className="p-3 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                  <div className="text-[10px] text-[#777169] uppercase tracking-wider">Runtime Config</div>
                  <div className="text-sm font-bold font-mono text-[#0c0a09] mt-1">
                    {startupBreakdown.startFrameToRuntimeConfigMs !== undefined && startupBreakdown.startFrameToRuntimeConfigMs !== null
                      ? `${startupBreakdown.startFrameToRuntimeConfigMs}ms`
                      : 'Not captured'}
                  </div>
                  <div className="text-[10px] text-[#a8a29e] mt-0.5">Start → Config</div>
                </div>

                <div className="p-3 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                  <div className="text-[10px] text-[#777169] uppercase tracking-wider">Call Session</div>
                  <div className="text-sm font-bold font-mono text-[#0c0a09] mt-1">
                    {startupBreakdown.runtimeConfigToCallSessionMs !== undefined && startupBreakdown.runtimeConfigToCallSessionMs !== null
                      ? `${startupBreakdown.runtimeConfigToCallSessionMs}ms`
                      : 'Not captured'}
                  </div>
                  <div className="text-[10px] text-[#a8a29e] mt-0.5">Config → Session</div>
                </div>

                <div className="p-3 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                  <div className="text-[10px] text-[#777169] uppercase tracking-wider">Pipeline Setup</div>
                  <div className="text-sm font-bold font-mono text-[#0c0a09] mt-1">
                    {startupBreakdown.callSessionToPipelineMs !== undefined && startupBreakdown.callSessionToPipelineMs !== null
                      ? `${startupBreakdown.callSessionToPipelineMs}ms`
                      : startupBreakdown.servicesToPipelineMs !== undefined && startupBreakdown.servicesToPipelineMs !== null
                      ? `${startupBreakdown.servicesToPipelineMs}ms`
                      : 'Not captured'}
                  </div>
                  <div className="text-[10px] text-[#a8a29e] mt-0.5">Services & Pipeline</div>
                </div>

                <div className="p-3 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
                  <div className="text-[10px] text-[#777169] uppercase tracking-wider">TTS Connect</div>
                  <div className="text-sm font-bold font-mono text-[#0c0a09] mt-1">
                    {startupBreakdown.pipelineToTTSReadyMs !== undefined && startupBreakdown.pipelineToTTSReadyMs !== null
                      ? `${startupBreakdown.pipelineToTTSReadyMs}ms`
                      : 'Not captured'}
                  </div>
                  <div className="text-[10px] text-[#a8a29e] mt-0.5">Pipeline → TTS Ready</div>
                </div>

                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="text-[10px] text-emerald-800 uppercase tracking-wider font-semibold">Greeting Audio</div>
                  <div className="text-sm font-bold font-mono text-emerald-950 mt-1">
                    {startupBreakdown.greetingQueuedToFirstAudioMs !== undefined && startupBreakdown.greetingQueuedToFirstAudioMs !== null
                      ? `${startupBreakdown.greetingQueuedToFirstAudioMs}ms`
                      : 'Not captured'}
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">Queue → First Audio</div>
                </div>
              </div>
            </div>

            {/* SPEAKER CONVERSATION TRANSCRIPT (PART 3 & 4) */}
            <div className="el-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#0c0a09] flex items-center gap-2">
                  <span>💬 Conversation Transcript</span>
                  <span className="text-xs font-normal text-[#777169]">
                    ({turnsList.length} {turnsList.length === 1 ? 'turn' : 'turns'})
                  </span>
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGetCallTranscript}
                    disabled={fetchingTranscript}
                    className="el-btn-outline px-2.5 py-1 text-xs flex items-center gap-1 bg-white"
                    title="Refresh transcript from server"
                  >
                    {fetchingTranscript ? (
                      <span>Fetching...</span>
                    ) : (
                      <>
                        <span>🔄</span>
                        <span>Get Call Transcript</span>
                      </>
                    )}
                  </button>
                  {(callSession.transcriptText || turnsList.length > 0) && (
                    <button
                      onClick={handleCopyTranscript}
                      className="el-btn-outline px-2.5 py-1 text-xs flex items-center gap-1 bg-white"
                    >
                      {copySuccess ? (
                        <>
                          <span className="text-emerald-600 font-bold">✓</span>
                          <span className="text-emerald-700 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <span>📋</span>
                          <span>Copy Plain Text</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {turnsList.length === 0 ? (
                <div className="text-xs text-[#777169] text-center py-6 bg-[#fafaf9] rounded-xl">
                  {callSession.transcriptText ? (
                    <pre className="text-left font-mono whitespace-pre-wrap px-4">
                      {callSession.transcriptText}
                    </pre>
                  ) : (
                    'No conversational turns recorded for this call.'
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {turnsList.map((turn, index) => {
                    const turnKey = `turn-${index}`;
                    const isExpanded = !!expandedTurns[turnKey];
                    const matchedTiming = completedTurns[index] || null;

                    return (
                      <div
                        key={turnKey}
                        className="p-4 bg-[#fafaf9] border border-[#e7e5e4] rounded-xl space-y-3"
                      >
                        {/* User Bubble */}
                        {turn.user && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-[#777169]">
                              <span className="font-semibold text-blue-900 uppercase">👤 User</span>
                              <span className="font-mono text-[10px]">{turn.user.timestamp ? new Date(turn.user.timestamp).toLocaleTimeString() : ''}</span>
                            </div>
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-950 font-sans">
                              "{turn.user.transcript}"
                            </div>
                          </div>
                        )}

                        {/* Agent Bubble */}
                        {turn.agent && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-[#777169]">
                              <span className="font-semibold text-emerald-900 uppercase">🤖 Agent</span>
                              <span className="font-mono text-[10px]">{turn.agent.timestamp ? new Date(turn.agent.timestamp).toLocaleTimeString() : ''}</span>
                            </div>
                            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-950 font-sans">
                              "{turn.agent.response}"
                            </div>
                          </div>
                        )}

                        {/* Turn Latency Badge & Expand Toggle */}
                        {matchedTiming && (
                          <div className="pt-2 border-t border-[#e7e5e4] flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium text-[#0c0a09]">
                                Turn Latency: {matchedTiming.speechStopToFirstAudioMs || matchedTiming.responseLatencyMs || '—'}ms
                              </span>
                              {matchedTiming.speechStopToFinalTranscriptMs !== undefined && (
                                <span className="text-[11px] text-[#777169] font-mono">
                                  (STT: {matchedTiming.speechStopToFinalTranscriptMs}ms | LLM: {matchedTiming.llmStartToFirstOutputMs}ms | TTS: {matchedTiming.ttsStartToFirstAudioMs}ms)
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => toggleTurn(turnKey)}
                              className="text-[11px] text-[#57534e] hover:text-[#0c0a09] underline font-medium"
                            >
                              {isExpanded ? 'Hide Timing Breakdown ▲' : 'View Stage Breakdown ▼'}
                            </button>
                          </div>
                        )}

                            {/* Expandable Per-Turn Stage Breakdown (Phase 16E) */}
                            {isExpanded && matchedTiming && (
                              <div className="p-3 bg-white border border-[#e7e5e4] rounded-lg text-xs space-y-2 font-mono text-[#57534e]">
                                <div className="font-sans font-semibold text-[#0c0a09] text-[11px]">
                                  Granular Stage Breakdown (Turn {index + 1}):
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                  <div>
                                    <span className="text-[#777169]">Speech Stop → STT:</span>{' '}
                                    <span className="font-bold text-[#0c0a09]">
                                      {matchedTiming.speechStopToFinalTranscriptMs || matchedTiming.vadStopToSttFinalMs || '—'}ms
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[#777169]">STT → Aggregation:</span>{' '}
                                    <span className="font-bold text-[#0c0a09]">
                                      {matchedTiming.finalTranscriptToAggregationMs || matchedTiming.sttFinalToAggregationMs || '—'}ms
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[#777169]">Aggregation → LLM Req:</span>{' '}
                                    <span className="font-bold text-[#0c0a09]">
                                      {matchedTiming.aggregationToLLMRequestMs || matchedTiming.aggregationToLlmStartMs || '—'}ms
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[#777169]">LLM Provider TTFT:</span>{' '}
                                    <span className="font-bold text-[#0c0a09]">
                                      {matchedTiming.llmRequestToFirstOutputMs || matchedTiming.llmStartToFirstOutputMs || '—'}ms
                                    </span>
                                  </div>
                                </div>

                                {/* Additional LLM & Tool Generation Details */}
                                {(matchedTiming.llmHttpRequestMs !== undefined || matchedTiming.llmToFirstToolDeltaMs !== undefined || matchedTiming.firstToolDeltaToToolCompleteMs !== undefined) && (
                                  <div className="pt-1.5 border-t border-[#f5f5f4] grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-[#777169]">
                                    {matchedTiming.llmHttpRequestMs !== undefined && (
                                      <div>
                                        <span>HTTP Dispatch / Connect:</span>{' '}
                                        <span className="font-bold text-[#0c0a09]">{matchedTiming.llmHttpRequestMs}ms</span>
                                      </div>
                                    )}
                                    {matchedTiming.llmToFirstToolDeltaMs !== undefined && (
                                      <div>
                                        <span>LLM → Tool Call Delta:</span>{' '}
                                        <span className="font-bold text-[#0c0a09]">{matchedTiming.llmToFirstToolDeltaMs}ms</span>
                                      </div>
                                    )}
                                    {matchedTiming.firstToolDeltaToToolCompleteMs !== undefined && (
                                      <div>
                                        <span>Tool JSON Generation:</span>{' '}
                                        <span className="font-bold text-amber-900">{matchedTiming.firstToolDeltaToToolCompleteMs}ms</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* TTS Stage Details */}
                                <div className="pt-1.5 border-t border-[#f5f5f4] grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-[#777169]">
                                  <div>
                                    <span>LLM Output → TTS Start:</span>{' '}
                                    <span className="font-bold text-[#0c0a09]">{matchedTiming.llmFirstOutputToTtsStartMs || '—'}ms</span>
                                  </div>
                                  <div>
                                    <span>TTS Start → First Audio:</span>{' '}
                                    <span className="font-bold text-[#0c0a09]">{matchedTiming.ttsStartToFirstAudioMs || '—'}ms</span>
                                  </div>
                                  <div>
                                    <span>E2E Speech Stop → Audio:</span>{' '}
                                    <span className="font-bold text-emerald-800">{matchedTiming.speechStopToFirstAudioMs || '—'}ms</span>
                                  </div>
                                </div>

                                {/* Tool details if this turn used a tool */}
                                {matchedTiming.tools && matchedTiming.tools.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-[#f5f5f4] text-[11px] text-purple-900 bg-purple-50/60 p-2 rounded space-y-1">
                                    <div className="font-semibold">
                                      Tool Handler Execution:{' '}
                                      {matchedTiming.tools.map((t) => `${t.name} (${t.durationMs}ms)`).join(', ')}
                                    </div>
                                    {matchedTiming.toolResultToPostToolLlmStartMs !== undefined && (
                                      <div className="text-[10px] text-purple-800">
                                        Tool Result → Post-Tool LLM Dispatch: {matchedTiming.toolResultToPostToolLlmStartMs}ms
                                        {matchedTiming.postToolLlmToFirstOutputMs !== undefined && (
                                          <span> | Post-Tool LLM TTFT: {matchedTiming.postToolLlmToFirstOutputMs}ms</span>
                                        )}
                                        {matchedTiming.postToolTTSToFirstAudioMs !== undefined && (
                                          <span> | Post-Tool TTS Audio: {matchedTiming.postToolTTSToFirstAudioMs}ms</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SAFE PHONE NUMBER TRACE DIAGNOSTICS (PART 8) */}
            {phoneTraces.length > 0 && (
              <div className="el-card p-5 space-y-3">
                <h4 className="text-sm font-semibold text-[#0c0a09] flex items-center gap-2">
                  <span>🔒 Safe Phone Number Trace</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">
                    NON-PII REDACTED
                  </span>
                </h4>
                <p className="text-xs text-[#777169]">
                  Diagnoses whether Sarvam STT and tool argument extractors captured spoken/numeric digits without logging raw PII:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  {phoneTraces.map((pt, i) => (
                    <div key={i} className="p-3 bg-[#fafaf9] border border-[#e7e5e4] rounded-xl space-y-1">
                      <div className="flex justify-between font-semibold text-[#0c0a09]">
                        <span>Boundary: {pt.boundary || 'pipeline'}</span>
                        <span>{pt.phoneObserved ? '✅ Detected' : '❌ None'}</span>
                      </div>
                      <div className="flex justify-between text-[#777169]">
                        <span>Digit Count:</span>
                        <span className="font-bold text-[#0c0a09]">{pt.digits}</span>
                      </div>
                      <div className="flex justify-between text-[#777169]">
                        <span>Masked Last4:</span>
                        <span className="font-bold text-[#0c0a09]">{pt.last4 ? `******${pt.last4}` : 'None'}</span>
                      </div>
                      <div className="flex justify-between text-[#777169]">
                        <span>Representation:</span>
                        <span className="capitalize">{pt.representation || 'none'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* UNIFIED RAW CALL TIMELINE (PART 1 & 5) */}
            <div className="el-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#0c0a09] flex items-center gap-2">
                  <span>📜 Chronological Event Timeline</span>
                  <span className="text-xs font-mono text-[#777169]">
                    ({timelineEvents.length} events)
                  </span>
                </h4>
                <button
                  onClick={() => setShowRawTimeline(!showRawTimeline)}
                  className="el-btn-outline px-2.5 py-1 text-xs"
                >
                  {showRawTimeline ? 'Collapse Timeline ▲' : 'Expand Timeline ▼'}
                </button>
              </div>

              {showRawTimeline && (
                <div className="p-3 bg-[#1c1917] text-[#f5f5f4] rounded-xl text-xs font-mono max-h-80 overflow-y-auto space-y-1">
                  {timelineEvents.length === 0 ? (
                    <p className="text-[#a8a29e]">No chronological events captured.</p>
                  ) : (
                    timelineEvents.map((evt, idx) => (
                      <div key={idx} className="flex gap-3 hover:bg-white/5 px-1 py-0.5 rounded">
                        <span className="text-emerald-400 font-bold w-16 text-right">
                          +{evt.elapsedFromCallStartMs || 0}ms
                        </span>
                        <span className="text-amber-300 w-28">[{evt.type || 'EVENT'}]</span>
                        <span className="text-white font-medium">{evt.event}</span>
                        {evt.turnId && <span className="text-[#a8a29e]">({evt.turnId})</span>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
