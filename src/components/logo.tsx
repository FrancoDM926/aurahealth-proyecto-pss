import Image from "next/image";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M16 27S4.5 20.2 4.5 12.4A6.4 6.4 0 0 1 16 8.8a6.4 6.4 0 0 1 11.5 3.6C27.5 20.2 16 27 16 27Z"
        fill="currentColor"
      />
      <path
        d="M7.5 16.2h3.4l1.7-3.4 2.4 7.1 2-5.1 1.5 3.1h5.9"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLogo({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <Image
        src="/images/aurahealth_logo.png"
        alt="AuraHealth"
        width={40}
        height={40}
        priority
        className={`size-10 shrink-0 rounded-xl object-contain mix-blend-multiply ${markClassName ?? ""}`}
      />
      <span
        className={`text-xl font-bold tracking-tight text-ink ${textClassName ?? ""}`}
      >
        Aura<span className="text-secondary">Health</span>
      </span>
    </span>
  );
}
