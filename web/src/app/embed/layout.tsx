import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Minimal layout so clinic sites can iframe without app chrome. */
export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="embed-root">{children}</div>;
}
