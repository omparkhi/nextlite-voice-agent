import { useState } from 'react';
import { api, PhoneTestResult } from '../services/api';

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
  const [error, setError] = useState<string | null>(null);

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

    try {
      const result = await api.startPhoneTest(clientId, agentId, normalized);
      setCallResult(result);
    } catch (err: any) {
      const msg = err?.message || 'Failed to initiate outbound phone call.';
      if (msg.includes('No active TEST deployment')) {
        setError('No active TEST deployment found for this agent. Please save your agent configuration first.');
      } else if (msg.includes('Invalid phone number')) {
        setError('The phone number format is invalid. Must be E.164 (e.g. +919876543210).');
      } else if (msg.includes('LiveKit SIP trunk is not configured')) {
        setError('LiveKit SIP trunk is not configured in the server environment.');
      } else if (msg.includes('Failed to initiate SIP outbound call')) {
        setError('LiveKit SIP dialout failed. Please verify SIP trunk balance and destination number.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCallResult(null);
    setError(null);
  };

  const isPhoneValid = isValidE164Phone(phoneNumber);

  return (
    <div className="max-w-lg mx-auto">
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
          <h3 className="text-lg font-display-serif text-[#0c0a09] mb-1">Phone Call Test</h3>
          <p className="text-xs text-[#777169]">
            Dial a real phone number via LiveKit SIP to test your agent's active TEST deployment
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
            <span className="text-red-500 font-bold">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Active Call State / Results */}
        {callResult ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative flex items-center justify-center w-3 h-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-emerald-900">
                    Call Initiated
                  </h4>
                  <p className="text-xs text-emerald-700">
                    Calling <span className="font-mono font-medium">{normalizePhoneNumber(phoneNumber)}</span>...
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-emerald-200/60 space-y-2 text-xs text-emerald-900">
                <div className="flex justify-between">
                  <span className="text-emerald-700">Telephony Gateway:</span>
                  <span className="font-medium">LiveKit SIP → Plivo Zentrunk</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-emerald-700">Target Environment:</span>
                  <span className="font-medium bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[10px]">
                    ACTIVE TEST DEPLOYMENT
                  </span>
                </div>
                {callResult.callId && (
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Call ID:</span>
                    <span className="font-mono text-[11px] text-emerald-800">
                      {callResult.callId}
                    </span>
                  </div>
                )}
                {callResult.roomName && (
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Room:</span>
                    <span className="font-mono text-[11px] text-emerald-800">
                      {callResult.roomName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-[#fafaf9] border border-[#e7e5e4] rounded-xl text-xs text-[#57534e] space-y-1.5">
              <p className="font-medium text-[#0c0a09]">Next Steps:</p>
              <ul className="list-disc list-inside space-y-1 text-[#777169]">
                <li>Your phone should ring in a few moments.</li>
                <li>When you answer, you will connect to the LiveKit room.</li>
                <li>The agent will automatically greet you and respond using Sarvam AI.</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full el-btn-outline py-2.5 text-xs font-medium"
            >
              Test Another Phone Number
            </button>
          </div>
        ) : (
          /* Phone Input Form */
          <form onSubmit={handleStartCall} className="space-y-5">
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
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
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

            {/* Information Box */}
            <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl">
              <h4 className="text-xs font-semibold text-blue-900 mb-1.5 flex items-center gap-1.5">
                <span>ℹ️</span>
                <span>How LiveKit SIP Phone Testing Works</span>
              </h4>
              <ul className="text-[11px] text-blue-800 space-y-1">
                <li>• LiveKit creates an isolated voice room with your active TEST configuration.</li>
                <li>• LiveKit dispatches worker agent <span className="font-mono font-medium">my-agent</span> to the room.</li>
                <li>• LiveKit SIP dials your phone via Plivo Zentrunk.</li>
                <li>• When answered, the AI assistant greets you using Sarvam STT & TTS.</li>
              </ul>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
