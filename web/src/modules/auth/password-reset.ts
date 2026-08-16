import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashToken } from "@/server/auth";
import { badRequest, unauthorized } from "@/server/errors";
import { getAppBaseUrl } from "@/server/env";
import { sendEmail } from "@/modules/notifications/email";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(200),
});

/**
 * Always returns ok — do not reveal whether the email exists.
 */
export async function requestPasswordReset(
  input: z.infer<typeof forgotPasswordSchema>,
) {
  const email = input.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.passwordHash) {
    const raw = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashToken(raw),
        passwordResetExpiresAt: expiresAt,
      },
    });

    const link = `${getAppBaseUrl()}/login/reset?token=${raw}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your Treow Clinic password",
      text: [
        `Hi ${user.name},`,
        "",
        "We received a request to reset your Treow Clinic staff password.",
        "Open this link within 1 hour to choose a new password:",
        link,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    });
  }

  return {
    ok: true as const,
    message:
      "If that email has a staff account, we sent a reset link. Check your inbox (or server console in demo).",
  };
}

export async function resetPasswordWithToken(
  input: z.infer<typeof resetPasswordSchema>,
) {
  const tokenHash = hashToken(input.token);
  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { gt: new Date() },
    },
  });

  if (!user) {
    throw unauthorized("Reset link is invalid or has expired");
  }

  if (input.password.length < 8) {
    throw badRequest("Password must be at least 8 characters");
  }

  const passwordHash = await hash(input.password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return { ok: true as const };
}
