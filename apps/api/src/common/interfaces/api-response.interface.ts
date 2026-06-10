/**
 * Standard API response envelope.
 * All API endpoints should return responses wrapped in this format.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: ApiError;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Helper to create a successful response.
 */
export function createSuccessResponse<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    meta,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to create an error response.
 */
export function createErrorResponse(code: string, message: string): ApiResponse<null> {
  return {
    success: false,
    data: null,
    error: { code, message },
    timestamp: new Date().toISOString(),
  };
}
