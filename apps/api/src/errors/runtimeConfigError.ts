export type RuntimeConfigErrorCode =
  | 'RUNTIME_CONFIG_DEPLOYMENT_NOT_FOUND'
  | 'RUNTIME_CONFIG_DEPLOYMENT_INACTIVE'
  | 'RUNTIME_CONFIG_AGENT_INVALID'
  | 'RUNTIME_CONFIG_VERSION_INVALID'
  | 'RUNTIME_CONFIG_CONFIG_INVALID';

export class RuntimeConfigError extends Error {
  public readonly code: RuntimeConfigErrorCode;

  constructor(code: RuntimeConfigErrorCode, message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
    this.code = code;
    Object.setPrototypeOf(this, RuntimeConfigError.prototype);
  }
}
