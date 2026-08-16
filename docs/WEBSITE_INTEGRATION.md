# Website integration — put Treow booking on a clinic’s site

Replace `YOUR_APP` with your Treow URL (e.g. `https://app.treow.clinic`) and `CLINIC_SLUG` with the clinic slug (demo: `northbank-manual`).

| Surface | URL |
|---------|-----|
| Full booking page | `https://YOUR_APP/book/CLINIC_SLUG` |
| **Embed** (iframe-friendly) | `https://YOUR_APP/embed/CLINIC_SLUG` |
| Staff login | `https://YOUR_APP/login` |
| Privacy notice | `https://YOUR_APP/privacy` |

---

## 1. Simple “Book online” button (recommended first)

Works on WordPress, Squarespace, Wix, Webflow, custom HTML.

```html
<a
  href="https://YOUR_APP/book/CLINIC_SLUG"
  style="display:inline-block;padding:12px 20px;background:#1E3F37;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;"
>
  Book online
</a>
```

Optional: open in a new tab (`target="_blank" rel="noopener"`).

---

## 2. Embed booking on a page (iframe)

Use the **embed** URL so Treow chrome is reduced and framing is allowed.

```html
<iframe
  src="https://YOUR_APP/embed/CLINIC_SLUG"
  title="Book an appointment"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
  style="width:100%;min-height:780px;border:0;border-radius:16px;background:transparent;"
></iframe>
```

### WordPress
1. Edit the page → add a **Custom HTML** block.  
2. Paste the iframe snippet.  
3. Publish.

Some themes need a full-width section; set the block to wide/full if available.

### Squarespace
1. Add a **Code** block on the booking page.  
2. Paste the iframe snippet.  
3. Save.

### Wix
1. Add **Embed Code** / HTML iframe.  
2. Paste the iframe `src` URL or full snippet.  
3. Resize the box tall enough (~780px).

---

## 3. Custom subdomain (optional polish)

Point `book.clinicname.co.uk` → your Treow host (CNAME to Vercel/Fly).  
Then use:

`https://book.clinicname.co.uk/embed/CLINIC_SLUG`

Staff can stay on `https://YOUR_APP/login`.

---

## 4. Build your own booking UI (advanced)

Public API — no staff login:

| Method | Path |
|--------|------|
| GET | `/api/v1/public/clinics/:slug` |
| GET | `/api/v1/public/clinics/:slug/slots?appointmentTypeId=&practitionerId=` |
| POST | `/api/v1/public/clinics/:slug` |

Example slot fetch:

```js
const res = await fetch(
  "https://YOUR_APP/api/v1/public/clinics/CLINIC_SLUG/slots?appointmentTypeId=TYPE_ID&practitionerId=PRAC_ID"
);
const { slots } = await res.json();
```

Booking body shape is documented in `docs/API.md`.

---

## Checklist for the clinic

- [ ] “Book online” on homepage + contact page  
- [ ] Mobile-friendly (button or iframe ≥ 780px tall)  
- [ ] Link to privacy notice if they collect health data on their site too  
- [ ] Confirm test booking appears on Treow **Today**  

---

## Support

Give clinics their slug and URLs from Treow Settings / onboarding.  
Issues embedding? Prefer the **button link** first — zero framing restrictions.
