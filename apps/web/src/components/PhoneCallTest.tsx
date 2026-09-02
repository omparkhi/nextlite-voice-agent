import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

interface PhoneCallTestProps {
  clientId: string;
  agentId: string;
}

type CallStatus = 'idle' | 'initiating' | 'ringing' | 'connected' | 'active' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'queued' | 'in-progress' | 'in_progress' | 'initiated' | 'created';

export default function PhoneCallTest({ clientId, agentId }: PhoneCallTestProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState<'exotel' | 'plivo'>('exotel');
  const [enableRecording, setEnableRecording] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callSid, setCallSid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleProvider = () => {
    setProvider("plivo");
  }

  useEffect(() => {
    console.log('changed:', provider);
  }, [provider]);

  useEffect(() => {
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

  const validatePhoneNumber = (phone: string): boolean => {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+91')) {
      const number = cleaned.slice(3);
      return number.length === 10 && /^[6-9]\d{9}$/.test(number);
    }
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      const number = cleaned.slice(2);
      return /^[6-9]\d{9}$/.test(number);
    }
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      const number = cleaned.slice(1);
      return /^[6-9]\d{9}$/.test(number);
    }
    if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
      return true;
    }
    return false;
  };

  const handleStartCall = async () => {
    if (!validatePhoneNumber(phoneNumber)) {
      setError('Please enter a valid Indian mobile number (10 digits starting with 6-9)');
      return;
    }

    setError(null);
    setCallStatus('initiating');
    setCallDuration(0);

    try {
      const data = await api.startOutboundCall(clientId, agentId, phoneNumber, provider, enableRecording);
      setCallSid(data.callSid);
      setCallStatus('ringing');
      pollCallStatus(data.callSid);
    } catch (err) {
      setCallStatus('failed');
      setError(err instanceof Error ? err.message : 'Failed to initiate call');
    }
  };

  const pollCallStatus = async (sid: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const data = await api.getCallStatus(sid);
        const rawStatus = (data.status || '').toLowerCase().replace(/_/g, '-');
        const status = (rawStatus === 'in-call' ? 'in-progress' : rawStatus) as CallStatus;

        if (status) {
          setCallStatus(status);
        }

        if (['active', 'in-progress'].includes(status) && !durationInterval.current) {
          durationInterval.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
          }, 1000);
        }

        if (['completed', 'failed', 'busy', 'no-answer'].includes(status)) {
          clearInterval(pollInterval);
          if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
          }
          setCallStatus(status);
        }
      } catch {
        // Continue polling on error
      }
    }, 2000);
  };

  const handleEndCall = async () => {
    if (!callSid) return;

    try {
      await api.hangupCall(callSid);
      setCallStatus('completed');
    } catch {
      setCallStatus('completed');
    }

    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  };

  const handleTestAgain = () => {
    setCallStatus('idle');
    setCallSid(null);
    setError(null);
    setCallDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case 'idle': return 'text-[#777169]';
      case 'initiating':
      case 'initiated':
      case 'created': return 'text-amber-600';
      case 'ringing':
      case 'queued': return 'text-blue-600';
      case 'connected':
      case 'active':
      case 'in-progress':
      case 'in_progress': return 'text-emerald-600';
      case 'completed': return 'text-[#777169]';
      case 'failed':
      case 'busy':
      case 'no-answer': return 'text-red-600';
      default: return 'text-[#777169]';
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'idle': return 'Ready to call';
      case 'initiating':
      case 'initiated':
      case 'created': return 'Initiating call...';
      case 'ringing':
      case 'queued': return 'Ringing...';
      case 'connected': return 'Connected';
      case 'active':
      case 'in-progress':
      case 'in_progress': return 'In call';
      case 'completed': return 'Call completed';
      case 'failed': return 'Call failed';
      case 'busy': return 'Line busy';
      case 'no-answer': return 'No answer';
      default: return callStatus ? String(callStatus).replace(/-/g, ' ') : 'Unknown status';
    }
  };

  const isActive = ['initiating', 'initiated', 'created', 'ringing', 'connected', 'active', 'in-progress', 'in_progress', 'queued'].includes(callStatus);
  const isCompleted = ['completed', 'failed', 'busy', 'no-answer'].includes(callStatus);

  const [liveItems, setLiveItems] = useState<Array<{ id?: string; role: 'system' | 'user' | 'agent'; speakerName?: string; text: string; turnId?: string }>>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  const handleFetchLiveTranscript = async () => {
    setLoadingTranscript(true);
    setError(null);
    try {
      const data = await api.getLatestCallTranscript();
      if (data && data.items) {
        setLiveItems(data.items);
      } else {
        setLiveItems([{ role: 'system', text: data?.message || 'No call transcript found yet.' }]);
      }
    } catch {
      setError('Failed to fetch live transcript from server.');
    } finally {
      setLoadingTranscript(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="el-card p-6">
        <div className="text-center mb-6">
          <svg
            className="w-16 h-16 text-[#0c0a09] mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          <h3 className="text-lg font-display-serif text-[#0c0a09] mb-1">Phone Call Test</h3>
          <p className="text-sm text-[#777169]">Test the agent with a real phone call</p>
        </div>

        {/* Telephony Provider Selector */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-[#57534e] uppercase tracking-wider mb-2">
            Telephony Provider
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setProvider('exotel')}
              disabled={isActive}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium border transition-all ${provider === 'exotel'
                ? 'bg-[#0c0a09] text-white border-[#0c0a09]'
                : 'bg-white text-[#57534e] border-[#d6d3d1] hover:border-[#a8a29e]'
                } disabled:opacity-50`}
            >
              📞 Exotel
            </button>
            <button
              type="button"
              onClick={handleProvider}
              disabled={isActive}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium border transition-all ${provider === 'plivo'
                ? 'bg-[#0c0a09] text-white border-[#0c0a09]'
                : 'bg-white text-[#57534e] border-[#d6d3d1] hover:border-[#a8a29e]'
                } disabled:opacity-50`}
            >
              🌐 Plivo
            </button>
          </div>
        </div>

        {/* Phone Number Input */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-[#57534e] uppercase tracking-wider mb-2">
            Phone Number
          </label>
          <div className="flex gap-2">
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+91 98765 43210"
              disabled={isActive}
              className="flex-1 px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#a8a29e] focus:border-transparent disabled:bg-[#f5f5f4] disabled:cursor-not-allowed"
            />
          </div>
          <p className="text-xs text-[#777169] mt-1">
            Enter an Indian mobile number (10 digits starting with 6-9)
          </p>
        </div>

        {/* Call Recording Toggle */}
        <div className="mb-6 flex items-center justify-between px-1">
          <label className="text-xs text-[#57534e] cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={enableRecording}
              onChange={(e) => setEnableRecording(e.target.checked)}
              disabled={isActive}
              className="rounded border-[#d6d3d1] text-[#0c0a09] focus:ring-0 cursor-pointer"
            />
            <span>Enable Call Recording</span>
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Status Display */}
        <div className="mb-6 p-4 bg-[#fafaf9] rounded-xl border border-[#e7e5e4]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#57534e]">Status:</span>
            <span className={`text-sm font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </span>
          </div>
          {callSid && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-[#57534e]">Call ID:</span>
              <span className="text-xs text-[#777169] font-mono">{callSid.substring(0, 16)}...</span>
            </div>
          )}
          {callDuration > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-[#57534e]">Duration:</span>
              <span className="text-sm font-medium text-[#0c0a09] font-mono">{formatDuration(callDuration)}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            {!isActive && !isCompleted && (
              <button
                onClick={handleStartCall}
                disabled={!phoneNumber || !validatePhoneNumber(phoneNumber)}
                className="flex-1 el-btn-primary py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Test Call
              </button>
            )}

            {isActive && (
              <button
                onClick={handleEndCall}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
              >
                End Call
              </button>
            )}

            {isCompleted && (
              <button
                onClick={handleTestAgain}
                className="flex-1 el-btn-outline py-3 text-sm"
              >
                Test Again
              </button>
            )}
          </div>

          <button
            onClick={handleFetchLiveTranscript}
            disabled={loadingTranscript}
            className="w-full px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <span>📜</span>
            <span>{loadingTranscript ? 'Fetching Live Transcript...' : 'Get Live Call Transcript'}</span>
          </button>
        </div>

        {/* Live Call Transcript Box */}
        {liveItems.length > 0 && (
          <div className="mt-6 p-4 bg-stone-900 text-stone-100 rounded-xl border border-stone-800 shadow-inner">
            <div className="flex items-center justify-between mb-3 border-b border-stone-800 pb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <span>🗣️</span>
                <span>Live Call Speech Transcript</span>
              </h4>
              <span className="text-[10px] text-stone-400 font-mono">{liveItems.length} items</span>
            </div>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {liveItems.map((item, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg text-xs leading-relaxed ${item.role === 'user'
                    ? 'bg-amber-950/60 text-amber-100 border border-amber-700/50'
                    : item.role === 'agent'
                      ? 'bg-emerald-950/60 text-emerald-100 border border-emerald-700/50'
                      : 'bg-stone-800 text-stone-400 text-[11px] italic'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[11px]">
                      {item.role === 'user' ? '👤 USER' : item.role === 'agent' ? `🤖 ${item.speakerName || 'AGENT'}` : '⚙️ SYSTEM'}
                    </span>
                    {item.turnId && <span className="text-[10px] opacity-75 font-mono">[{item.turnId}]</span>}
                  </div>
                  <p className="whitespace-pre-wrap">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <h4 className="text-sm font-medium text-blue-900 mb-2">How it works</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>1. Enter your phone number and click "Start Test Call"</li>
            <li>2. Your phone will ring within a few seconds</li>
            <li>3. The AI agent will greet you based on its configuration</li>
            <li>4. Speak naturally - the agent will respond in real-time</li>
            <li>5. Click "Get Live Call Transcript" at any time to view real-time turns</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
