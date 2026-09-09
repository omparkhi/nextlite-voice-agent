import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { AgentConfiguration, ToolCatalogItem } from '../../types';

interface ToolsManagerProps {
  configuration: AgentConfiguration;
  onChange: (updated: Partial<AgentConfiguration>) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Knowledge: 'bg-blue-50 text-blue-700 border-blue-200',
  Leads: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Scheduling: 'bg-purple-50 text-purple-700 border-purple-200',
  Actions: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function ToolsManager({ configuration, onChange }: ToolsManagerProps) {
  const [catalog, setCatalog] = useState<ToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Toggle individual tool binding
  const handleToolToggle = (item: ToolCatalogItem, enable: boolean) => {
    const existingIndex = currentBindings.findIndex(
      (b) => b.toolId === item.toolId || b.name === item.name,
    );

    let updatedBindings: typeof currentBindings;

    if (existingIndex >= 0) {
      // Existing binding: update enabled state while preserving custom metadata & future properties
      const existing = currentBindings[existingIndex];
      const updatedBinding = {
        ...existing,
        enabled: enable,
      };
      updatedBindings = [
        ...currentBindings.slice(0, existingIndex),
        updatedBinding,
        ...currentBindings.slice(existingIndex + 1),
      ];
    } else {
      // Unconfigured tool: create a new binding if enabled
      if (enable) {
        const newBinding = {
          toolId: item.toolId,
          name: item.name,
          description: item.description,
          enabled: true,
          confirmationRequired: item.confirmationSupported ? false : undefined,
        };
        updatedBindings = [...currentBindings, newBinding];
      } else {
        // If not configured and turning off, do not add unnecessary disabled binding
        updatedBindings = currentBindings;
      }
    }

    onChange({
      tools: {
        ...toolsConfig,
        enabled: isMasterEnabled,
        bindings: updatedBindings,
      },
    });
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
            Configure native platform tools and realtime action capabilities for this agent.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200">
          <span>Active Tools:</span>
          <span className="font-mono font-bold text-gray-900">
            {isMasterEnabled ? enabledBindingsCount : 0}
          </span>
          <span className="text-gray-400">/</span>
          <span className="font-mono text-gray-600">{catalog.length}</span>
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

      {/* Tools Catalog List */}
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900 text-sm">Platform Tools Catalog</h4>

        {catalog.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-200 text-gray-500">
            No platform tools found in catalog.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {catalog.map((item) => {
              const existing = currentBindings.find(
                (b) => b.toolId === item.toolId || b.name === item.name,
              );
              const isToolEnabled = existing ? existing.enabled : false;
              const categoryColor =
                CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700 border-gray-200';

              return (
                <div
                  key={item.toolId}
                  className={`bg-white rounded-2xl border transition-all p-5 shadow-2xs space-y-3 ${
                    isToolEnabled && isMasterEnabled
                      ? 'border-emerald-200 ring-1 ring-emerald-200/50'
                      : isToolEnabled
                        ? 'border-gray-300'
                        : 'border-gray-200 opacity-90'
                  }`}
                >
                  {/* Top Row: Title, Badges, Toggle */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="font-semibold text-gray-900 text-sm">{item.displayName}</h5>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${categoryColor}`}
                        >
                          {item.category}
                        </span>
                        <span className="font-mono text-[10px] text-gray-500 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200">
                          {item.toolId}
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs leading-relaxed">{item.description}</p>
                    </div>

                    {/* Individual Toggle Switch */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-semibold ${
                          isToolEnabled ? 'text-emerald-700' : 'text-gray-400'
                        }`}
                      >
                        {isToolEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isToolEnabled}
                          onChange={(e) => handleToolToggle(item, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
                      </label>
                    </div>
                  </div>

                  {/* Parameters Overview */}
                  {item.parameters && item.parameters.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                        Accepted Parameters
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.parameters.map((param) => (
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
    </div>
  );
}
