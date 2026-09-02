export type UserRole = 'ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER';

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  correlationId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: UserRole;
  tenantId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}
