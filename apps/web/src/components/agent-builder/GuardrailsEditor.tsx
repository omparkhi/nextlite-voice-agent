import { useState } from 'react';
import type { AgentConfiguration } from '../../types';

interface GuardrailsEditorProps {
  guardrails: AgentConfiguration['guardrails'];
  onChange: (updatedGuardrails: AgentConfiguration['guardrails']) => void;
}

export function GuardrailsEditor({ guardrails = {}, onChange }: GuardrailsEditorProps) {
  const [newTopic, setNewTopic] = useState('');
  const [newClaim, setNewClaim] = useState('');
  const [newEscalation, setNewEscalation] = useState('');

  const prohibitedTopics = guardrails.prohibitedTopics || [];
  const prohibitedClaims = guardrails.prohibitedClaims || [];
  const escalationRules = guardrails.escalationRules || [];

  const addTopic = () => {
    if (!newTopic.trim()) return;
    onChange({ ...guardrails, prohibitedTopics: [...prohibitedTopics, newTopic.trim()] });
    setNewTopic('');
  };

  const removeTopic = (index: number) => {
    onChange({ ...guardrails, prohibitedTopics: prohibitedTopics.filter((_, i) => i !== index) });
  };

  const addClaim = () => {
    if (!newClaim.trim()) return;
    onChange({ ...guardrails, prohibitedClaims: [...prohibitedClaims, newClaim.trim()] });
    setNewClaim('');
  };

  const removeClaim = (index: number) => {
    onChange({ ...guardrails, prohibitedClaims: prohibitedClaims.filter((_, i) => i !== index) });
  };

  const addEscalation = () => {
    if (!newEscalation.trim()) return;
    onChange({ ...guardrails, escalationRules: [...escalationRules, newEscalation.trim()] });
    setNewEscalation('');
  };

  const removeEscalation = (index: number) => {
    onChange({ ...guardrails, escalationRules: escalationRules.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="border-b border-gray-200 pb-3">
        <h3 className="text-lg font-semibold text-gray-900 mb-0.5">Safety Guardrails & Boundaries</h3>
        <p className="text-gray-500">Configure prohibited topics, unverified claims, and escalation triggers</p>
      </div>

      {/* Prohibited Topics */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3">
        <h4 className="font-semibold text-gray-900 text-sm">Prohibited Topics</h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="e.g. competitor pricing, medical diagnosis"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTopic())}
          />
          <button
            type="button"
            onClick={addTopic}
            className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-semibold"
          >
            + Add Topic
          </button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {prohibitedTopics.map((topic, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
              <span>{topic}</span>
              <button type="button" onClick={() => removeTopic(i)} className="text-rose-500 hover:text-rose-900 font-bold">
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Prohibited Claims */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3">
        <h4 className="font-semibold text-gray-900 text-sm">Prohibited Claims & Promises</h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={newClaim}
            onChange={(e) => setNewClaim(e.target.value)}
            placeholder="e.g. Never guarantee 100% rank selection or instant loan approval"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addClaim())}
          />
          <button
            type="button"
            onClick={addClaim}
            className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-semibold"
          >
            + Add Claim
          </button>
        </div>
        <div className="space-y-2 pt-1">
          {prohibitedClaims.map((claim, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-gray-800 font-medium">{claim}</span>
              <button type="button" onClick={() => removeClaim(i)} className="text-rose-600 hover:text-rose-800 font-semibold">
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Escalation Rules */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-3">
        <h4 className="font-semibold text-gray-900 text-sm">Escalation Triggers</h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={newEscalation}
            onChange={(e) => setNewEscalation(e.target.value)}
            placeholder="e.g. Caller requests manager callback or discount > 50%"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEscalation())}
          />
          <button
            type="button"
            onClick={addEscalation}
            className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white font-semibold"
          >
            + Add Rule
          </button>
        </div>
        <div className="space-y-2 pt-1">
          {escalationRules.map((rule, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-gray-800 font-medium">{rule}</span>
              <button type="button" onClick={() => removeEscalation(i)} className="text-rose-600 hover:text-rose-800 font-semibold">
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Fallback Behavior */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs p-5 space-y-2">
        <label className="block font-semibold text-gray-900 text-sm">Fallback Behavior</label>
        <input
          type="text"
          value={guardrails.fallbackBehavior || ''}
          onChange={(e) => onChange({ ...guardrails, fallbackBehavior: e.target.value })}
          placeholder="e.g. Apologies, let me note your question and request a counselor callback."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-gray-400 focus:bg-white"
        />
      </div>
    </div>
  );
}
