import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { AgentConfiguration, ToolCatalogItem } from '../../types';

interface ToolsManagerProps {
  configuration: AgentConfiguration;
  onChange: (updated: Partial<AgentConfiguration>) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Knowledge: 'bg-blue-50 text-blue-700 border-blue-200',
  CRM: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Scheduling: 'bg-purple-50 text-purple-700 border-purple-200',
  Actions: 'bg-amber-50 text-amber-700 border-amber-200',
  Leads: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Telephony: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function ToolsManager({ configuration, onChange }: ToolsManagerProps) {
  const [catalog, setCatalog] = useState<ToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadCatalog = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getToolCatalog();
        if (isMounted) {
          setCatalog(data || []);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load platform tool catalog');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  const toolsConfig = configuration.tools || { enabled: false, bindings: [] };
  const isMasterEnabled = toolsConfig.enabled ?? false;
  const currentBindings = toolsConfig.bindings || [];

  // Toggle master tool system switch
  const handleMasterToggle = (enabled: boolean) => {
    onChange({
      tools: {
        ...toolsConfig,
        enabled,
        bindings: currentBindings,
      },
    });
  };

  // Toggle individual bound tool
  const handleToggleBinding = (toolId: string, enabled: boolean) => {
    const updatedBindings = currentBindings.map((b) => {
      if (b.toolId === toolId || b.name === toolId) {
        return { ...b, enabled };
      }
      return b;
    });

    onChange({
      tools: {
        ...toolsConfig,
        enabled: isMasterEnabled,
        bindings: updatedBindings,
      },
    });
  };

  const handleDirectResponseToggle = (toolId: string, directResponseEnabled: boolean) => {
    const updatedBindings = currentBindings.map((binding) => {
      if (binding.toolId === toolId || binding.name === toolId) {
        return { ...binding, directResponseEnabled };
      }
      return binding;
    });

    onChange({
      tools: {
        ...toolsConfig,
        enabled: isMasterEnabled,
        bindings: updatedBindings,
      },
    });
  };

  // Remove/Unbind a tool from the agent
  const handleRemoveBinding = (toolId: string) => {
    const updatedBindings = currentBindings.filter(
      (b) => b.toolId !== toolId && b.name !== toolId,
    );

    onChange({
      tools: {
        ...toolsConfig,
        enabled: isMasterEnabled,
        bindings: updatedBindings,
      },
    });
  };

  // Add a new tool binding to the agent (with duplicate protection)
  const handleAddToolBinding = (item: ToolCatalogItem) => {
    const isAlreadyBound = currentBindings.some(
      (b) => b.toolId === item.toolId || b.name === item.name || b.toolId === item.id,
    );

    if (isAlreadyBound) {
      return; // Duplicate protection
    }

    const newBinding = {
      toolId: item.toolId || item.id || item.name,
      name: item.name,
      description: item.description,
      enabled: true,
      confirmationRequired: item.confirmationSupported ? false : undefined,
    };

    onChange({
      tools: {
        ...toolsConfig,
        enabled: isMasterEnabled,
        bindings: [...currentBindings, newBinding],
      },
    });

    setIsAddModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 text-xs font-medium">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
          <span>Loading platform tools catalog...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
        <div className="font-semibold flex items-center gap-1.5">
          <span>⚠️</span>
          <span>Failed to load tools catalog</span>
        </div>
        <p>{error}</p>
      </div>
    );
  }

  const enabledBindingsCount = currentBindings.filter((b) => b.enabled).length;

  return (
    <div className="space-y-6 text-xs">
      {/* Header */}
      <div className="border-b border-gray-200 pb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-0.5">Tools & Integrations</h3>
          <p className="text-gray-500">
            Configure the actions and capabilities available to this agent.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200">
            <span>Active Tools:</span>
            <span className="font-mono font-bold text-gray-900">
              {isMasterEnabled ? enabledBindingsCount : 0}
            </span>
            <span className="text-gray-400">/</span>
            <span className="font-mono text-gray-600">{currentBindings.length}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition shadow-xs cursor-pointer text-xs"
          >
            <span>+</span>
            <span>Add Tool</span>
          </button>
        </div>
      </div>

      {/* Master Switch Banner */}
      <div
        className={`p-5 rounded-2xl border transition-colors flex items-center justify-between shadow-2xs ${
          isMasterEnabled
            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
            : 'bg-gray-50 border-gray-200 text-gray-700'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{isMasterEnabled ? '⚡' : '💤'}</span>
            <h4 className="font-semibold text-sm">
              {isMasterEnabled ? 'Tool Execution Active' : 'Tool Execution Disabled'}
            </h4>
          </div>
          <p className="text-[11px] opacity-80">
            {isMasterEnabled
              ? 'Agent is authorized to invoke configured active tools during live call sessions.'
              : 'Tool execution subsystem is disabled. No tool calls will be made regardless of individual bindings.'}
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isMasterEnabled}
            onChange={(e) => handleMasterToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
        </label>
      </div>

      {/* Enabled Agent Tools List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-900 text-sm">Enabled Tools</h4>
          <span className="text-gray-400 text-[11px]">
            {currentBindings.length} {currentBindings.length === 1 ? 'tool' : 'tools'} bound
          </span>
        </div>

        {currentBindings.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-gray-500 space-y-3">
            <div className="text-2xl">🛠️</div>
            <div className="space-y-1">
              <p className="font-medium text-gray-800 text-xs">No tools configured for this agent yet</p>
              <p className="text-[11px] text-gray-500">
                Click "Add Tool" to enable platform capabilities like Knowledge Retrieval, Booking, or Lead Capture.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition shadow-2xs text-xs cursor-pointer"
            >
              <span>+</span>
              <span>Add Platform Tool</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {currentBindings.map((binding) => {
              const catalogItem = catalog.find(
                (c) => c.toolId === binding.toolId || c.name === binding.name || c.id === binding.toolId,
              );
              const displayName = catalogItem?.displayName || binding.name || binding.toolId;
              const category = catalogItem?.category || 'Actions';
              const description = binding.description || catalogItem?.description || 'Custom agent tool';
              const categoryColor = CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-700 border-gray-200';
              const isToolEnabled = binding.enabled;
              const supportsDirectResponse = binding.toolId === 'book_appointment';

              return (
                <div
                  key={binding.toolId}
                  className={`bg-white rounded-2xl border transition-all p-5 shadow-2xs space-y-3 ${
                    isToolEnabled && isMasterEnabled
                      ? 'border-emerald-200 ring-1 ring-emerald-200/50'
                      : isToolEnabled
                        ? 'border-gray-300'
                        : 'border-gray-200 opacity-80 bg-gray-50/50'
                  }`}
                >
                  {/* Top Row: Title, Badges, Toggle & Actions */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="font-semibold text-gray-900 text-sm">{displayName}</h5>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${categoryColor}`}>
                          {category}
                        </span>
                        <span className="font-mono text-[10px] text-gray-500 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200">
                          {binding.toolId}
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs leading-relaxed">{description}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Individual Toggle Switch */}
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold ${isToolEnabled ? 'text-emerald-700' : 'text-gray-400'}`}>
                          {isToolEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isToolEnabled}
                            onChange={(e) => handleToggleBinding(binding.toolId, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
                        </label>
                      </div>

                      {/* Remove / Unbind Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveBinding(binding.toolId)}
                        title="Remove tool from agent"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {supportsDirectResponse && (
                    <label className="flex items-start gap-2.5 pt-2 border-t border-gray-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={binding.directResponseEnabled === true}
                        disabled={!isToolEnabled || !isMasterEnabled}
                        onChange={(e) => handleDirectResponseToggle(binding.toolId, e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                      />
                      <span className="text-[11px] leading-relaxed text-gray-600">
                        Fast server-confirmed response — skips the second LLM call. Enable only after the exact
                        appointment-request wording has been approved for this client and language.
                      </span>
                    </label>
                  )}

                  {/* Accepted Parameters */}
                  {catalogItem?.parameters && catalogItem.parameters.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                        Accepted Parameters
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {catalogItem.parameters.map((param) => (
                          <div
                            key={param.name}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200/80 text-[11px]"
                            title={param.description}
                          >
                            <span className="font-mono font-medium text-gray-800">{param.name}</span>
                            <span className="text-[10px] text-gray-400">({param.type})</span>
                            {param.required && (
                              <span className="text-[9px] font-bold text-rose-600 uppercase">
                                Req
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Tool Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-base font-semibold text-gray-900">Add Platform Tool</h4>
                <p className="text-xs text-gray-500">Select an available tool to bind to this agent.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
              {catalog.map((item) => {
                const isAlreadyBound = currentBindings.some(
                  (b) => b.toolId === item.toolId || b.name === item.name || b.toolId === item.id,
                );
                const categoryColor = CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700 border-gray-200';

                return (
                  <div
                    key={item.toolId || item.id}
                    className={`p-4 rounded-2xl border transition flex items-start justify-between gap-3 ${
                      isAlreadyBound ? 'bg-gray-50/70 border-gray-200 opacity-60' : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-xs">{item.displayName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${categoryColor}`}>
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-relaxed">{item.description}</p>
                    </div>

                    <button
                      type="button"
                      disabled={isAlreadyBound}
                      onClick={() => handleAddToolBinding(item)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition cursor-pointer ${
                        isAlreadyBound
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                      }`}
                    >
                      {isAlreadyBound ? 'Added' : '+ Add'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
