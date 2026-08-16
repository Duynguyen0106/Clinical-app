export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    /** Seconds until the client may retry (429). */
    public retryAfterSec?: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(message = "Not found") {
  return new AppError(404, message, "NOT_FOUND");
}

export function unauthorized(message = "Unauthorized") {
  return new AppError(401, message, "UNAUTHORIZED");
}

export function forbidden(message = "Forbidden") {
  return new AppError(403, message, "FORBIDDEN");
}

export function badRequest(message: string) {
  return new AppError(400, message, "BAD_REQUEST");
}

export function conflict(message: string) {
  return new AppError(409, message, "CONFLICT");
}

export function tooManyRequests(
  message = "Too many requests. Try again shortly.",
  retryAfterSec = 60,
) {
  return new AppError(429, message, "RATE_LIMITED", retryAfterSec);
}
