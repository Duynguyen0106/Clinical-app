import { clientIp } from "@/server/client-ip";
import { tooManyRequests } from "@/server/errors";
import {
  consumeRateLimit,
  type RateLimitOpts,
} from "@/server/rate-limit";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Shared policy windows — tune per surface. */
export const AbuseLimits = {
  loginIp: { limit: 30, windowMs: 15 * MIN } satisfies RateLimitOpts,
  loginEmail: { limit: 10, windowMs: 15 * MIN } satisfies RateLimitOpts,
  forgotIp: { limit: 10, windowMs: HOUR } satisfies RateLimitOpts,
  forgotEmail: { limit: 5, windowMs: HOUR } satisfies RateLimitOpts,
  resetIp: { limit: 20, windowMs: HOUR } satisfies RateLimitOpts,
  publicBookIp: { limit: 15, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicBookEmail: { limit: 8, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicManageIp: { limit: 40, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicWaitlistIp: { limit: 30, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicDepositIp: { limit: 20, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicSlotsIp: { limit: 90, windowMs: MIN } satisfies RateLimitOpts,
  publicClinicGetIp: { limit: 120, windowMs: MIN } satisfies RateLimitOpts,
} as const;

function enforceKey(
  key: string,
  opts: RateLimitOpts,
  message: string,
) {
  const result = consumeRateLimit(key, opts);
  if (!result.ok) {
    throw tooManyRequests(message, result.retryAfterSec);
  }
}

export function enforceLoginLimits(req: Request, email: string) {
  const ip = clientIp(req);
  const normalised = email.toLowerCase().trim();
  enforceKey(
    `auth:login:ip:${ip}`,
    AbuseLimits.loginIp,
    "Too many sign-in attempts from this network. Try again shortly.",
  );
  if (normalised) {
    enforceKey(
      `auth:login:email:${normalised}`,
      AbuseLimits.loginEmail,
      "Too many sign-in attempts for this account. Try again shortly.",
    );
  }
}

export function enforceForgotPasswordLimits(req: Request, email: string) {
  const ip = clientIp(req);
  const normalised = email.toLowerCase().trim();
  enforceKey(
    `auth:forgot:ip:${ip}`,
    AbuseLimits.forgotIp,
    "Too many password reset requests. Try again later.",
  );
  if (normalised) {
    enforceKey(
      `auth:forgot:email:${normalised}`,
      AbuseLimits.forgotEmail,
      "Too many password reset requests for this email. Try again later.",
    );
  }
}

export function enforceResetPasswordLimits(req: Request) {
  enforceKey(
    `auth:reset:ip:${clientIp(req)}`,
    AbuseLimits.resetIp,
    "Too many password reset attempts. Try again later.",
  );
}

export function enforcePublicBookLimits(req: Request, email?: string) {
  const ip = clientIp(req);
  enforceKey(
    `public:book:ip:${ip}`,
    AbuseLimits.publicBookIp,
    "Too many booking attempts. Try again shortly.",
  );
  const normalised = email?.toLowerCase().trim();
  if (normalised) {
    enforceKey(
      `public:book:email:${normalised}`,
      AbuseLimits.publicBookEmail,
      "Too many booking attempts for this email. Try again shortly.",
    );
  }
}

export function enforcePublicManageLimits(req: Request) {
  enforceKey(
    `public:manage:ip:${clientIp(req)}`,
    AbuseLimits.publicManageIp,
    "Too many manage requests. Try again shortly.",
  );
}

export function enforcePublicWaitlistLimits(req: Request) {
  enforceKey(
    `public:waitlist:ip:${clientIp(req)}`,
    AbuseLimits.publicWaitlistIp,
    "Too many waitlist actions. Try again shortly.",
  );
}

export function enforcePublicDepositLimits(req: Request) {
  enforceKey(
    `public:deposit:ip:${clientIp(req)}`,
    AbuseLimits.publicDepositIp,
    "Too many deposit requests. Try again shortly.",
  );
}

export function enforcePublicSlotsLimits(req: Request) {
  enforceKey(
    `public:slots:ip:${clientIp(req)}`,
    AbuseLimits.publicSlotsIp,
    "Too many slot lookups. Try again shortly.",
  );
}

export function enforcePublicClinicGetLimits(req: Request) {
  enforceKey(
    `public:clinic:ip:${clientIp(req)}`,
    AbuseLimits.publicClinicGetIp,
    "Too many requests. Try again shortly.",
  );
}
