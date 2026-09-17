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
        <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
          <div>
            <h4 className="font-semibold text-gray-900 text-sm">Languages & Dynamic Switching</h4>
            <p className="text-gray-500 text-[11px] mt-0.5">
              Select all languages the agent is allowed to speak. Callers can switch naturally between active languages.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-900 font-semibold text-xs">Auto-Detect Switching</span>
            <input
              type="checkbox"
              checked={lang.languageSwitchEnabled !== false}
              onChange={(e) => handleLanguageChange('languageSwitchEnabled', e.target.checked)}
              className="w-4 h-4 rounded text-black focus:ring-0 cursor-pointer"
            />
          </div>
        </div>

        {/* Dialect Style Mode: Pure vs Conversational Mixed */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-gray-900 font-semibold text-xs">
              Language Style & Dialect Mode
            </label>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black text-white">
              {lang.languageStyle === 'pure' ? '🗣️ Pure Script' : '💬 Mixed Dialect'}
            </span>
          </div>
          <select
            value={lang.languageStyle || 'mixed'}
            onChange={(e) => handleLanguageChange('languageStyle', e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-xs focus:outline-none focus:border-gray-400 font-medium"
          >
            <option value="mixed">💬 Conversational Mixed (Minglish / Hinglish / English - Recommended for Real-time Calls)</option>
            <option value="pure">🗣️ Pure Native Language (Pure Marathi / Pure Hindi - No English mix)</option>
          </select>
          <p className="text-gray-500 text-[11px]">
            {lang.languageStyle === 'pure' ? (
              <span>Enforces 100% native vocabulary and numbers (e.g. <em>वेळ, तारीख, सतरा सप्टेंबर, नक्की</em>). Prohibits English words like <em>appointment, date, age, slot available, book</em>.</span>
            ) : (
              <span>Uses natural code-mixed Indian dialect (e.g. Marathi/Hindi spoken naturally with common terms like <em>appointment, date, timing, book, confirm</em>).</span>
            )}
          </p>
        </div>

        {/* Multi-Language Selector Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-gray-700 font-semibold text-xs">
              Supported Spoken Languages ({((lang.supported && lang.supported.length > 0) ? lang.supported : [lang.primary || 'hi-IN']).length} Active)
            </label>
            <span className="text-[11px] text-gray-500">
              Primary: <strong className="text-gray-900">{lang.primary || 'hi-IN'}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {[
              { code: 'hi-IN', label: 'Hindi', native: 'हिंदी', badge: 'Hinglish' },
              { code: 'mr-IN', label: 'Marathi', native: 'मराठी', badge: 'Minglish' },
              { code: 'en-IN', label: 'English (India)', native: 'English', badge: 'Indian English' },
              { code: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી', badge: 'Gujlish' },
              { code: 'bn-IN', label: 'Bengali', native: 'বাংলা', badge: 'Bangla' },
              { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்', badge: 'Tanglish' },
              { code: 'te-IN', label: 'Telugu', native: 'తెలుగు', badge: 'Tenglish' },
              { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ', badge: 'Kanglish' },
              { code: 'pa-IN', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', badge: 'Punjabi' },
              { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളം', badge: 'Malayalam' },
              { code: 'or-IN', label: 'Odia', native: 'ଓଡ଼ିଆ', badge: 'Odia' },
            ].map((item) => {
              const currentSupported = (lang.supported && lang.supported.length > 0)
                ? lang.supported
                : [lang.primary || 'hi-IN'];
              const isSelected = currentSupported.includes(item.code) || lang.primary === item.code;
              const isPrimary = (lang.primary || 'hi-IN') === item.code;

              const toggleLanguage = () => {
                let updated = [...currentSupported];
                if (isSelected) {
                  if (isPrimary) {
                    // Cannot unselect primary unless another language is selected
                    const remaining = updated.filter((c) => c !== item.code);
                    if (remaining.length > 0) {
                      const newPrimary = remaining[0];
                      onChange({
                        language: {
                          ...lang,
                          primary: newPrimary,
                          supported: remaining,
                        },
                      });
                    }
                    return;
                  }
                  updated = updated.filter((c) => c !== item.code);
                } else {
                  updated.push(item.code);
                }
                onChange({
                  language: {
                    ...lang,
                    supported: updated,
                  },
                });
              };

              const setAsPrimary = (e: React.MouseEvent) => {
                e.stopPropagation();
                let updated = [...currentSupported];
                if (!updated.includes(item.code)) {
                  updated.push(item.code);
                }
                onChange({
                  language: {
                    ...lang,
                    primary: item.code,
                    supported: updated,
                  },
                });
              };

              return (
                <div
                  key={item.code}
                  onClick={toggleLanguage}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isPrimary
                      ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-300'
                      : isSelected
                      ? 'bg-gray-50 border-gray-300'
                      : 'bg-white border-gray-200 hover:border-gray-300 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={toggleLanguage}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded text-black focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold text-gray-900 block text-xs leading-tight">
                          {item.label}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {item.native} · {item.code}
                        </span>
                      </div>
                    </div>

                    {isPrimary ? (
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold rounded-full text-[10px] tracking-wide uppercase">
                        Primary
                      </span>
                    ) : (
                      isSelected && (
                        <button
                          type="button"
                          onClick={setAsPrimary}
                          className="px-2 py-0.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded text-[10px] font-medium transition-colors"
                          title="Set this as starting primary language"
                        >
                          Set Primary
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
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
