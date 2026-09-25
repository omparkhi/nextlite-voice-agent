import { useState, useMemo } from 'react';
import type { InputVariable } from '../../types';

interface VariablesManagerProps {
  inputVariables: InputVariable[];
  onChangeInput: (inputs: InputVariable[]) => void;
  instructionText?: string;
}

const DEFAULT_CORE_VARIABLES: InputVariable[] = [
  {
    key: 'businessName',
    label: 'Business Name',
    description: 'Name of the business or company',
    type: 'text',
    defaultValue: 'Your Business',
    required: true,
    isCore: true,
  },
  {
    key: 'businessType',
    label: 'Business Type',
    description: 'Category or industry of business',
    type: 'text',
    defaultValue: 'Business',
    required: false,
    isCore: true,
  },
  {
    key: 'businessHours',
    label: 'Business Hours',
    description: 'Operating hours of the business',
    type: 'text',
    defaultValue: 'Your business hours',
    required: false,
    isCore: true,
  },
  {
    key: 'serviceType',
    label: 'Service Type',
    description: 'Primary service offered (e.g. Table Reservation, Appointment, Course Enquiry)',
    type: 'text',
    defaultValue: 'Your service',
    required: false,
    isCore: true,
  },
  {
    key: 'customerCareNumber',
    label: 'Customer Care Number',
    description: 'Customer helpline number',
    type: 'phone',
    defaultValue: 'Your customer care number',
    required: false,
    isCore: true,
  },
  {
    key: 'serviceProviderName',
    label: 'Service Provider Name',
    description: 'Name of the provider, host, doctor, or specialist',
    type: 'text',
    defaultValue: 'Your service provider',
    required: false,
    isCore: true,
  },
  {
    key: 'slotDuration',
    label: 'Appointment Duration',
    description: 'Duration of each appointment slot (e.g. 30 mins, 1 hour)',
    type: 'text',
    defaultValue: '30 mins',
    required: false,
    isCore: true,
  },
  {
    key: 'patientsPerSlot',
    label: 'Patients per Time Slot',
    description: 'Maximum number of appointments/patients allowed per time slot interval (e.g. 1, 3)',
    type: 'number',
    defaultValue: '1',
    required: false,
    isCore: true,
  },
  {
    key: 'agentName',
    label: 'Agent Name',
    description: 'Display name of the voice assistant',
    type: 'text',
    defaultValue: 'AI Assistant',
    required: true,
    isCore: true,
  },
];

const VARIABLE_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'address', label: 'Address' },
  { value: 'time', label: 'Time' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'DateTime' },
  { value: 'list', label: 'List' },
  { value: 'json', label: 'JSON' },
];

function sanitizeKey(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('svg') && s.length > 3) {
    const remainder = s.slice(3);
    if (remainder[0] === remainder[0].toUpperCase()) {
      s = remainder[0].toLowerCase() + remainder.slice(1);
    }
  }
  const words = s.split(/[\s\-_.]+/);
  if (!words[0]) return '';
  const camel = words[0].toLowerCase() + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return camel.replace(/[^a-zA-Z0-9_]/g, '');
}

export function VariablesManager({
  inputVariables = [],
  onChangeInput,
  instructionText = '',
}: VariablesManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVar, setEditingVar] = useState<InputVariable | null>(null);
  const [deletingVar, setDeletingVar] = useState<InputVariable | null>(null);

  // Form state for add/edit modal
  const [formKey, setFormKey] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('text');
  const [formDefault, setFormDefault] = useState('');
  const [formRequired, setFormRequired] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Active variables (combine with default core variables if empty)
  const currentVariables = useMemo(() => {
    if (inputVariables.length > 0) return inputVariables;
    return DEFAULT_CORE_VARIABLES;
  }, [inputVariables]);

  // Filtered variables based on search
  const filteredVariables = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return currentVariables;
    return currentVariables.filter(
      (v) =>
        v.key.toLowerCase().includes(q) ||
        (v.label && v.label.toLowerCase().includes(q)) ||
        (v.description && v.description.toLowerCase().includes(q)) ||
        (v.defaultValue && String(v.defaultValue).toLowerCase().includes(q))
    );
  }, [currentVariables, searchQuery]);

  const openAddModal = () => {
    setFormKey('');
    setFormLabel('');
    setFormDescription('');
    setFormType('text');
    setFormDefault('');
    setFormRequired(false);
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (v: InputVariable) => {
    setEditingVar(v);
    setFormKey(v.key);
    setFormLabel(v.label || v.key);
    setFormDescription(v.description || '');
    setFormType(v.type || 'text');
    setFormDefault(v.defaultValue !== undefined ? String(v.defaultValue) : '');
    setFormRequired(v.required || false);
    setFormError(null);
  };

  const handleSaveAdd = () => {
    const cleanKey = sanitizeKey(formKey);
    if (!cleanKey) {
      setFormError('Variable name must be a valid camelCase identifier (e.g. businessName, courseFee).');
      return;
    }
    if (cleanKey.startsWith('svg') && cleanKey.length > 3) {
      setFormError("'svg' is not allowed as a variable name prefix. Please use a clean name.");
      return;
    }
    if (currentVariables.some((v) => v.key === cleanKey)) {
      setFormError(`A variable with name '${cleanKey}' already exists.`);
      return;
    }

    const newVar: InputVariable = {
      key: cleanKey,
      label: formLabel.trim() || cleanKey,
      description: formDescription.trim() || undefined,
      type: formType,
      defaultValue: formDefault !== '' ? formDefault : undefined,
      required: formRequired,
    };

    onChangeInput([...currentVariables, newVar]);
    setShowAddModal(false);
  };

  const handleSaveEdit = () => {
    if (!editingVar) return;

    const updated = currentVariables.map((v) => {
      if (v.key === editingVar.key) {
        return {
          ...v,
          label: formLabel.trim() || v.key,
          description: formDescription.trim() || undefined,
          type: formType,
          defaultValue: formDefault !== '' ? formDefault : undefined,
          required: formRequired,
        };
      }
      return v;
    });

    onChangeInput(updated);
    setEditingVar(null);
  };

  const confirmDelete = (v: InputVariable) => {
    setDeletingVar(v);
  };

  const executeDelete = () => {
    if (!deletingVar) return;
    onChangeInput(currentVariables.filter((v) => v.key !== deletingVar.key));
    setDeletingVar(null);
  };

  const isReferencedInInstructions = (key: string): boolean => {
    if (!instructionText) return false;
    return instructionText.includes(`{${key}}`) || instructionText.includes(`{{${key}}}`) || instructionText.includes(`svg${key}`);
  };

  return (
    <div className="space-y-5 text-xs">
      {/* TOP CONTROLS (Sarvam Variables Header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-900 font-semibold text-xs border border-gray-200">
            <span>Input variables</span>
            <span className="bg-white px-2 py-0.5 rounded-full text-[11px] text-gray-600 font-mono border border-gray-200">
              {currentVariables.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-1 max-w-md justify-end">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search variables..."
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-1.5 rounded-full bg-black hover:bg-gray-800 text-white font-semibold text-xs flex items-center gap-1 shrink-0 transition-colors shadow-2xs"
          >
            <span>+ Add</span>
          </button>
        </div>
      </div>

      {/* 2-COLUMN VARIABLE TABLE */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/70 text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-5">Variable name</th>
              <th className="py-3 px-5">Default value</th>
              <th className="py-3 px-4 text-right w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredVariables.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-gray-400">
                  {searchQuery ? `No variables matching "${searchQuery}"` : 'No variables defined'}
                </td>
              </tr>
            ) : (
              filteredVariables.map((v) => {
                const referenced = isReferencedInInstructions(v.key);
                return (
                  <tr
                    key={v.key}
                    onClick={() => openEditModal(v)}
                    className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                  >
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-gray-900 text-xs">{v.key}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          {v.type || 'text'}
                        </span>
                        {v.required && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Required
                          </span>
                        )}
                        {referenced && (
                          <span className="text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100" title="Referenced in instructions">
                            In Prompt
                          </span>
                        )}
                      </div>
                      {v.label && v.label !== v.key && (
                        <p className="text-[11px] text-gray-500 mt-0.5">{v.label}</p>
                      )}
                      {v.description && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-md">{v.description}</p>
                      )}
                    </td>

                    <td className="py-3 px-5 font-mono text-gray-700 text-xs">
                      <div className="flex items-center justify-between group/val">
                        {v.defaultValue !== undefined && v.defaultValue !== '' ? (
                          <span className="bg-gray-100 group-hover:bg-white group-hover:border group-hover:border-gray-300 px-2.5 py-1 rounded-md text-gray-800 transition-all">
                            {String(v.defaultValue)}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">No default value (click to set)</span>
                        )}
                        <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity font-sans ml-2">
                          ✏️ Edit
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(v);
                          }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                          title="Edit variable"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(v);
                          }}
                          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          title="Delete variable"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ADD VARIABLE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="font-semibold text-base text-gray-900">Add Input Variable</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-800 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 rounded-xl text-xs font-medium">
                {formError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  Variable Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="e.g. reservationPolicy, courseFee"
                  className="w-full font-mono bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">Must be machine-safe camelCase. Will be referenced as &#123;variableName&#125;.</p>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Display Label</label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="e.g. Reservation Policy"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Policy regarding advance dining bookings"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                  >
                    {VARIABLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">Default Value</label>
                  <input
                    type="text"
                    value={formDefault}
                    onChange={(e) => setFormDefault(e.target.value)}
                    placeholder="Fallback value"
                    className="w-full font-mono bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={formRequired}
                    onChange={(e) => setFormRequired(e.target.checked)}
                    className="rounded text-black focus:ring-0"
                  />
                  <span>Required (must have configured value to publish)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAdd}
                className="px-5 py-2 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold"
              >
                Add Variable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT VARIABLE MODAL */}
      {editingVar && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="font-semibold text-base text-gray-900">
                Edit Variable: <span className="font-mono text-gray-600">{editingVar.key}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingVar(null)}
                className="text-gray-400 hover:text-gray-800 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">Display Label</label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                  >
                    {VARIABLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">Default Value</label>
                  <input
                    type="text"
                    value={formDefault}
                    onChange={(e) => setFormDefault(e.target.value)}
                    className="w-full font-mono bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:bg-white focus:outline-none focus:border-gray-400"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={formRequired}
                    onChange={(e) => setFormRequired(e.target.checked)}
                    className="rounded text-black focus:ring-0"
                  />
                  <span>Required</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setEditingVar(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-5 py-2 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingVar && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold text-base text-gray-900">
              Delete Variable: <span className="font-mono text-rose-600">{deletingVar.key}</span>?
            </h3>

            {isReferencedInInstructions(deletingVar.key) ? (
              <div className="bg-amber-50 text-amber-800 border border-amber-200 p-3 rounded-xl text-xs space-y-1">
                <p className="font-semibold">⚠️ Warning: Variable referenced in Instructions</p>
                <p>
                  This variable is currently used inside the prompt as <code className="bg-amber-100 px-1 rounded font-mono">&#123;{deletingVar.key}&#125;</code>.
                  Deleting it will leave an unresolved placeholder.
                </p>
              </div>
            ) : (
              <p className="text-gray-600 text-xs">
                Are you sure you want to delete this variable? This action cannot be undone.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setDeletingVar(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDelete}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
