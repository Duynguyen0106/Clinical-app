/** Copy-paste snippets for putting Treow booking on a clinic website. */

export function normalizeAppBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

export function getWebsiteSnippets(args: {
  appBaseUrl: string;
  slug: string;
  clinicName?: string;
  brandColour?: string | null;
}) {
  const base = normalizeAppBaseUrl(args.appBaseUrl);
  const slug = args.slug.trim();
  const colour = args.brandColour?.trim() || "#1E3F37";
  const bookUrl = `${base}/book/${slug}`;
  const embedUrl = `${base}/embed/${slug}`;
  const loginUrl = `${base}/login`;

  const buttonHtml = `<a
  href="${bookUrl}"
  style="display:inline-block;padding:12px 20px;background:${colour};color:#fff;text-decoration:none;border-radius:999px;font-weight:600;"
>
  Book online
</a>`;

  const iframeHtml = `<iframe
  src="${embedUrl}"
  title="Book an appointment${args.clinicName ? ` — ${args.clinicName}` : ""}"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
  style="width:100%;min-height:780px;border:0;border-radius:16px;background:transparent;"
></iframe>`;

  return {
    bookUrl,
    embedUrl,
    loginUrl,
    buttonHtml,
    iframeHtml,
  };
}
