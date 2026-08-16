# Treow Clinic — UK compliance posture (beta)

Working checklist for unpaid UK design-partner beta. Not a substitute for legal advice.

## Roles

| Party | Role |
|-------|------|
| Clinic (practice) | **Data controller** for patient health records |
| Treow (software) | **Processor** when hosting the clinic workspace |

## What we ship in product (P2)

| Control | Implementation |
|---------|----------------|
| Privacy notice | Public `/privacy` (version `2026-08-uk-v1`); linked from online booking intake |
| Recording consent | Visit consent before MediaRecorder; optional preference at booking |
| Encryption at rest (audio) | AES-256-GCM local files (`.enc`); key from `AUDIO_ENCRYPTION_KEY` or `AUTH_SECRET` |
| Audio retention | Clinic setting `audioRetentionDays` (default 14); `POST /api/v1/jobs/retention` |
| Audit export | Note view/edit/sign + patient prep access via `GET /api/v1/clinic/compliance?audits=1` |
| RBAC | Reception vs practitioner vs owner: clinical **read and write** (notes, transcripts, prep history, visits) are OWNER/PRACTITIONER only; reception keeps diary, patients directory, waitlist, and money |
| Clinical note confidentiality | Note list/detail omit or gate bodies; prep opens metadata only and loads note text on audited expand; appointment detail has no transcript/note content |
| Region preference | Clinic `dataRegion` default `uk-eu`; prefer UK/EU vendors |

## Operational checklist (clinic + Treow)

### Before first live patient

- [ ] Clinic reviews `/privacy` and adapts wording with their adviser
- [ ] Confirm lawful basis narrative (care + Art. 9(2)(h) via clinic; consent for recording)
- [ ] Set retention days in **Settings** (owners)
- [ ] Set strong `AUTH_SECRET` and dedicated `AUDIO_ENCRYPTION_KEY` in production
- [ ] Prefer UK/EU hosting (e.g. `eu-west-2`) for app DB and object storage when moving off local disk

### Vendor DPAs (sub-processors)

Document each vendor in the clinic’s RoPA / processing record:

| Capability | Default in repo | Production choice | DPA / UK GDPR notes |
|------------|-----------------|-------------------|---------------------|
| Database | Local Postgres | Managed Postgres (UK/EU) | Hosting DPA; encryption at rest |
| Audio storage | Encrypted local `web/storage/` | S3-compatible UK/EU bucket | SSE + bucket policy; no public ACL |
| Email | `EMAIL_PROVIDER=console` | Resend (or similar) with DPA | Transactional only; minimal PHI in body |
| STT / LLM | `AI_PROVIDER=mock` | OpenAI or UK/EU alternative | **DPA signed**; disable training on customer data; prefer EU endpoint if available |
| App hosting | Dev VM | UK/EU region | TLS; access logs retention |

Do **not** enable real STT/LLM for paid patients until the AI vendor DPA is signed and retention of prompts/audio at the vendor is understood.

### Access & security hygiene

- [ ] Unique staff accounts; no shared passwords
- [ ] Owners only change retention / run purge
- [ ] Export audits periodically for incidents / SAR support
- [ ] Incident contact: clinic owner + Treow ops email (set before beta)

## Data retention summary

| Data | Default |
|------|---------|
| Encrypted consultation audio | Clinic-configured days (14); then purged |
| Transcripts & clinical notes | Retained (clinical record) |
| Booking / invoice records | Retained |
| Note audit events | Retained; exportable JSON |

## API surfaces

- `GET/PATCH /api/v1/clinic/compliance` — settings (PATCH: owner)
- `GET /api/v1/clinic/compliance?audits=1` — audit export
- `POST /api/v1/jobs/retention` — purge expired audio (owner)

## Explicitly out of scope for this beta pack

- Full ISO 27001 / Cyber Essentials certification evidence pack
- NHS DSPT / EPR integration
- Automated subject-access request fulfilment UI
- Patient portal self-service erasure

## Sign-off

Legal/privacy review should confirm: controller–processor wording, recording consent UX, sub-processor list, and retention before design-partner go-live.
