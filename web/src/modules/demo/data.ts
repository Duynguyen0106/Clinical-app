/**
 * Demo clinic data until Postgres + auth are wired.
 * Replace with Prisma queries in module repositories.
 */

export type DemoAppointment = {
  id: string;
  patientName: string;
  type: string;
  startsAt: string; // ISO
  endsAt: string;
  status: "booked" | "checked_in" | "in_progress" | "completed";
  practitioner: string;
};

export type DemoPatient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  alerts?: string;
};

export const DEMO_CLINIC = {
  name: "Harbour Physio",
  slug: "harbour-physio",
  practitioner: "Alex Nguyen",
};

export const DEMO_PATIENTS: DemoPatient[] = [
  {
    id: "pat_sarah",
    firstName: "Sarah",
    lastName: "Chen",
    email: "sarah.chen@example.com",
    phone: "+61 400 111 222",
    alerts: "Recording consent on file",
  },
  {
    id: "pat_james",
    firstName: "James",
    lastName: "Okafor",
    email: "james.o@example.com",
    phone: "+61 400 333 444",
  },
  {
    id: "pat_mina",
    firstName: "Mina",
    lastName: "Patel",
    email: "mina.patel@example.com",
    phone: "+61 400 555 666",
  },
];

function todayAt(hours: number, minutes = 0) {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export const DEMO_APPOINTMENTS: DemoAppointment[] = [
  {
    id: "apt_1",
    patientName: "Sarah Chen",
    type: "Initial assessment",
    startsAt: todayAt(9, 0),
    endsAt: addMinutes(todayAt(9, 0), 45),
    status: "checked_in",
    practitioner: DEMO_CLINIC.practitioner,
  },
  {
    id: "apt_2",
    patientName: "James Okafor",
    type: "Follow-up",
    startsAt: todayAt(10, 0),
    endsAt: addMinutes(todayAt(10, 0), 30),
    status: "booked",
    practitioner: DEMO_CLINIC.practitioner,
  },
  {
    id: "apt_3",
    patientName: "Mina Patel",
    type: "Follow-up",
    startsAt: todayAt(11, 0),
    endsAt: addMinutes(todayAt(11, 0), 30),
    status: "booked",
    practitioner: DEMO_CLINIC.practitioner,
  },
  {
    id: "apt_4",
    patientName: "Sarah Chen",
    type: "Review",
    startsAt: todayAt(14, 30),
    endsAt: addMinutes(todayAt(14, 30), 30),
    status: "booked",
    practitioner: DEMO_CLINIC.practitioner,
  },
];

export function getAppointment(id: string) {
  return DEMO_APPOINTMENTS.find((a) => a.id === id);
}
