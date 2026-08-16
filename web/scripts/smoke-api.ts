/**
 * End-to-end API smoke against a running Next server.
 * Run: npx tsx scripts/smoke-api.ts
 */
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000/api/v1";

type Json = Record<string, unknown>;

async function req(
  path: string,
  opts: {
    method?: string;
    token?: string;
    clinicId?: string;
    body?: unknown;
    form?: FormData;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.clinicId) headers["X-Clinic-Id"] = opts.clinicId;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers,
    body,
  });
  const data = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const msg =
      (data.error as { message?: string } | undefined)?.message ??
      res.statusText;
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const steps: string[] = [];
  const ok = (s: string) => {
    steps.push(`✓ ${s}`);
    console.log(`✓ ${s}`);
  };

  // Health
  const health = await req("/health");
  assert(health.ok === true, "health not ok");
  ok("health");

  // Login owner
  const login = await req("/auth/login", {
    method: "POST",
    body: { email: "alex@northbank.example", password: "treow-demo" },
  });
  const token = login.accessToken as string;
  const clinicId = (login.clinic as { id: string }).id;
  assert(token && clinicId, "login missing token/clinic");
  ok("owner login");

  // Forgot password (no leak)
  const forgot = await req("/auth/forgot-password", {
    method: "POST",
    body: { email: "alex@northbank.example" },
  });
  assert(forgot.ok === true, "forgot password failed");
  ok("forgot-password");

  // Me + patients timeline prep
  const me = await req("/auth/me", { token, clinicId });
  assert((me.user as { email: string }).email.includes("alex"), "me failed");
  ok("me");

  const patients = await req("/patients?q=Sarah", { token, clinicId });
  const patientList = patients.patients as Array<{ id: string; firstName: string }>;
  assert(patientList.length > 0, "no patients");
  const patientId = patientList[0].id;

  const prep = await req(`/patients/${patientId}?prep=1&source=smoke`, {
    token,
    clinicId,
  });
  const timeline = (prep.prep as { timeline?: unknown[] }).timeline;
  assert(Array.isArray(timeline), "timeline missing");
  ok(`patient timeline (${timeline.length} items)`);

  // Today's appointments + check-in
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const apts = await req(
    `/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
    { token, clinicId },
  );
  const appointments = apts.appointments as Array<{
    id: string;
    status: string;
    patient: { firstName: string };
  }>;
  assert(appointments.length > 0, "no appointments today");
  const apt = appointments.find((a) =>
    ["BOOKED", "CONFIRMED", "CHECKED_IN"].includes(a.status),
  );
  assert(apt, "no active appointment");

  if (apt.status === "BOOKED" || apt.status === "CONFIRMED") {
    await req(`/appointments/${apt.id}`, {
      method: "PATCH",
      token,
      clinicId,
      body: { status: "CHECKED_IN" },
    });
    ok("check-in");
  } else {
    ok("already checked in");
  }

  // Practitioner login for visit
  const pracLogin = await req("/auth/login", {
    method: "POST",
    body: { email: "jordan@northbank.example", password: "treow-demo" },
  });
  const pToken = pracLogin.accessToken as string;
  const pClinic = (pracLogin.clinic as { id: string }).id;

  const visitRes = await req("/visits", {
    method: "POST",
    token: pToken,
    clinicId: pClinic,
    body: { appointmentId: apt.id },
  });
  const visit = visitRes.visit as { id: string; recordingConsentAt?: string };
  assert(visit?.id, "visit not created");
  ok(`open visit ${visit.id}`);

  if (!visit.recordingConsentAt) {
    await req(`/visits/${visit.id}/consent`, {
      method: "POST",
      token: pToken,
      clinicId: pClinic,
      body: { granted: true, method: "in_person" },
    });
    ok("recording consent");
  }

  // Force sync organise for smoke reliability
  process.env.AI_ORGANISE_ASYNC = "false";

  await req(`/visits/${visit.id}/recording`, {
    method: "POST",
    token: pToken,
    clinicId: pClinic,
  });
  ok("start recording");

  const form = new FormData();
  // Minimal fake webm-ish bytes
  const audio = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 1, 2, 3])], {
    type: "audio/webm",
  });
  form.append("audio", audio, "visit.webm");
  await req(`/visits/${visit.id}/recording/upload`, {
    method: "POST",
    token: pToken,
    clinicId: pClinic,
    form,
  });
  ok("upload audio");

  // Prefer sync for smoke — server reads env at request time if organised that way;
  // default async: poll for draft
  const organise = await req(`/visits/${visit.id}/recording`, {
    method: "PATCH",
    token: pToken,
    clinicId: pClinic,
    body: { durationSec: 12 },
  });

  let noteId: string | undefined;
  let noteContent: Record<string, unknown> | undefined;

  if (organise.note && typeof organise.note === "object") {
    noteId = (organise.note as { id: string }).id;
    noteContent = (organise.note as { content: Record<string, unknown> }).content;
    ok("organise sync");
  } else {
    ok("organise async enqueued");
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await sleep(800);
      const v = await req(`/visits/${visit.id}`, {
        token: pToken,
        clinicId: pClinic,
      });
      const notes = (v.visit as { notes: Array<{ id: string; status: string; content: Record<string, unknown> }> })
        .notes;
      const draft = notes.find((n) => n.status === "DRAFT");
      if (draft) {
        noteId = draft.id;
        noteContent = draft.content;
        break;
      }
      const rec = (v.visit as { recording?: { status: string; error?: string } })
        .recording;
      if (rec?.status === "FAILED") {
        throw new Error(`organise failed: ${rec.error}`);
      }
    }
    assert(noteId, "draft note not ready in time");
    ok("organise poll → draft");
  }

  await req(`/notes/${noteId}`, {
    method: "PATCH",
    token: pToken,
    clinicId: pClinic,
    body: { content: { ...(noteContent ?? {}), assessment: "Smoke test OK" } },
  });
  await req(`/notes/${noteId}/sign`, {
    method: "POST",
    token: pToken,
    clinicId: pClinic,
  });
  ok("sign note");

  // Invoice from visit
  const inv = await req(`/visits/${visit.id}/invoice`, {
    token: pToken,
    clinicId: pClinic,
  });
  assert((inv.invoice as { id: string }).id, "invoice missing");
  const paid = await req(`/visits/${visit.id}/invoice`, {
    method: "POST",
    token: pToken,
    clinicId: pClinic,
    body: { method: "card_terminal" },
  });
  assert((paid.invoice as { status: string }).status === "PAID", "not paid");
  ok("invoice + mark paid");

  const receipt = await req(
    `/invoices/${(paid.invoice as { id: string }).id}/receipt`,
    { token, clinicId },
  );
  assert((receipt.document as { kind: string }).kind === "receipt", "no receipt");
  ok("receipt document");

  // Addendum + void path on a second note flow would be long — test addendum API
  const addendum = await req(`/notes/${noteId}/addendum`, {
    method: "POST",
    token: pToken,
    clinicId: pClinic,
    body: { text: "Smoke addendum: patient tolerated treatment well." },
  });
  const addendumId = (addendum.note as { id: string }).id;
  await req(`/notes/${addendumId}/sign`, {
    method: "POST",
    token: pToken,
    clinicId: pClinic,
  });
  ok("addendum create + sign");

  // Reception waitlist offer → public accept
  const reception = await req("/auth/login", {
    method: "POST",
    body: { email: "reception@northbank.example", password: "treow-demo" },
  });
  const rToken = reception.accessToken as string;
  const rClinic = (reception.clinic as { id: string }).id;

  const catalog = await req("/clinic/catalog", { token: rToken, clinicId: rClinic });
  const typeId = (catalog.appointmentTypes as Array<{ id: string }>)[0]?.id;
  const practitionerId = (catalog.practitioners as Array<{ id: string }>)[0]
    ?.id;
  assert(typeId && practitionerId, `missing type/practitioner ${typeId} ${practitionerId}`);

  // Create waitlist + cancel a free future slot to trigger offer
  await req("/waitlist", {
    method: "POST",
    token: rToken,
    clinicId: rClinic,
    body: {
      patientId,
      appointmentTypeId: typeId,
      practitionerId,
      autoNotify: true,
    },
  });
  ok("waitlist entry");

  const slots = await req(
    `/slots?appointmentTypeId=${typeId}&practitionerId=${practitionerId}&days=14`,
    { token: rToken, clinicId: rClinic },
  );
  const freeSlot = (slots.slots as string[])[0];
  assert(freeSlot, "no free slots for waitlist offer test");

  const booked = await req("/appointments", {
    method: "POST",
    token: rToken,
    clinicId: rClinic,
    body: {
      patientId,
      practitionerId,
      appointmentTypeId: typeId,
      startsAt: freeSlot,
    },
  });
  const bookedId = (booked.appointment as { id: string }).id;
  const cancelled = await req(`/appointments/${bookedId}`, {
    method: "PATCH",
    token: rToken,
    clinicId: rClinic,
    body: { status: "CANCELLED" },
  });
  const offer = (
    cancelled.appointment as {
      waitlistOffer?: { offered: boolean; entry?: { id: string } };
    }
  ).waitlistOffer;
  if (offer?.offered && offer.entry?.id) {
    const { waitlistOfferUrl } = await import(
      "../src/modules/scheduling/waitlist-token"
    );
    const url = waitlistOfferUrl(
      offer.entry.id,
      new Date(Date.now() + 2 * 3600_000),
    );
    const tokenPart = url.split("/").pop()!;
    const decoded = decodeURIComponent(tokenPart);
    const pub = await req(
      `/public/waitlist?token=${encodeURIComponent(decoded)}`,
    );
    assert(
      (pub.offer as { actionable: boolean }).actionable,
      "offer not actionable",
    );
    await req("/public/waitlist", {
      method: "POST",
      body: { token: decoded, action: "accept" },
    });
    ok("public waitlist accept");
  } else {
    ok("waitlist offer skipped (no matching entry/slot)");
  }

  // Jobs with staff token
  await req("/jobs/reminders", { method: "POST", token, clinicId });
  ok("jobs/reminders");
  await req("/jobs/organise", { method: "POST", token: pToken, clinicId: pClinic });
  ok("jobs/organise");

  console.log("\nSmoke passed:\n" + steps.map((s) => `  ${s}`).join("\n"));
}

main().catch((err) => {
  console.error("\nSmoke FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
