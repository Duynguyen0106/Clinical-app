import { withPublic } from "@/server/api";
import { jsonCreated, jsonOk } from "@/server/http";
import {
  getPublicClinicBySlug,
  publicBook,
  publicBookSchema,
} from "@/modules/scheduling/service";
import {
  enforcePublicBookLimits,
  enforcePublicClinicGetLimits,
} from "@/server/abuse";
import { clientIp } from "@/server/client-ip";
import { assertTurnstileToken } from "@/server/turnstile";

export const GET = withPublic(async (req, params) => {
  await enforcePublicClinicGetLimits(req);
  const clinic = await getPublicClinicBySlug(params.slug);
  return jsonOk({ clinic });
});

export const POST = withPublic(async (req, params) => {
  const body = publicBookSchema.parse(await req.json());
  await enforcePublicBookLimits(req, body.patient.email);
  await assertTurnstileToken(body.captchaToken, { ip: clientIp(req) });
  const result = await publicBook(params.slug, body);
  const appointment = result.appointment;
  // Manage capability lives in the confirmation email only — never return
  // manageUrl/manageToken to the booker response (stolen-email abuse).
  const deposit = result.deposit
    ? {
        status: result.deposit.status,
        depositCents: result.deposit.depositCents,
        checkoutUrl: result.deposit.checkoutUrl,
        provider: result.deposit.provider,
        bankTransfer: result.deposit.bankTransfer,
      }
    : null;
  return jsonCreated({
    appointment: {
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      depositCents: appointment.depositCents,
      depositStatus: appointment.depositStatus,
      patient: {
        firstName: appointment.patient.firstName,
        email: appointment.patient.email,
      },
      practitioner: {
        displayName: appointment.practitioner.displayName,
      },
      appointmentType: {
        name: appointment.appointmentType.name,
        durationMinutes: appointment.appointmentType.durationMinutes,
      },
      room: appointment.room ? { name: appointment.room.name } : null,
      clinic: {
        name: appointment.clinic.name,
        timezone: appointment.clinic.timezone,
      },
    },
    deposit,
    policyText: result.policyText,
    confirmation: result.confirmation
      ? {
          emailSent: result.confirmation.emailSent,
          emailDelivered: result.confirmation.emailDelivered,
          emailProvider: result.confirmation.emailProvider,
          smsSent: result.confirmation.smsSent,
        }
      : null,
  });
});
