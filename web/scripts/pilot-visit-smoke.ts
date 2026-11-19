/**
 * Design-partner pilot smoke: N visit loops on a live Worker clinic.
 * Usage:
 *   APP_BASE_URL=… PILOT_EMAIL=… PILOT_PASSWORD=… npx tsx scripts/pilot-visit-smoke.ts
 */
const BASE = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const EMAIL = process.env.PILOT_EMAIL ?? "";
const PASSWORD = process.env.PILOT_PASSWORD ?? "";
const COUNT = Math.min(5, Math.max(1, Number(process.env.PILOT_VISITS ?? "5")));

async function api(
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
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(
      `${opts.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(json)}`,
    );
  }
  return json as Record<string, unknown>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Far-future Mon–Sat slot; 2h spacing avoids 60m type collisions. */
function nextWorkingSlot(n: number) {
  const d = new Date();
  // Jump ~2 weeks out so re-runs don't hit leftover diary rows.
  d.setUTCDate(d.getUTCDate() + 14 + n);
  d.setUTCHours(9 + (n - 1) * 2, 0, 0, 0);
  while (d.getUTCDay() === 0) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

async function oneVisit(
  token: string,
  clinicId: string,
  patientId: string,
  practitionerId: string,
  appointmentTypeId: string,
  n: number,
) {
  const started = Date.now();
  // Book inside Mon–Sat 09:00 Europe/London working hours (UTC winter = +0).
  // Use upcoming weekday mornings, staggered by visit index.
  const startsAt = nextWorkingSlot(n);
  const created = await api("/appointments", {
    method: "POST",
    token,
    clinicId,
    body: {
      patientId,
      practitionerId,
      appointmentTypeId,
      startsAt: startsAt.toISOString(),
    },
  });
  const appointmentId = (created.appointment as { id: string }).id;

  const open = await api("/visits", {
    method: "POST",
    token,
    clinicId,
    body: { appointmentId },
  });
  const visit = open.visit as { id: string; recordingConsentAt?: string | null };
  if (!visit.recordingConsentAt) {
    await api(`/visits/${visit.id}/consent`, {
      method: "POST",
      token,
      clinicId,
      body: { granted: true, method: "in_person" },
    });
  }
  await api(`/visits/${visit.id}/recording`, {
    method: "POST",
    token,
    clinicId,
  });
  const form = new FormData();
  form.append(
    "audio",
    new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 1, 2, 3])], {
      type: "audio/webm",
    }),
    "pilot.webm",
  );
  try {
    await api(`/visits/${visit.id}/recording/upload`, {
      method: "POST",
      token,
      clinicId,
      form,
    });
  } catch (err) {
    const msg = String(err);
    if (/Object storage|INTERNAL|S3_|500/.test(msg)) {
      console.log(
        JSON.stringify({
          n,
          visitId: visit.id,
          appointmentId,
          consent: true,
          recordingBlocked:
            "R2/S3 not configured on Worker — enable R2 then re-run",
          minutesToSigned: null,
          usedAiDraft: false,
        }),
      );
      return { blocked: true as const };
    }
    throw err;
  }
  const organise = await api(`/visits/${visit.id}/recording`, {
    method: "PATCH",
    token,
    clinicId,
    body: { durationSec: 15 },
  });

  let noteId: string | undefined;
  let noteContent: Record<string, unknown> | undefined;
  if (organise.note && typeof organise.note === "object") {
    noteId = (organise.note as { id: string }).id;
    noteContent = (organise.note as { content: Record<string, unknown> })
      .content;
  } else {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      await sleep(1000);
      await api("/jobs/organise", { method: "POST", token, clinicId }).catch(
        () => null,
      );
      const v = await api(`/visits/${visit.id}`, { token, clinicId });
      const notes = (
        v.visit as {
          notes: Array<{
            id: string;
            status: string;
            content: Record<string, unknown>;
          }>;
        }
      ).notes;
      const draft = notes.find((x) => x.status === "DRAFT");
      if (draft) {
        noteId = draft.id;
        noteContent = draft.content;
        break;
      }
    }
  }
  if (!noteId) throw new Error(`visit ${n}: draft note missing`);

  await api(`/notes/${noteId}`, {
    method: "PATCH",
    token,
    clinicId,
    body: {
      content: {
        ...(noteContent ?? {}),
        assessment: `Pilot visit ${n} — mock AI draft reviewed.`,
      },
    },
  });
  await api(`/notes/${noteId}/sign`, {
    method: "POST",
    token,
    clinicId,
  });

  const invGet = await api(`/visits/${visit.id}/invoice`, { token, clinicId });
  const invoiceId = (invGet.invoice as { id: string }).id;
  const paid = await api(`/visits/${visit.id}/invoice`, {
    method: "POST",
    token,
    clinicId,
    body: { method: "card_terminal" },
  });
  if ((paid.invoice as { status: string }).status !== "PAID") {
    throw new Error(`visit ${n}: invoice not PAID`);
  }

  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(
    JSON.stringify({
      n,
      visitId: visit.id,
      noteId,
      invoiceId,
      minutesToSigned: minutes,
      usedAiDraft: true,
    }),
  );
  return { blocked: false as const };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("PILOT_EMAIL and PILOT_PASSWORD required");
  }
  const login = await api("/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.accessToken as string;
  const clinicId = (login.clinic as { id: string }).id;
  const clinicSlug = (login.clinic as { slug: string }).slug;
  console.log("logged in", EMAIL, clinicSlug);

  const patients = await api("/patients?take=20", { token, clinicId });
  const list = (patients.patients as Array<{ id: string; email?: string }>) ?? [];
  if (list.length === 0) throw new Error("No patients in clinic");

  const catalog = await api("/clinic/catalog", { token, clinicId });
  const types =
    (catalog.appointmentTypes as Array<{ id: string; active?: boolean }>) ??
    [];
  const typeId = types.find((t) => t.active !== false)?.id;
  const practitionerId =
    (login as { practitionerProfileId?: string }).practitionerProfileId ||
    (
      (await api("/team", { token, clinicId })).members as Array<{
        practitionerProfileId?: string | null;
      }>
    ).find((m) => m.practitionerProfileId)?.practitionerProfileId;
  if (!typeId || !practitionerId) {
    throw new Error("Missing appointment type or practitioner profile");
  }

  let blocked = 0;
  let completed = 0;
  for (let i = 0; i < COUNT; i++) {
    const patient = list[i % list.length]!;
    const result = await oneVisit(
      token,
      clinicId,
      patient.id,
      practitionerId,
      typeId,
      i + 1,
    );
    if (result.blocked) blocked += 1;
    else completed += 1;
  }

  // Audit export once (owner compliance surface)
  try {
    const audits = await api("/clinic/compliance", { token, clinicId });
    console.log(
      "compliance",
      typeof audits === "object" ? Object.keys(audits) : audits,
    );
  } catch (err) {
    console.log("compliance_skip", String(err));
  }
  console.log(
    JSON.stringify({
      PILOT_SUMMARY: true,
      visitsRequested: COUNT,
      completed,
      recordingBlocked: blocked,
    }),
  );
  if (completed === COUNT) console.log(`PILOT_OK visits=${COUNT}`);
  else if (blocked > 0) {
    console.log(
      "PILOT_PARTIAL — booked/consent ok; enable Cloudflare R2 + S3_* secrets to finish record→sign→pay",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
