import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { AgentConfiguration } from '../../types';

interface PromptPreviewModalProps {
  clientId: string;
  agentId: string;
  configuration: AgentConfiguration;
  onClose: () => void;
}

export function PromptPreviewModal({ clientId, agentId, configuration, onClose }: PromptPreviewModalProps) {
  const [compiledPrompt, setCompiledPrompt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    api.compilePrompt(clientId, agentId, configuration)
      .then((res) => {
        setCompiledPrompt(res.compiledPrompt);
      })
      .catch(() => {
        setCompiledPrompt('Failed to compile prompt preview.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clientId, agentId, configuration]);

  const handleCopy = () => {
    navigator.clipboard.writeText(compiledPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-900 font-mono text-sm font-bold">🔍 Prompt Compiler Preview</span>
            <span className="text-xs text-gray-500 font-mono">(Canonical Compiled Instructions)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-900 hover:bg-black text-white transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy Prompt'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-900 text-lg font-bold px-2"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto font-mono text-xs text-gray-800 whitespace-pre-wrap leading-relaxed selection:bg-gray-200 bg-white">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              Compiling system prompt...
            </div>
          ) : (
            compiledPrompt
          )}
        </div>

        <div className="p-3 border-t border-gray-200 bg-gray-50 text-[11px] text-gray-500 flex justify-between">
          <span>Layer A Core Runtime Rules non-negotiably prepended</span>
          <span>Deterministic Compilation Order v4.5</span>
        </div>
      </div>
    </div>
  );
}
