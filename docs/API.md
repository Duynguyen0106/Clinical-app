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

**Demo:** `alex@northbank.example` / `treow-demo`

## Clinic catalog

| GET | `/clinic/catalog` | Appointment types, practitioners, locations |

## Patients

| GET | `/patients?q=&take=` | Search / list |
| POST | `/patients` | Create |
| GET | `/patients/:id` | Profile + timeline |
| PATCH | `/patients/:id` | Update |
| POST | `/patients/:id/consents` | `{ type, granted, method }` |

## Appointments

| GET | `/appointments?from=&to=&practitionerId=` | Calendar range |
| POST | `/appointments` | Create (conflict-checked) |
| GET | `/appointments/:id` | Detail + visit |
| PATCH | `/appointments/:id` | `{ status }` or `{ startsAt }` |

## Visits (AI note pipeline)

| POST | `/visits` | `{ appointmentId }` → start / resume visit |
| GET | `/visits/:id` | Visit detail |
| POST | `/visits/:id/consent` | `{ granted: true, method }` |
| POST | `/visits/:id/recording` | Start recording |
| POST | `/visits/:id/recording/upload` | multipart `audio` file |
| PATCH | `/visits/:id/recording` | Stop → STT → template organise → draft |

## Public booking

| GET | `/public/clinics/:slug` | Clinic booking catalog |
| GET | `/public/clinics/:slug/slots?appointmentTypeId=&practitionerId=` | Next available slots |
| POST | `/public/clinics/:slug` | Book online |

## Notes

| GET | `/notes?status=DRAFT` | List |
| GET | `/notes?templates=1` | Templates |
| GET | `/notes/:id` | Detail (+ audit view event) |
| PATCH | `/notes/:id` | Update draft `{ content }` |
| POST | `/notes/:id/sign` | Sign & lock |

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
