# Treow Clinic API (v1)

Base URL: `/api/v1`  
Auth: `Authorization: Bearer <accessToken>`  
Optional clinic switch: `X-Clinic-Id: <clinicId>`

## Auth

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/auth/login` | `{ email, password, clinicSlug? }` | Returns `accessToken` |
| DELETE | `/auth/login` | — | Logout (Bearer required) |
| GET | `/auth/me` | — | Current user + clinic |

**Demo:** `alex@northbank.example` (owner) · `jordan@northbank.example` (practitioner) · `reception@northbank.example` — password `treow-demo`

| GET | `/clinic/booking` | Online booking policy (notice, deposits) |
| PATCH | `/clinic/booking` | Owner: update booking policy |
| POST | `/public/deposits` | `{ appointmentId }` start deposit checkout (console pays immediately; stripe returns URL) |

## Patients

| GET | `/patients?q=&take=` | Search / list |
| POST | `/patients` | Create |
| GET | `/patients/:id` | Profile + booking timeline (note **metadata only**, no clinical bodies) |
| GET | `/patients/:id?prep=1&source=` | Prep pack (logs `prep_opened`). Reception: bookings/alerts only. Clinicians: note stubs; bodies load on expand |
| POST | `/patients/:id` | Clinician: `{ action: "note_expanded", noteId, source? }` — returns note sections + audits disclosure |
| PATCH | `/patients/:id` | Update |
| POST | `/patients/:id/consents` | `{ type, granted, method }` |

## Appointments

| GET | `/appointments?from=&to=&practitionerId=` | Calendar range (includes `room`) |
| POST | `/appointments` | Create `{ patientId, practitionerId, appointmentTypeId, startsAt, durationMinutes?, feeCents?, notes? }` — conflict + hours/block checked; optional invoice; confirmation email |
| GET | `/appointments/:id` | Detail + visit pointers (no note bodies / transcripts) |
| PATCH | `/appointments/:id` | `{ status }`, `{ startsAt }`, `{ durationMinutes }`, `{ appointmentTypeId }`, `{ additionalFeeCents, feeNote? }`, `{ notes }` |
| GET | `/slots?appointmentTypeId=&practitionerId=&durationMinutes=&days=` | Staff open slots (honours weekly hours + blocks) |

## Blocks (diary unavailable)

| GET | `/blocks?from=&to=&practitionerId=` | List blocked periods |
| POST | `/blocks` | `{ practitionerId, date: YYYY-MM-DD, startMinute?, endMinute?, reason? }` — omit minutes for all-day |
| DELETE | `/blocks/:id` | Remove block |

Blocks remove time from online + staff slot search.

## Patient self-serve

| GET | `/public/manage?token=&slots=1` | Appointment (+ optional slots) via signed link |
| POST | `/public/manage` | `{ action: "cancel"\|"reschedule", token, startsAt? }` — closes within 2h of start |

Manage links are emailed/SMS’d on confirmation and reminders. UI: `/book/manage/[token]`.

## Rooms (resources)

| GET | `/rooms` | List treatment rooms / couches |
| POST | `/rooms` | Create `{ name, locationId?, colour? }` |
| PATCH | `/rooms/:id` | Update / deactivate |

Bookings conflict-check **practitioner and room**. Online book auto-picks the first free room.

## Team (practitioners)

| GET | `/team` | Practitioners + weekly availability |
| POST | `/team` | Owner: add practitioner `{ email, name, password, displayName, colour?, availability? }` |
| PATCH | `/team/:id` | Owner: `{ displayName?, colour?, active? }` |
| PUT | `/team/:id/availability` | Owner: replace weekly rules `{ rules: [{ dayOfWeek, startMinute, endMinute }] }` |

Default new clinician hours: Mon–Fri 09:00–17:00. UI: `/app/team`.

## Visits (AI note pipeline)

| POST | `/visits` | `{ appointmentId }` → start / resume visit |
| GET | `/visits/:id` | Visit detail (clinician) — includes notes + transcript |
| POST | `/visits/:id/consent` | `{ granted: true, method }` |
| POST | `/visits/:id/recording` | Start recording |
| POST | `/visits/:id/recording/upload` | multipart `audio` file |
| GET | `/visits/:id/rebook` | Suggest follow-up slots from Plan (clinician) |
| POST | `/visits/:id/rebook` | Book follow-up `{ startsAt }` (clinician) |
| POST | `/jobs/reminders` | Email + SMS reminders (staff) |
| POST | `/jobs/retention` | Purge expired encrypted audio (owner) |

## Waitlist & ops

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Liveness (no auth); DB check |
| GET | `/waitlist?status=` | Queue (excludes cancelled by default) |
| POST | `/waitlist` | Add `{ patientId, appointmentTypeId, practitionerId? }` |
| POST | `/waitlist/:id` | `{ action: "accept" \| "decline" }` for offers |
| DELETE | `/waitlist/:id` | Remove from waitlist |
| GET | `/ops/tasks` | Unsigned notes, unpaid invoices, missing intake |
| GET | `/ops/pulse` | Week utilisation, rebook %, unsigned, unpaid, new/return |
| GET | `/ops/support` | Support email + launch pointers (staff) |

Cancelling an appointment (`PATCH /appointments/:id` with `status: CANCELLED`) auto-offers the freed slot to the next matching waitlist entry (email + `OFFERED` status).

## Compliance (UK)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/clinic/compliance` | Retention days, privacy notice version, data region |
| GET | `/clinic/compliance?audits=1&from=&to=&patientId=` | Note views + patient prep access export (JSON) |
| PATCH | `/clinic/compliance` | `{ audioRetentionDays }` — owner only |

Public privacy notice: `/privacy`. Booking intake links to it.

Roles (enforced on routes): **OWNER** / **PRACTITIONER** for clinical **read and write** (notes, visits, prep note bodies, rebook from plan); **OWNER** / **RECEPTION** for invoice pay; staff for patients directory & diary.

## Public booking

| GET | `/public/clinics/:slug` | Clinic booking catalog |
| GET | `/public/clinics/:slug/slots?appointmentTypeId=&practitionerId=` | Next available slots |
| POST | `/public/clinics/:slug` | Book online |

**Website pages:** `/book/:slug` (full) · `/embed/:slug` (iframe for clinic sites). See `docs/WEBSITE_INTEGRATION.md`.

## Notes

| GET | `/notes?status=DRAFT&practitionerId=` | List metadata only (clinician; **no content**). Practitioners default to their own visit notes |
| GET | `/notes?templates=1` | Templates (clinician) |
| GET | `/notes/:id` | Full note + audit `viewed` (clinician) |
| GET | `/notes/:id/document?kind=clinical_note\|gp_letter` | Printable signed note / GP letter with clinic letterhead, practitioner registration, signed-by, full date/time, note ref (clinician) |
| PATCH | `/notes/:id` | Update draft `{ content }` (clinician) |
| POST | `/notes/:id/sign` | Sign & lock (clinician) |

## Invoices (mark paid only)

| GET | `/invoices?status=` | List |
| POST | `/invoices` | Create (GBP) |
| POST | `/invoices/:id/pay` | Mark paid `{ method }` |
| DELETE | `/invoices/:id/pay` | Mark unpaid |

## Setup

```bash
cd web
# ensure Postgres + DATABASE_URL
npx prisma db push
npm run db:seed
npm run dev
```

`AI_PROVIDER=mock` (default) or `openai` with `OPENAI_API_KEY` for Whisper + structured notes.

Audio at rest is AES-256-GCM encrypted; set `AUDIO_ENCRYPTION_KEY` (or rely on `AUTH_SECRET`). See `docs/UK_COMPLIANCE.md`.
