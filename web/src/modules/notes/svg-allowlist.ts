/**
 * Allowlist SVG sanitiser for clinic anatomy overlays.
 * Rebuilds markup from safe tags/attrs only — never trust blacklist filters.
 */

const ALLOWED_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "title",
  "desc",
]);

const ALLOWED_ATTRS = new Set([
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "width",
  "height",
  "viewbox",
  "xmlns",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
  "fill-rule",
  "clip-rule",
]);

const MAX_SVG_CHARS = 80_000;
const MAX_ELEMENTS = 400;

type AttrMap = Record<string, string>;

/**
 * Return a rebuilt safe <svg>…</svg> string, or null if the input is unsafe /
 * empty after filtering.
 */
export function sanitizeAnatomySvgAllowlist(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_SVG_CHARS) return null;
  // Force plain text SVG — entity / unicode escapes are a common bypass class
  if (/&#|&lt;|&gt;|&quot;|&apos;|\\u00|\\x[0-9a-f]/i.test(trimmed)) {
    return null;
  }
  if (!/^<svg(\s|>)/i.test(trimmed)) return null;
  if (!/<\/svg>\s*$/i.test(trimmed)) return null;

  const tokens = tokenize(trimmed);
  if (!tokens) return null;

  const out: string[] = [];
  let depth = 0;
  let elementCount = 0;
  let sawRoot = false;

  for (const tok of tokens) {
    if (tok.type === "text") {
      // Only allow whitespace text nodes (no CDATA / scripts as text)
      if (tok.value.trim()) return null;
      continue;
    }
    if (tok.type === "comment") return null;

    const tag = tok.name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return null;

    if (tok.selfClosing || isVoid(tag)) {
      if (tag === "svg") return null;
      elementCount += 1;
      if (elementCount > MAX_ELEMENTS) return null;
      const attrs = serializeAttrs(tok.attrs);
      if (attrs === null) return null;
      out.push(`<${tag}${attrs} />`);
      continue;
    }

    if (tok.closing) {
      if (depth <= 0) return null;
      out.push(`</${tag}>`);
      depth -= 1;
      continue;
    }

    // opening
    if (tag === "svg") {
      if (sawRoot || depth !== 0) return null;
      sawRoot = true;
      const attrs = serializeAttrs(tok.attrs, true);
      if (attrs === null) return null;
      // Force a safe viewBox default if missing
      const hasViewBox = Object.keys(tok.attrs).some(
        (k) => k.toLowerCase() === "viewbox",
      );
      const vb = hasViewBox ? "" : ' viewBox="0 0 200 360"';
      const ns = Object.keys(tok.attrs).some((k) => k.toLowerCase() === "xmlns")
        ? ""
        : ' xmlns="http://www.w3.org/2000/svg"';
      out.push(`<svg${attrs}${vb}${ns}>`);

      depth += 1;
      elementCount += 1;
      continue;
    }

    if (!sawRoot || depth < 1) return null;
    elementCount += 1;
    if (elementCount > MAX_ELEMENTS) return null;
    const attrs = serializeAttrs(tok.attrs);
    if (attrs === null) return null;
    out.push(`<${tag}${attrs}>`);
    depth += 1;
  }

  if (!sawRoot || depth !== 0) return null;
  const rebuilt = out.join("");
  if (rebuilt.length < 20 || rebuilt.length > MAX_SVG_CHARS) return null;
  return rebuilt;
}

function isVoid(_tag: string) {
  return false; // we don't allow void HTML; SVG shapes use self-closing or paired
}

type Token =
  | { type: "text"; value: string }
  | { type: "comment" }
  | {
      type: "tag";
      name: string;
      attrs: AttrMap;
      closing: boolean;
      selfClosing: boolean;
    };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] !== "<") {
      const next = input.indexOf("<", i);
      const value = next === -1 ? input.slice(i) : input.slice(i, next);
      tokens.push({ type: "text", value });
      if (next === -1) break;
      i = next;
      continue;
    }
    if (input.startsWith("<!--", i)) return null;
    if (input.startsWith("<![", i)) return null;
    if (input.startsWith("<?", i)) return null;

    const end = input.indexOf(">", i + 1);
    if (end === -1) return null;
    const raw = input.slice(i + 1, end).trim();
    i = end + 1;

    let closing = false;
    let body = raw;
    if (body.startsWith("/")) {
      closing = true;
      body = body.slice(1).trim();
    }
    const selfClosing = body.endsWith("/");
    if (selfClosing) body = body.replace(/\/\s*$/, "").trim();

    const m = body.match(/^([A-Za-z][\w:-]*)\s*([\s\S]*)$/);
    if (!m) return null;
    const name = m[1]!;
    // Reject namespaced tags (html:script, svg:foreignObject tricks)
    if (name.includes(":")) return null;
    const attrStr = m[2] ?? "";
    const attrs = closing ? {} : parseAttrs(attrStr);
    if (attrs === null) return null;
    tokens.push({ type: "tag", name, attrs, closing, selfClosing });
  }
  return tokens;
}

function parseAttrs(attrStr: string): AttrMap | null {
  const attrs: AttrMap = {};
  if (!attrStr.trim()) return attrs;
  // name="value" | name='value' | name=value
  const re =
    /([A-Za-z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = re.exec(attrStr))) {
    consumed = re.lastIndex;
    const name = match[1]!.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name.includes(":") && name !== "xml:space") {
      // disallow xlink:href etc.
      if (name !== "xmlns") return null;
    }
    if (name.startsWith("on")) return null;
    if (
      name === "href" ||
      name === "xlink:href" ||
      name === "style" ||
      name === "src" ||
      name === "srcset"
    ) {
      return null;
    }
    if (!ALLOWED_ATTRS.has(name) && name !== "xmlns") return null;
    if (/[<>`]/.test(value)) return null;
    if (/javascript:|data:|vbscript:/i.test(value)) return null;
    attrs[name] = value;
  }
  // Ensure we consumed the whole attr string (no stray junk)
  if (attrStr.slice(consumed).trim()) return null;
  return attrs;
}

function serializeAttrs(
  attrs: AttrMap,
  isSvgRoot = false,
): string | null {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(attrs)) {
    const n = name.toLowerCase();
    if (n.startsWith("on")) return null;
    if (!ALLOWED_ATTRS.has(n) && !(isSvgRoot && n === "xmlns")) return null;
    // Numeric / path-safe values only for geometry; fill/stroke limited
    if ((n === "fill" || n === "stroke") && /url\s*\(/i.test(value)) {
      return null;
    }
    parts.push(` ${n}="${escapeAttr(value)}"`);
  }
  return parts.join("");
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
