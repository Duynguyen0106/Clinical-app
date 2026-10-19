import { clientIp } from "@/server/client-ip";
import { tooManyRequests } from "@/server/errors";
import {
  consumeRateLimitAsync,
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
  /** Shared ADMIN_PROVISION_SECRET surfaces — keep tight */
  adminProvisionIp: { limit: 20, windowMs: HOUR } satisfies RateLimitOpts,
  adminEmailTestIp: { limit: 10, windowMs: HOUR } satisfies RateLimitOpts,
} as const;

async function enforceKey(
  key: string,
  opts: RateLimitOpts,
  message: string,
) {
  const result = await consumeRateLimitAsync(key, opts);
  if (!result.ok) {
    throw tooManyRequests(message, result.retryAfterSec);
  }
}

export async function enforceLoginLimits(req: Request, email: string) {
  const ip = clientIp(req);
  const normalised = email.toLowerCase().trim();
  await enforceKey(
    `auth:login:ip:${ip}`,
    AbuseLimits.loginIp,
    "Too many sign-in attempts from this network. Try again shortly.",
  );
  if (normalised) {
    await enforceKey(
      `auth:login:email:${normalised}`,
      AbuseLimits.loginEmail,
      "Too many sign-in attempts for this account. Try again shortly.",
    );
  }
}

export async function enforceForgotPasswordLimits(req: Request, email: string) {
  const ip = clientIp(req);
  const normalised = email.toLowerCase().trim();
  await enforceKey(
    `auth:forgot:ip:${ip}`,
    AbuseLimits.forgotIp,
    "Too many password reset requests. Try again later.",
  );
  if (normalised) {
    await enforceKey(
      `auth:forgot:email:${normalised}`,
      AbuseLimits.forgotEmail,
      "Too many password reset requests for this email. Try again later.",
    );
  }
}

export async function enforceResetPasswordLimits(req: Request) {
  await enforceKey(
    `auth:reset:ip:${clientIp(req)}`,
    AbuseLimits.resetIp,
    "Too many password reset attempts. Try again later.",
  );
}

export async function enforcePublicBookLimits(req: Request, email?: string) {
  const ip = clientIp(req);
  await enforceKey(
    `public:book:ip:${ip}`,
    AbuseLimits.publicBookIp,
    "Too many booking attempts. Try again shortly.",
  );
  const normalised = email?.toLowerCase().trim();
  if (normalised) {
    await enforceKey(
      `public:book:email:${normalised}`,
      AbuseLimits.publicBookEmail,
      "Too many booking attempts for this email. Try again shortly.",
    );
  }
}

export async function enforcePublicManageLimits(req: Request) {
  await enforceKey(
    `public:manage:ip:${clientIp(req)}`,
    AbuseLimits.publicManageIp,
    "Too many manage requests. Try again shortly.",
  );
}

export async function enforcePublicWaitlistLimits(req: Request) {
  await enforceKey(
    `public:waitlist:ip:${clientIp(req)}`,
    AbuseLimits.publicWaitlistIp,
    "Too many waitlist actions. Try again shortly.",
  );
}

export async function enforcePublicDepositLimits(req: Request) {
  await enforceKey(
    `public:deposit:ip:${clientIp(req)}`,
    AbuseLimits.publicDepositIp,
    "Too many deposit requests. Try again shortly.",
  );
}

export async function enforcePublicSlotsLimits(req: Request) {
  await enforceKey(
    `public:slots:ip:${clientIp(req)}`,
    AbuseLimits.publicSlotsIp,
    "Too many slot lookups. Try again shortly.",
  );
}

export async function enforcePublicClinicGetLimits(req: Request) {
  await enforceKey(
    `public:clinic:ip:${clientIp(req)}`,
    AbuseLimits.publicClinicGetIp,
    "Too many requests. Try again shortly.",
  );
}

export async function enforceAdminProvisionLimits(req: Request) {
  await enforceKey(
    `admin:provision:ip:${clientIp(req)}`,
    AbuseLimits.adminProvisionIp,
    "Too many admin provision requests. Try again later.",
  );
}

export async function enforceAdminEmailTestLimits(req: Request) {
  await enforceKey(
    `admin:email-test:ip:${clientIp(req)}`,
    AbuseLimits.adminEmailTestIp,
    "Too many admin email tests. Try again later.",
  );
}
