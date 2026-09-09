import type { AgentConfiguration } from './template';

export interface ChecklistItem {
  id: string;
  category: 'Identity' | 'Persona' | 'Objectives' | 'Conversation' | 'Guardrails' | 'Language' | 'Voice' | 'Variables' | 'Knowledge' | 'Tools';
  label: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  message: string;
}

export interface AgentChecklistResult {
  completenessPercentage: number;
  canPublish: boolean;
  criticalErrorsCount: number;
  warningsCount: number;
  passedCount: number;
  items: ChecklistItem[];
}

export class AgentChecklistService {
  evaluateAgent(config: AgentConfiguration): AgentChecklistResult {
    const items: ChecklistItem[] = [];

    // 1. Identity Check
    const agentName = config.identity?.displayName || config.identity?.agentName || (config.identity as any)?.name;
    if (agentName) {
      items.push({ id: 'identity-name', category: 'Identity', label: 'Agent Identity', status: 'PASSED', message: `Agent named "${agentName}".` });
    } else {
      items.push({ id: 'identity-name', category: 'Identity', label: 'Agent Identity', status: 'FAILED', message: 'Agent display name or agent name is missing.' });
    }

    // 2. Greeting Check
    if (config.identity?.greeting && config.identity.greeting.trim().length > 0) {
      items.push({ id: 'identity-greeting', category: 'Identity', label: 'Initial Greeting', status: 'PASSED', message: 'Greeting message configured.' });
    } else {
      items.push({ id: 'identity-greeting', category: 'Identity', label: 'Initial Greeting', status: 'FAILED', message: 'Greeting message is missing.' });
    }

    // 3. Persona Check
    const role = config.persona?.role || (config as any)?.role?.description;
    if (role) {
      items.push({ id: 'persona-role', category: 'Persona', label: 'Persona & Role', status: 'PASSED', message: `Role defined as "${role}".` });
    } else {
      items.push({ id: 'persona-role', category: 'Persona', label: 'Persona & Role', status: 'WARNING', message: 'Persona role is not explicitly specified.' });
    }

    // 4. Objective Check
    const primaryObjective = config.objective?.primaryObjective || (config as any)?.goal?.primaryObjective;
    if (primaryObjective) {
      items.push({ id: 'objective-primary', category: 'Objectives', label: 'Primary Objective', status: 'PASSED', message: 'Primary objective configured.' });
    } else {
      items.push({ id: 'objective-primary', category: 'Objectives', label: 'Primary Objective', status: 'FAILED', message: 'Primary objective is required.' });
    }

    // 5. Conversation Phases Check
    if (config.conversation?.phases && config.conversation.phases.length > 0) {
      items.push({ id: 'conversation-phases', category: 'Conversation', label: 'Conversation Phases', status: 'PASSED', message: `${config.conversation.phases.length} conversation phases configured.` });
    } else {
      items.push({ id: 'conversation-phases', category: 'Conversation', label: 'Conversation Phases', status: 'WARNING', message: 'No conversation phases configured.' });
    }

    // 6. Guardrails Check
    if (config.guardrails && ((config.guardrails.prohibitedTopics?.length ?? 0) > 0 || (config.guardrails.escalationRules?.length ?? 0) > 0)) {
      items.push({ id: 'guardrails-rules', category: 'Guardrails', label: 'Safety Guardrails', status: 'PASSED', message: 'Guardrail & escalation rules configured.' });
    } else {
      items.push({ id: 'guardrails-rules', category: 'Guardrails', label: 'Safety Guardrails', status: 'WARNING', message: 'No explicit guardrail or escalation rules defined.' });
    }

    // 7. Language Check
    if (config.language?.primary) {
      items.push({ id: 'language-primary', category: 'Language', label: 'Language Configuration', status: 'PASSED', message: `Primary language: ${config.language.primary}.` });
    } else {
      items.push({ id: 'language-primary', category: 'Language', label: 'Language Configuration', status: 'FAILED', message: 'Primary language is required.' });
    }

    // 8. Voice Check
    if (config.voice?.voiceId) {
      items.push({ id: 'voice-config', category: 'Voice', label: 'Voice Selection', status: 'PASSED', message: `Voice selected: ${config.voice.voiceId}.` });
    } else {
      items.push({ id: 'voice-config', category: 'Voice', label: 'Voice Selection', status: 'FAILED', message: 'Voice ID is missing.' });
    }

    // 9. Input Variables Check
    if (config.variables?.input && config.variables.input.length > 0) {
      items.push({ id: 'variables-input', category: 'Variables', label: 'Input Variables', status: 'PASSED', message: `${config.variables.input.length} input variables defined.` });
    } else {
      items.push({ id: 'variables-input', category: 'Variables', label: 'Input Variables', status: 'WARNING', message: 'No input variables defined.' });
    }

    // 10. Knowledge Check
    if (config.knowledge?.attachedSourceIds && config.knowledge.attachedSourceIds.length > 0) {
      items.push({ id: 'knowledge-sources', category: 'Knowledge', label: 'Attached Knowledge', status: 'PASSED', message: `${config.knowledge.attachedSourceIds.length} knowledge sources attached.` });
    } else {
      items.push({ id: 'knowledge-sources', category: 'Knowledge', label: 'Attached Knowledge', status: 'WARNING', message: 'No knowledge sources attached.' });
    }

    const failed = items.filter(i => i.status === 'FAILED');
    const warnings = items.filter(i => i.status === 'WARNING');
    const passed = items.filter(i => i.status === 'PASSED');

    const total = items.length;
    const completenessPercentage = Math.round(((passed.length + warnings.length * 0.5) / total) * 100);

    return {
      completenessPercentage,
      canPublish: failed.length === 0,
      criticalErrorsCount: failed.length,
      warningsCount: warnings.length,
      passedCount: passed.length,
      items,
    };
  }
}

export const agentChecklistService = new AgentChecklistService();
