"use client";

import { use } from "react";
import { PublicBookingFlow } from "@/components/PublicBookingFlow";

type Props = { params: Promise<{ slug: string }> };

/** Compact booking UI for iframe embeds on clinic websites. */
export default function EmbedBookingPage({ params }: Props) {
  const { slug } = use(params);
  return <PublicBookingFlow slug={slug} embed />;
}
