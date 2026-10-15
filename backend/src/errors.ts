export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const unauthorized = (message = 'A valid bearer token is required.') =>
  new ApiError(401, message, 'UNAUTHORIZED');

export const notFound = (message = 'The requested record was not found.') =>
  new ApiError(404, message, 'NOT_FOUND');

export const conflict = (message: string) =>
  new ApiError(409, message, 'EDIT_CONFLICT');
