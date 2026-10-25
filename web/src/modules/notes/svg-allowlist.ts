/**
 * Allowlist SVG sanitiser for clinic anatomy overlays.
 * Rebuilds markup from safe tags/attrs only — never trust blacklist filters.
 *
 * Output contract (React renderer depends on this):
 * - shape tags always self-close: <path … />
 * - only svg/g/title/desc may be paired containers
 * - close tags must match the open stack
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

/** Shape tags are always emitted self-closing (no children). */
const VOID_SHAPE_TAGS = new Set([
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
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
  const stack: string[] = [];
  let elementCount = 0;
  let sawRoot = false;

  for (const tok of tokens) {
    if (tok.type === "text") {
      if (tok.value.trim()) return null;
      continue;
    }
    if (tok.type === "comment") return null;

    const tag = tok.name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return null;

    if (tok.closing) {
      // Exporters often emit </path> after <path/>; ignore redundant void closes
      if (VOID_SHAPE_TAGS.has(tag)) continue;
      if (stack.length === 0 || stack[stack.length - 1] !== tag) return null;
      stack.pop();
      out.push(`</${tag}>`);
      continue;
    }

    // Opening or self-closing
    if (VOID_SHAPE_TAGS.has(tag) || tok.selfClosing) {
      if (tag === "svg") return null;
      if (!sawRoot || stack.length < 1) return null;
      // title/desc must not be forced void via selfClosing unless empty — disallow
      if (tag === "title" || tag === "desc") return null;
      elementCount += 1;
      if (elementCount > MAX_ELEMENTS) return null;
      const attrs = serializeAttrs(tok.attrs);
      if (attrs === null) return null;
      out.push(`<${tag}${attrs} />`);
      continue;
    }

    // Container open: svg | g | title | desc
    if (tag === "svg") {
      if (sawRoot || stack.length !== 0) return null;
      sawRoot = true;
      const attrs = serializeAttrs(tok.attrs, true);
      if (attrs === null) return null;
      const hasViewBox = Object.keys(tok.attrs).some(
        (k) => k.toLowerCase() === "viewbox",
      );
      const vb = hasViewBox ? "" : ' viewBox="0 0 200 360"';
      const ns = Object.keys(tok.attrs).some((k) => k.toLowerCase() === "xmlns")
        ? ""
        : ' xmlns="http://www.w3.org/2000/svg"';
      out.push(`<svg${attrs}${vb}${ns}>`);
      stack.push("svg");
      elementCount += 1;
      continue;
    }

    if (!sawRoot || stack.length < 1) return null;
    if (tag !== "g" && tag !== "title" && tag !== "desc") return null;
    elementCount += 1;
    if (elementCount > MAX_ELEMENTS) return null;
    const attrs = serializeAttrs(tok.attrs);
    if (attrs === null) return null;
    out.push(`<${tag}${attrs}>`);
    stack.push(tag);
  }

  if (!sawRoot || stack.length !== 0) return null;
  const rebuilt = out.join("");
  if (rebuilt.length < 20 || rebuilt.length > MAX_SVG_CHARS) return null;
  return rebuilt;
}

/**
 * True when a sanitised SVG string can be turned into React nodes with the
 * same rules as CustomOverlay (used for parity tests).
 */
export function sanitizedSvgRendersAsReact(svg: string): boolean {
  return parseSanitizedSvgInner(svg) !== null;
}

export type SanitizedSvgNode = {
  tag: string;
  attrs: AttrMap;
  children: SanitizedSvgNode[];
};

/** Parse allowlist output into a simple element tree (no React dependency). */
export function parseSanitizedSvgInner(svg: string): SanitizedSvgNode[] | null {
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const inner = match?.[1] ?? "";
  type Node = SanitizedSvgNode;
  const stack: Node[] = [{ tag: "root", attrs: {}, children: [] }];
  let i = 0;
  while (i < inner.length) {
    const rest = inner.slice(i);
    const close = rest.match(/^<\/\s*([a-z0-9]+)\s*>/i);
    const open = rest.match(
      /^<\s*([a-z0-9]+)((?:\s+[a-z0-9-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/)?\s*>/i,
    );
    if (close) {
      const tag = close[1]!.toLowerCase();
      if (stack.length <= 1) return null;
      const frame = stack.pop()!;
      if (frame.tag !== tag) return null;
      stack[stack.length - 1]!.children.push(frame);
      i += close[0].length;
      continue;
    }
    if (open) {
      const tag = open[1]!.toLowerCase();
      const attrs = parseAttrsStrict(open[2] ?? "");
      if (attrs === null) return null;
      const selfClosing = Boolean(open[3]) || VOID_SHAPE_TAGS.has(tag);
      if (selfClosing) {
        stack[stack.length - 1]!.children.push({ tag, attrs, children: [] });
      } else {
        stack.push({ tag, attrs, children: [] });
      }
      i += open[0].length;
      continue;
    }
    const ws = rest.match(/^\s+/);
    if (ws) {
      i += ws[0].length;
      continue;
    }
    return null;
  }
  if (stack.length !== 1) return null;
  return stack[0]!.children;
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
    if (name.includes(":")) return null;
    const attrStr = m[2] ?? "";
    const attrs = closing ? {} : parseAttrsStrict(attrStr);
    if (attrs === null) return null;
    tokens.push({ type: "tag", name, attrs, closing, selfClosing });
  }
  return tokens;
}

/** Attr parser: must consume from the start; no leading junk. */
function parseAttrsStrict(attrStr: string): AttrMap | null {
  const attrs: AttrMap = {};
  let rest = attrStr;
  while (rest.length) {
    const ws = rest.match(/^\s+/);
    if (ws) {
      rest = rest.slice(ws[0].length);
      if (!rest) break;
    }
    const m = rest.match(
      /^([A-Za-z_][\w.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/,
    );
    if (!m) return null;
    const name = m[1]!.toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (name.includes(":") && name !== "xmlns") return null;
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
    rest = rest.slice(m[0].length);
  }
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
