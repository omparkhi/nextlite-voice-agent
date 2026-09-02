import { useState } from 'react';
import type { InputVariable, OutputVariable } from '../../types';

interface VariablesManagerProps {
  inputVariables: InputVariable[];
  outputVariables: OutputVariable[];
  onChangeInput: (inputs: InputVariable[]) => void;
  onChangeOutput: (outputs: OutputVariable[]) => void;
}

export function VariablesManager({
  inputVariables = [],
  outputVariables = [],
  onChangeInput,
  onChangeOutput,
}: VariablesManagerProps) {
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('input');
  const [newInputKey, setNewInputKey] = useState('');
  const [newInputLabel, setNewInputLabel] = useState('');
  const [newInputDefault, setNewInputDefault] = useState('');
  const [newInputRequired, setNewInputRequired] = useState(false);

  const [newOutputKey, setNewOutputKey] = useState('');
  const [newOutputLabel, setNewOutputLabel] = useState('');

  const addInput = () => {
    if (!newInputKey.trim()) return;
    const item: InputVariable = {
      key: newInputKey.trim().replace(/\s+/g, '_'),
      label: newInputLabel.trim() || newInputKey.trim(),
      type: 'string',
      required: newInputRequired,
      defaultValue: newInputDefault.trim() || undefined,
      source: 'RUNTIME',
    };
    onChangeInput([...inputVariables, item]);
    setNewInputKey('');
    setNewInputLabel('');
    setNewInputDefault('');
    setNewInputRequired(false);
  };

  const removeInput = (key: string) => {
    onChangeInput(inputVariables.filter((v) => v.key !== key));
  };

  const addOutput = () => {
    if (!newOutputKey.trim()) return;
    const item: OutputVariable = {
      key: newOutputKey.trim().replace(/\s+/g, '_'),
      label: newOutputLabel.trim() || newOutputKey.trim(),
      type: 'string',
      required: false,
      extractionStrategy: 'CALL_END',
    };
    onChangeOutput([...outputVariables, item]);
    setNewOutputKey('');
    setNewOutputLabel('');
  };

  const removeOutput = (key: string) => {
    onChangeOutput(outputVariables.filter((v) => v.key !== key));
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="border-b border-gray-200 pb-3">
        <h3 className="text-lg font-semibold text-gray-900 mb-0.5">Variable System</h3>
        <p className="text-gray-500">Configure runtime Input context tags and Output extraction variables</p>
      </div>

      <div className="flex border-b border-gray-200 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('input')}
          className={`pb-2.5 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'input' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
          }`}
        >
          Input Variables ({inputVariables.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('output')}
          className={`pb-2.5 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'output' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
          }`}
        >
          Output Variables ({outputVariables.length})
        </button>
      </div>

      {activeTab === 'input' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3">
            <h4 className="font-semibold text-gray-900 text-sm">Add Input Variable</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <input
                type="text"
                value={newInputKey}
                onChange={(e) => setNewInputKey(e.target.value)}
                placeholder="Variable Key (e.g. userName)"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
              />
              <input
                type="text"
                value={newInputLabel}
                onChange={(e) => setNewInputLabel(e.target.value)}
                placeholder="Display Label"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
              />
              <input
                type="text"
                value={newInputDefault}
                onChange={(e) => setNewInputDefault(e.target.value)}
                placeholder="Default Fallback"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-gray-600 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={newInputRequired}
                    onChange={(e) => setNewInputRequired(e.target.checked)}
                    className="rounded text-black focus:ring-0"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={addInput}
                  className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-semibold ml-auto"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-semibold">
                  <th className="py-3 px-4">Variable Key</th>
                  <th className="py-3 px-4">Label</th>
                  <th className="py-3 px-4">Tag Syntax</th>
                  <th className="py-3 px-4">Default</th>
                  <th className="py-3 px-4">Required</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inputVariables.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No input variables configured.
                    </td>
                  </tr>
                ) : (
                  inputVariables.map((v) => (
                    <tr key={v.key} className="hover:bg-gray-50/60">
                      <td className="py-3 px-4 font-mono text-amber-700 font-semibold">{v.key}</td>
                      <td className="py-3 px-4 text-gray-800 font-medium">{v.label}</td>
                      <td className="py-3 px-4 font-mono text-gray-500">{`{{${v.key}}}`}</td>
                      <td className="py-3 px-4 text-gray-500">{v.defaultValue || '—'}</td>
                      <td className="py-3 px-4 text-gray-500">{v.required ? 'Yes' : 'No'}</td>
                      <td className="py-3 px-4 text-right">
                        <button type="button" onClick={() => removeInput(v.key)} className="text-rose-600 hover:text-rose-800 font-semibold">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3">
            <h4 className="font-semibold text-gray-900 text-sm">Add Output Variable</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={newOutputKey}
                onChange={(e) => setNewOutputKey(e.target.value)}
                placeholder="Variable Key (e.g. leadStatus)"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
              />
              <input
                type="text"
                value={newOutputLabel}
                onChange={(e) => setNewOutputLabel(e.target.value)}
                placeholder="Display Label"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
              />
              <button
                type="button"
                onClick={addOutput}
                className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-semibold"
              >
                + Add Output Var
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-semibold">
                  <th className="py-3 px-4">Output Key</th>
                  <th className="py-3 px-4">Label</th>
                  <th className="py-3 px-4">Extraction Strategy</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {outputVariables.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400">
                      No output variables configured.
                    </td>
                  </tr>
                ) : (
                  outputVariables.map((v) => (
                    <tr key={v.key} className="hover:bg-gray-50/60">
                      <td className="py-3 px-4 font-mono text-emerald-700 font-semibold">{v.key}</td>
                      <td className="py-3 px-4 text-gray-800 font-medium">{v.label}</td>
                      <td className="py-3 px-4 font-mono text-gray-500">{v.extractionStrategy || 'CALL_END'}</td>
                      <td className="py-3 px-4 text-right">
                        <button type="button" onClick={() => removeOutput(v.key)} className="text-rose-600 hover:text-rose-800 font-semibold">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
