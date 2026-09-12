import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react';
import type { InputVariable } from '../../types';

interface VariableAutocompleteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  availableVariables: InputVariable[];
  placeholder?: string;
  rows?: number;
  className?: string;
  minHeight?: string;
}

const DEFAULT_CORE_VARS: InputVariable[] = [
  { key: 'businessName', label: 'Business Name', type: 'text', required: true },
  { key: 'businessType', label: 'Business Type', type: 'text', required: false },
  { key: 'businessHours', label: 'Business Hours', type: 'text', required: false },
  { key: 'serviceType', label: 'Service Type', type: 'text', required: false },
  { key: 'customerCareNumber', label: 'Customer Care Number', type: 'phone', required: false },
  { key: 'serviceProviderName', label: 'Service Provider Name', type: 'text', required: false },
  { key: 'agentName', label: 'Agent Name', type: 'text', required: true },
];

export function VariableAutocompleteTextarea({
  value,
  onChange,
  availableVariables = [],
  placeholder = '',
  rows = 6,
  className = '',
}: VariableAutocompleteTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState<number>(0);

  // Merge available variables with core variables (deduplicated by key)
  const allVariables = (() => {
    const map = new Map<string, InputVariable>();
    for (const v of DEFAULT_CORE_VARS) {
      map.set(v.key, v);
    }
    for (const v of availableVariables) {
      if (v.key) map.set(v.key, v);
    }
    return Array.from(map.values());
  })();

  // Filter suggestions based on what's typed after '{'
  const filteredSuggestions = allVariables.filter((v) => {
    if (!suggestionQuery) return true;
    const q = suggestionQuery.toLowerCase();
    return (
      v.key.toLowerCase().includes(q) ||
      (v.label && v.label.toLowerCase().includes(q)) ||
      (v.description && v.description.toLowerCase().includes(q))
    );
  });

  const checkTrigger = (text: string, pos: number) => {
    setCursorPos(pos);
    const beforeCursor = text.slice(0, pos);
    const lastOpenBrace = beforeCursor.lastIndexOf('{');

    if (lastOpenBrace !== -1) {
      const segment = beforeCursor.slice(lastOpenBrace + 1);
      // Ensure no closing brace or newline between last '{' and cursor
      if (!segment.includes('}') && !segment.includes('\n')) {
        setSuggestionQuery(segment.replace(/^svg/i, ''));
        setShowSuggestions(true);
        setSelectedIndex(0);
        return;
      }
    }
    setShowSuggestions(false);
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart || 0;
    onChange(val);
    checkTrigger(val, pos);
  };

  const handleSelectVariable = (varKey: string) => {
    if (!textareaRef.current) return;
    const beforeCursor = value.slice(0, cursorPos);
    const afterCursor = value.slice(cursorPos);
    const lastOpenBrace = beforeCursor.lastIndexOf('{');

    if (lastOpenBrace !== -1) {
      const prefix = value.slice(0, lastOpenBrace);
      const inserted = `{${varKey}}`;
      const newValue = prefix + inserted + afterCursor;
      onChange(newValue);
      setShowSuggestions(false);

      // Reset focus and place cursor after inserted variable
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = prefix.length + inserted.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 10);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || filteredSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = filteredSuggestions[selectedIndex];
      if (selected) {
        handleSelectVariable(selected.key);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => checkTrigger(value, (e.target as HTMLTextAreaElement).selectionStart || 0)}
        onKeyUp={(e) => checkTrigger(value, (e.target as HTMLTextAreaElement).selectionStart || 0)}
        placeholder={placeholder}
        className={className}
        spellCheck={false}
      />

      {/* AUTOCOMPLETE SUGGESTIONS POPUP */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute left-4 top-12 z-50 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 py-1.5 overflow-hidden text-xs">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
            <span>Variables</span>
            <span>{filteredSuggestions.length} available</span>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
            {filteredSuggestions.map((v, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => handleSelectVariable(v.key)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3.5 py-2 flex items-center justify-between transition-colors ${
                    isSelected ? 'bg-gray-100/90 text-gray-900' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900 text-xs truncate">
                        {v.label || v.key}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-indigo-600">
                      &#123;{v.key}&#125;
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-gray-100 text-gray-600 border border-gray-200">
                      {v.type || 'text'}
                    </span>
                    {v.defaultValue !== undefined && (
                      <span className="text-[10px] text-gray-400 font-mono truncate max-w-[70px]">
                        {String(v.defaultValue)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="px-3 py-1 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 flex items-center justify-between">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
        </div>
      )}
    </div>
  );
}
