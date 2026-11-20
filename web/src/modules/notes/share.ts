import { z } from "zod";
import type { AuthContext } from "@/server/auth";
import { prisma } from "@/server/db";
import { badRequest } from "@/server/errors";
import { sendEmail } from "@/modules/notifications/email";
import {
  buildPatientCopyEmail,
  getPatientCopyDocument,
} from "@/modules/notes/documents";

export const shareNoteSchema = z.object({
  channel: z.literal("email"),
  /** Optional override; defaults to patient.email on the note. */
  to: z.string().email().optional(),
});

function redactEmailForAudit(to: string) {
  const at = to.lastIndexOf("@");
  if (at <= 0) return "[redacted]";
  const local = to.slice(0, at);
  const domain = to.slice(at + 1);
  const hint =
    local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  return `${hint}@${domain}`;
}

/**
 * Email a patient copy of a signed clinical note (clinic + practitioner letterhead).
 */
export async function shareNoteWithPatient(
  ctx: AuthContext,
  noteId: string,
  input: z.infer<typeof shareNoteSchema>,
) {
  if (input.channel !== "email") {
    throw badRequest("Only email sharing is supported");
  }

  const doc = await getPatientCopyDocument(ctx, noteId, { audit: false });
  const to = (input.to ?? doc.patient.email ?? "").trim();
  if (!to) {
    throw badRequest(
      "Patient has no email on file — add one or provide a to address",
    );
  }

  const email = buildPatientCopyEmail(doc);
  let result;
  try {
    result = await sendEmail({
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: doc.clinic.email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    throw badRequest(
      message.includes("Resend")
        ? `Could not send email: ${message}`
        : `Could not send email (${message})`,
    );
  }

  await prisma.noteAuditEvent.create({
    data: {
      noteId: doc.noteId,
      actorId: ctx.userId,
      action: "shared_with_patient",
      meta: {
        channel: "email",
        to: redactEmailForAudit(to),
        provider: result.provider,
        delivered: result.delivered,
        reference: doc.reference,
      },
    },
  });

  return {
    ok: true as const,
    to,
    reference: doc.reference,
    delivered: result.delivered,
    provider: result.provider,
  };
}
