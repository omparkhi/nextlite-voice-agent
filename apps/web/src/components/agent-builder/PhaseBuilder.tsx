import { useState } from 'react';
import type { ConversationPhase } from '../../types';

interface PhaseBuilderProps {
  phases: ConversationPhase[];
  onChange: (updatedPhases: ConversationPhase[]) => void;
}

export function PhaseBuilder({ phases, onChange }: PhaseBuilderProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAddPhase = () => {
    const newPhase: ConversationPhase = {
      id: `phase-${Date.now()}`,
      name: `Phase ${phases.length + 1}`,
      objective: '',
      instructions: [''],
      requiredInformation: [],
    };
    onChange([...phases, newPhase]);
    setEditingIndex(phases.length);
  };

  const handleRemovePhase = (index: number) => {
    const updated = phases.filter((_, i) => i !== index);
    onChange(updated);
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleMovePhase = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === phases.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...phases];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    onChange(updated);
    setEditingIndex(targetIndex);
  };

  const handleUpdatePhase = (index: number, field: keyof ConversationPhase, value: any) => {
    const updated = phases.map((p, i) => (i === index ? { ...p, [field]: value } : p));
    onChange(updated);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Conversation Flow & Phases</h3>
          <p className="text-xs text-gray-500">Define step-by-step conversation stages and objectives</p>
        </div>
        <button
          type="button"
          onClick={handleAddPhase}
          className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-900 hover:bg-black text-white transition-colors flex items-center gap-1.5 shadow-2xs"
        >
          <span>+ Add Phase</span>
        </button>
      </div>

      {phases.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-xs bg-gray-50/50">
          No conversation phases configured. Click "+ Add Phase" to define interaction steps.
        </div>
      ) : (
        <div className="space-y-3">
          {phases.map((phase, idx) => {
            const isEditing = editingIndex === idx;
            return (
              <div key={phase.id || idx} className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-4 hover:border-gray-300 transition-all space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center border border-gray-200">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={phase.name}
                      onChange={(e) => handleUpdatePhase(idx, 'name', e.target.value)}
                      placeholder="Phase Name (e.g. Opening & Intent)"
                      className="bg-transparent text-sm font-semibold text-gray-900 focus:outline-none border-b border-transparent focus:border-gray-400 px-1 py-0.5"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleMovePhase(idx, 'up')}
                      disabled={idx === 0}
                      className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold disabled:opacity-30 flex items-center justify-center"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMovePhase(idx, 'down')}
                      disabled={idx === phases.length - 1}
                      className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold disabled:opacity-30 flex items-center justify-center"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIndex(isEditing ? null : idx)}
                      className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
                    >
                      {isEditing ? 'Collapse' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePhase(idx)}
                      className="px-2.5 py-1 text-xs rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-3 pt-1 text-xs">
                    <div>
                      <label className="block text-gray-600 font-medium mb-1">Objective</label>
                      <input
                        type="text"
                        value={phase.objective || ''}
                        onChange={(e) => handleUpdatePhase(idx, 'objective', e.target.value)}
                        placeholder="What should be accomplished in this phase?"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 font-medium mb-1">Instructions (comma-separated)</label>
                      <input
                        type="text"
                        value={(phase.instructions || []).join(', ')}
                        onChange={(e) =>
                          handleUpdatePhase(
                            idx,
                            'instructions',
                            e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                          )
                        }
                        placeholder="Listen for caller query, provide pricing details..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 font-medium mb-1">Required Information (comma-separated)</label>
                      <input
                        type="text"
                        value={(phase.requiredInformation || []).join(', ')}
                        onChange={(e) =>
                          handleUpdatePhase(
                            idx,
                            'requiredInformation',
                            e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                          )
                        }
                        placeholder="exam_target, student_class, budget"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 space-y-1">
                    {phase.objective && (
                      <p>
                        <strong className="text-gray-900">Objective:</strong> {phase.objective}
                      </p>
                    )}
                    {phase.instructions && phase.instructions.length > 0 && (
                      <p>
                        <strong className="text-gray-900">Instructions:</strong> {phase.instructions.join('; ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
