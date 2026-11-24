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
  /** All login POSTs from one IP (success + failure). */
  loginIp: { limit: 60, windowMs: 15 * MIN } satisfies RateLimitOpts,
  /**
   * Failed password attempts for one email only.
   * Successful logins must not consume this budget — otherwise staff +
   * automation share a 10/15m lockout and lock the real user out.
   */
  loginEmailFailed: { limit: 8, windowMs: 15 * MIN } satisfies RateLimitOpts,
  forgotIp: { limit: 10, windowMs: HOUR } satisfies RateLimitOpts,
  forgotEmail: { limit: 5, windowMs: HOUR } satisfies RateLimitOpts,
  resetIp: { limit: 20, windowMs: HOUR } satisfies RateLimitOpts,
  publicBookIp: { limit: 15, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicBookEmail: { limit: 8, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicManageIp: { limit: 40, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicIntakeIp: { limit: 40, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicWaitlistIp: { limit: 30, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicEmailPrefsIp: { limit: 40, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicDepositIp: { limit: 20, windowMs: 15 * MIN } satisfies RateLimitOpts,
  publicSlotsIp: { limit: 90, windowMs: MIN } satisfies RateLimitOpts,
  publicClinicGetIp: { limit: 120, windowMs: MIN } satisfies RateLimitOpts,
  /** ICS calendar feeds — token is secret but still throttle scrapers */
  calendarFeedIp: { limit: 60, windowMs: MIN } satisfies RateLimitOpts,
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

/** IP spray limit — applied before credential check. */
export async function enforceLoginLimits(req: Request, _email?: string) {
  const ip = clientIp(req);
  await enforceKey(
    `auth:login:ip:${ip}`,
    AbuseLimits.loginIp,
    "Too many sign-in attempts from this network. Try again shortly.",
  );
}

/**
 * Count a failed sign-in against the email bucket.
 * Call only after an invalid password / unknown user response.
 */
export async function recordFailedLoginAttempt(email: string) {
  const normalised = email.toLowerCase().trim();
  if (!normalised) return;
  await enforceKey(
    `auth:login:email:fail:${normalised}`,
    AbuseLimits.loginEmailFailed,
    "Too many sign-in attempts for this account. Try again shortly.",
  );
}

export async function enforceForgotPasswordLimits(req: Request, email: string) {
  const ip = clientIp(req);
  const normalised = email.toLowerCase().trim();
  await Promise.all([
    enforceKey(
      `auth:forgot:ip:${ip}`,
      AbuseLimits.forgotIp,
      "Too many password reset requests. Try again later.",
    ),
    normalised
      ? enforceKey(
          `auth:forgot:email:${normalised}`,
          AbuseLimits.forgotEmail,
          "Too many password reset requests for this email. Try again later.",
        )
      : Promise.resolve(),
  ]);
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
  const normalised = email?.toLowerCase().trim();
  await Promise.all([
    enforceKey(
      `public:book:ip:${ip}`,
      AbuseLimits.publicBookIp,
      "Too many booking attempts. Try again shortly.",
    ),
    normalised
      ? enforceKey(
          `public:book:email:${normalised}`,
          AbuseLimits.publicBookEmail,
          "Too many booking attempts for this email. Try again shortly.",
        )
      : Promise.resolve(),
  ]);
}

export async function enforcePublicManageLimits(req: Request) {
  await enforceKey(
    `public:manage:ip:${clientIp(req)}`,
    AbuseLimits.publicManageIp,
    "Too many manage requests. Try again shortly.",
  );
}

export async function enforcePublicIntakeLimits(req: Request) {
  await enforceKey(
    `public:intake:ip:${clientIp(req)}`,
    AbuseLimits.publicIntakeIp,
    "Too many consent form requests. Try again shortly.",
  );
}

export async function enforcePublicWaitlistLimits(req: Request) {
  await enforceKey(
    `public:waitlist:ip:${clientIp(req)}`,
    AbuseLimits.publicWaitlistIp,
    "Too many waitlist actions. Try again shortly.",
  );
}

export async function enforcePublicEmailPrefsLimits(req: Request) {
  await enforceKey(
    `public:email-prefs:ip:${clientIp(req)}`,
    AbuseLimits.publicEmailPrefsIp,
    "Too many preference requests. Try again shortly.",
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

export async function enforceCalendarFeedLimits(req: Request) {
  await enforceKey(
    `public:calendar-feed:ip:${clientIp(req)}`,
    AbuseLimits.calendarFeedIp,
    "Too many calendar feed requests. Try again shortly.",
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
