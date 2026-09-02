import type { AgentConfiguration } from '../../types';

interface SettingsEditorProps {
  configuration: AgentConfiguration;
  onChange: (updated: Partial<AgentConfiguration>) => void;
}

const voiceOptions = [
  { id: 'shubh', label: 'Shubh (Hindi Male)' },
  { id: 'aditya', label: 'Aditya (Hindi Male)' },
  { id: 'rahul', label: 'Rahul (Hindi Male)' },
  { id: 'rohan', label: 'Rohan (Hindi Male)' },
  { id: 'manan', label: 'Manan (Hindi Male)' },
  { id: 'varun', label: 'Varun (Hindi Male)' },
  { id: 'priya', label: 'Priya (Hindi Female)' },
  { id: 'neha', label: 'Neha (Hindi Female)' },
  { id: 'pooja', label: 'Pooja (Hindi Female)' },
  { id: 'simran', label: 'Simran (Hindi Female)' },
  { id: 'kavya', label: 'Kavya (Hindi Female)' },
  { id: 'ritu', label: 'Ritu (Hindi Female)' },
];

export function SettingsEditor({ configuration, onChange }: SettingsEditorProps) {
  const voice = configuration.voice || { provider: 'sarvam', voiceId: 'shubh' };
  const runtime = configuration.runtimeSettings || {
    modelTemperature: 0.7,
    allowCallerInterruptions: true,
    nudges: { enabled: true, delaySeconds: 7, messages: ['Are you there? I can help you.'], maxUnansweredNudges: 2 },
    maxCallLengthSeconds: 300,
  };
  const lang = configuration.language || { primary: 'en-IN', supported: ['en-IN'] };

  const handleVoiceChange = (field: string, value: any) => {
    onChange({ voice: { ...voice, [field]: value } });
  };

  const handleRuntimeChange = (field: string, value: any) => {
    onChange({ runtimeSettings: { ...runtime, [field]: value } });
  };

  const handleLanguageChange = (field: string, value: any) => {
    onChange({ language: { ...lang, [field]: value } });
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="border-b border-gray-200 pb-3">
        <h3 className="text-lg font-semibold text-gray-900 mb-0.5">Voice & Runtime Settings</h3>
        <p className="text-gray-500">Configure TTS voice, speaking parameters, barge-in, quiet caller nudges, and call length</p>
      </div>

      {/* Speaking */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-4">
        <h4 className="font-semibold text-gray-900 text-sm border-b border-gray-100 pb-2.5">Speaking & Voice</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-700 mb-1.5 font-semibold">Speaker Voice</label>
            <select
              value={voice.voiceId || 'shubh'}
              onChange={(e) => handleVoiceChange('voiceId', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
            >
              {voiceOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-700 mb-1.5 font-semibold">Speaker Gender Override</label>
            <select
              value={voice.gender || ''}
              onChange={(e) => handleVoiceChange('gender', e.target.value || undefined)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
            >
              <option value="">Auto (Derived from Voice ID)</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <div className="flex justify-between text-gray-700 mb-1 font-semibold">
              <span>Speaking Speed</span>
              <span className="font-mono text-gray-900">{voice.speakingSpeed || 1.0}x</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.5"
              step="0.05"
              value={voice.speakingSpeed || 1.0}
              onChange={(e) => handleVoiceChange('speakingSpeed', parseFloat(e.target.value))}
              className="w-full accent-black cursor-pointer"
            />
          </div>
          <div>
            <div className="flex justify-between text-gray-700 mb-1 font-semibold">
              <span>Model Temperature</span>
              <span className="font-mono text-gray-900">{runtime.modelTemperature || 0.7}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={runtime.modelTemperature || 0.7}
              onChange={(e) => handleRuntimeChange('modelTemperature', parseFloat(e.target.value))}
              className="w-full accent-black cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Listening & Interruptions */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-4">
        <h4 className="font-semibold text-gray-900 text-sm border-b border-gray-100 pb-2.5">Listening & Barge-in</h4>
        <div className="flex items-center justify-between">
          <div>
            <span className="block text-gray-900 font-semibold text-xs">Allow Caller Interruptions (Barge-in)</span>
            <span className="text-gray-500 text-[11px]">Stop speaking immediately when caller speaks mid-response</span>
          </div>
          <input
            type="checkbox"
            checked={runtime.allowCallerInterruptions !== false}
            onChange={(e) => handleRuntimeChange('allowCallerInterruptions', e.target.checked)}
            className="w-4 h-4 rounded text-black focus:ring-0 cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-gray-700 mb-1.5 font-semibold">Eagerness to Respond</label>
            <select
              value={runtime.eagernessToRespond || 'medium'}
              onChange={(e) => handleRuntimeChange('eagernessToRespond', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
            >
              <option value="low">Low (Wait longer for pause)</option>
              <option value="medium">Medium (Standard 500ms)</option>
              <option value="high">High (Sub-second response)</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-700 mb-1.5 font-semibold">Background Sound Profile</label>
            <select
              value={runtime.backgroundSound || 'none'}
              onChange={(e) => handleRuntimeChange('backgroundSound', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
            >
              <option value="none">None (Silent / Studio)</option>
              <option value="office">Office Environment</option>
              <option value="clinic">Clinic / Hospital Ambient</option>
              <option value="call_center">Call Center Ambient</option>
            </select>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-4">
        <h4 className="font-semibold text-gray-900 text-sm border-b border-gray-100 pb-2.5">Language & Switching</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-700 mb-1.5 font-semibold">Primary Spoken Language</label>
            <select
              value={lang.primary || 'en-IN'}
              onChange={(e) => handleLanguageChange('primary', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi (हिंदी)</option>
              <option value="ta-IN">Tamil (தமிழ்)</option>
              <option value="te-IN">Telugu (తెలుగు)</option>
              <option value="bn-IN">Bengali (বাংলা)</option>
              <option value="mr-IN">Marathi (मराठी)</option>
            </select>
          </div>
          <div className="flex items-center justify-between pt-4">
            <div>
              <span className="block text-gray-900 font-semibold text-xs">Auto-Detect Language Switching</span>
              <span className="text-gray-500 text-[11px]">Switch language dynamically if caller switches</span>
            </div>
            <input
              type="checkbox"
              checked={lang.languageSwitchEnabled !== false}
              onChange={(e) => handleLanguageChange('languageSwitchEnabled', e.target.checked)}
              className="w-4 h-4 rounded text-black focus:ring-0 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* In-Call Actions & Nudges */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-4">
        <h4 className="font-semibold text-gray-900 text-sm border-b border-gray-100 pb-2.5">In-Call Nudges for Quiet Callers</h4>
        <div className="flex items-center justify-between">
          <div>
            <span className="block text-gray-900 font-semibold text-xs">Enable Quiet Caller Nudges</span>
            <span className="text-gray-500 text-[11px]">Speak gentle reminder if caller stays silent</span>
          </div>
          <input
            type="checkbox"
            checked={runtime.nudges?.enabled !== false}
            onChange={(e) => handleRuntimeChange('nudges', { ...runtime.nudges, enabled: e.target.checked })}
            className="w-4 h-4 rounded text-black focus:ring-0 cursor-pointer"
          />
        </div>

        {runtime.nudges?.enabled !== false && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-gray-700 mb-1.5 font-semibold">Nudge Delay (Seconds)</label>
              <input
                type="number"
                value={runtime.nudges?.delaySeconds || 7}
                onChange={(e) => handleRuntimeChange('nudges', { ...runtime.nudges, delaySeconds: parseInt(e.target.value) || 7 })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-1.5 font-semibold">Max Call Length (Seconds)</label>
              <input
                type="number"
                value={runtime.maxCallLengthSeconds || 300}
                onChange={(e) => handleRuntimeChange('maxCallLengthSeconds', parseInt(e.target.value) || 300)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
