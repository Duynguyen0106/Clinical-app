"use client";

import { use } from "react";
import { PublicBookingFlow } from "@/components/PublicBookingFlow";

type Props = { params: Promise<{ slug: string }> };

export default function BookingPage({ params }: Props) {
  const { slug } = use(params);
  return <PublicBookingFlow slug={slug} />;
}
