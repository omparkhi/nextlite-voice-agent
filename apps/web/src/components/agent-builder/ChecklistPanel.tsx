import { useState } from 'react';
import type { AgentChecklistResult } from '../../types';

interface ChecklistPanelProps {
  checklist: AgentChecklistResult | null;
  onProposeConfig: (message: string) => Promise<void>;
  proposing: boolean;
}

export function ChecklistPanel({ checklist, onProposeConfig, proposing }: ChecklistPanelProps) {
  const [userPrompt, setUserPrompt] = useState('');

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userPrompt.trim() || proposing) return;
    const msg = userPrompt.trim();
    setUserPrompt('');
    await onProposeConfig(msg);
  };

  const percentage = checklist?.completenessPercentage || 0;

  return (
    <div className="w-80 border-l border-gray-200 bg-[#fafafa] flex flex-col h-full overflow-hidden text-xs">
      {/* Assistant Header */}
      <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="font-semibold text-gray-900 text-sm">✨ Agent Assistant</h3>
        </div>
        <span className="text-[10px] text-gray-600 font-mono font-semibold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200">
          Genie AI
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Readiness Bar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-700 text-xs">Agent Readiness</span>
            <span className="font-mono text-sm font-bold text-gray-900">{percentage}%</span>
          </div>

          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                percentage >= 80 ? 'bg-emerald-500' : percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          <div className="grid grid-cols-3 text-center gap-1.5 pt-1 text-[11px]">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
              <div>{checklist?.passedCount || 0}</div>
              <div className="text-[9px] text-emerald-600 uppercase tracking-wider">PASSED</div>
            </div>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700 font-semibold border border-amber-100">
              <div>{checklist?.warningsCount || 0}</div>
              <div className="text-[9px] text-amber-600 uppercase tracking-wider">WARNINGS</div>
            </div>
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-700 font-semibold border border-rose-100">
              <div>{checklist?.criticalErrorsCount || 0}</div>
              <div className="text-[9px] text-rose-600 uppercase tracking-wider">CRITICAL</div>
            </div>
          </div>
        </div>

        {/* Setup Checklist Items */}
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-500 text-[11px] tracking-wider uppercase">Setup Checklist</h4>
          {checklist?.items && checklist.items.length > 0 ? (
            <div className="space-y-1.5">
              {checklist.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-gray-200/80 shadow-2xs hover:border-gray-300 transition-colors"
                >
                  <span className="mt-0.5 text-sm">
                    {item.status === 'PASSED' ? (
                      <span className="text-emerald-600 font-bold">✓</span>
                    ) : item.status === 'WARNING' ? (
                      <span className="text-amber-500 font-bold">⚠</span>
                    ) : (
                      <span className="text-rose-500 font-bold">✕</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-xs">{item.label}</div>
                    <div className="text-[11px] text-gray-500 truncate">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 text-xs py-3 text-center">Evaluating setup checklist...</div>
          )}
        </div>
      </div>

      {/* Assistant Prompt Input Box */}
      <div className="p-3.5 border-t border-gray-200 bg-white shadow-lg">
        <form onSubmit={handleSendPrompt} className="space-y-2">
          <label className="block text-[11px] text-gray-500 font-medium">Ask Genie to modify agent...</label>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 focus-within:border-gray-400 focus-within:bg-white transition-colors">
            <input
              type="text"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              disabled={proposing}
              placeholder="e.g. Make greeting more conversational..."
              className="flex-1 bg-transparent text-xs text-gray-900 placeholder-gray-400 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!userPrompt.trim() || proposing}
              className="w-7 h-7 rounded-full bg-black text-white hover:bg-gray-800 disabled:opacity-30 transition-colors flex items-center justify-center shrink-0 font-bold text-xs"
            >
              {proposing ? '…' : '↑'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
