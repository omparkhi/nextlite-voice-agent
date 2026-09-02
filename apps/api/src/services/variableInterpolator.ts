export interface InputVariableDefinition {
  key: string;
  label: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'phone' | 'email' | 'enum';
  required: boolean;
  defaultValue?: any;
  source?: 'STATIC' | 'RUNTIME' | 'CALLER' | 'SYSTEM' | 'INTEGRATION';
  scope?: 'CALL' | 'TENANT' | 'GLOBAL';
  sensitive?: boolean;
}

export interface InterpolationResult {
  interpolatedText: string;
  resolvedVariables: Record<string, any>;
  missingRequiredVariables: string[];
}

export class VariableInterpolator {
  /**
   * Safe deterministic interpolation of {{variableName}} tags in system prompt or greeting text.
   */
  static interpolate(
    text: string,
    variableDefs: InputVariableDefinition[] = [],
    runtimeContext: Record<string, any> = {},
  ): InterpolationResult {
    if (!text) {
      return { interpolatedText: '', resolvedVariables: {}, missingRequiredVariables: [] };
    }

    const defMap = new Map<string, InputVariableDefinition>();
    for (const def of variableDefs) {
      defMap.set(def.key, def);
    }

    const resolvedVariables: Record<string, any> = {};
    const missingRequiredVariables: string[] = [];

    // Replace {{varName}} tags
    const interpolatedText = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, varKey) => {
      const def = defMap.get(varKey);
      let value = runtimeContext[varKey];

      if (value === undefined || value === null || value === '') {
        value = def?.defaultValue;
      }

      if (value !== undefined && value !== null && value !== '') {
        resolvedVariables[varKey] = value;
        return String(value);
      }

      if (def?.required) {
        missingRequiredVariables.push(varKey);
      }

      // If unresolved, leave placeholder intact or return fallback
      return match;
    });

    return {
      interpolatedText,
      resolvedVariables,
      missingRequiredVariables,
    };
  }
}
