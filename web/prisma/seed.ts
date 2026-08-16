import "dotenv/config";
import { MembershipRole } from "../src/generated/prisma/client";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/modules/auth/service";
import { MSK_TEMPLATE_PACK } from "../src/modules/notes/templates";

async function main() {
  console.log("Seeding Treow Clinic demo data…");

  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.noteAuditEvent.deleteMany();
  await prisma.clinicalNote.deleteMany();
  await prisma.transcript.deleteMany();
  await prisma.recording.deleteMany();
  await prisma.visit.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.patientConsent.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.availabilityException.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.noteTemplate.deleteMany();
  await prisma.appointmentType.deleteMany();
  await prisma.location.deleteMany();
  await prisma.practitionerProfile.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.clinic.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword("treow-demo");

  const owner = await prisma.user.create({
    data: {
      email: "alex@northbank.example",
      name: "Alex Nguyen",
      passwordHash,
    },
  });

  const reception = await prisma.user.create({
    data: {
      email: "reception@northbank.example",
      name: "Sam Brooks",
      passwordHash,
    },
  });

  const clinic = await prisma.clinic.create({
    data: {
      name: "Northbank Manual Therapy",
      slug: "northbank-manual",
      timezone: "Europe/London",
      audioRetentionDays: 14,
      privacyNoticeVersion: "2026-08-uk-v1",
      dataRegion: "uk-eu",
    },
  });

  const ownerMembership = await prisma.membership.create({
    data: {
      clinicId: clinic.id,
      userId: owner.id,
      role: MembershipRole.OWNER,
    },
  });

  await prisma.membership.create({
    data: {
      clinicId: clinic.id,
      userId: reception.id,
      role: MembershipRole.RECEPTION,
    },
  });

  const practitioner = await prisma.practitionerProfile.create({
    data: {
      membershipId: ownerMembership.id,
      displayName: "Alex Nguyen",
      colour: "#0F6B5C",
    },
  });

  // Mon–Fri 09:00–17:00
  for (const dayOfWeek of [1, 2, 3, 4, 5]) {
    await prisma.availabilityRule.create({
      data: {
        practitionerId: practitioner.id,
        dayOfWeek,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      },
    });
  }

  const location = await prisma.location.create({
    data: {
      clinicId: clinic.id,
      name: "Treatment room 1",
      address: "12 Quayside, London",
    },
  });

  const types = await Promise.all(
    [
      {
        name: "Physio · Initial assessment",
        durationMinutes: 45,
        colour: "#0F6B5C",
      },
      {
        name: "Physio · Follow-up",
        durationMinutes: 30,
        colour: "#3D7A6E",
      },
      {
        name: "Osteopathy session",
        durationMinutes: 40,
        colour: "#1F5F78",
      },
      {
        name: "Manual therapy",
        durationMinutes: 30,
        colour: "#4A6B5C",
      },
    ].map((t) =>
      prisma.appointmentType.create({
        data: { clinicId: clinic.id, ...t, onlineBookable: true },
      }),
    ),
  );

  for (const tpl of MSK_TEMPLATE_PACK) {
    await prisma.noteTemplate.create({
      data: {
        clinicId: clinic.id,
        name: tpl.name,
        isDefault: Boolean(tpl.isDefault),
        schema: { sections: tpl.sections },
      },
    });
  }

  const patients = await Promise.all([
    prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: "Sarah",
        lastName: "Chen",
        email: "sarah.chen@example.com",
        phone: "+44 7700 900111",
        alerts: "Recording consent on file",
      },
    }),
    prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: "James",
        lastName: "Okafor",
        email: "james.o@example.com",
        phone: "+44 7700 900222",
      },
    }),
    prisma.patient.create({
      data: {
        clinicId: clinic.id,
        firstName: "Mina",
        lastName: "Patel",
        email: "mina.patel@example.com",
        phone: "+44 7700 900333",
      },
    }),
  ]);

  await prisma.patientConsent.create({
    data: {
      patientId: patients[0].id,
      type: "RECORDING",
      granted: true,
      method: "in_person",
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function at(hours: number, minutes = 0) {
    const d = new Date(today);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  const appointments = await Promise.all([
    prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patients[0].id,
        practitionerId: practitioner.id,
        appointmentTypeId: types[0].id,
        locationId: location.id,
        startsAt: at(9),
        endsAt: at(9, 45),
        status: "CHECKED_IN",
      },
    }),
    prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patients[1].id,
        practitionerId: practitioner.id,
        appointmentTypeId: types[2].id,
        locationId: location.id,
        startsAt: at(10),
        endsAt: at(10, 40),
        status: "BOOKED",
      },
    }),
    prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patients[2].id,
        practitionerId: practitioner.id,
        appointmentTypeId: types[3].id,
        locationId: location.id,
        startsAt: at(11),
        endsAt: at(11, 30),
        status: "BOOKED",
      },
    }),
  ]);

  await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patients[1].id,
      appointmentId: appointments[1].id,
      amountCents: 6500,
      currency: "GBP",
      status: "SENT",
      issuedAt: new Date(),
    },
  });

  await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patients[2].id,
      amountCents: 5500,
      currency: "GBP",
      status: "PAID",
      issuedAt: new Date(),
      paidAt: new Date(),
      payments: {
        create: { amountCents: 5500, method: "card_terminal" },
      },
    },
  });

  // Waitlist: Mina wants osteopathy — cancel James's osteo slot to demo auto-offer
  await prisma.waitlistEntry.create({
    data: {
      clinicId: clinic.id,
      patientId: patients[2].id,
      appointmentTypeId: types[2].id,
      practitionerId: practitioner.id,
      autoNotify: true,
      notes: "Happy with late morning",
      status: "WAITING",
    },
  });

  // Draft note for task inbox
  const draftTemplate = await prisma.noteTemplate.findFirst({
    where: { clinicId: clinic.id },
  });
  if (draftTemplate) {
    await prisma.clinicalNote.create({
      data: {
        patientId: patients[1].id,
        templateId: draftTemplate.id,
        status: "DRAFT",
        source: "manual",
        content: {
          subjective: "Neck stiffness after desk work",
          objective: "",
          assessment: "",
          plan: "",
        },
      },
    });
  }

  console.log("Seed complete.");
  console.log("Login: alex@northbank.example / treow-demo");
  console.log("Clinic slug: northbank-manual");
  console.log(`First appointment id: ${appointments[0].id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
