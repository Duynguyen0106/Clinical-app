import Image from "next/image";
import { BRAND } from "@/modules/config/brand";

type Props = {
  variant?: "full" | "mark" | "word";
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  variant = "full",
  className = "",
  priority = false,
}: Props) {
  if (variant === "word") {
    return (
      <span className={`brand-word ${className}`.trim()}>{BRAND.shortName}</span>
    );
  }

  const src = variant === "mark" ? BRAND.logo.mark : BRAND.logo.trim;
  const size =
    variant === "mark"
      ? { width: 48, height: 32 }
      : { width: 280, height: 280 };

  return (
    <Image
      src={src}
      alt={BRAND.name}
      width={size.width}
      height={size.height}
      className={`brand-logo brand-logo-${variant} ${className}`.trim()}
      priority={priority}
    />
  );
}
