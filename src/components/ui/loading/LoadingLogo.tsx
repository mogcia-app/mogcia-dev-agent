import Image from "next/image";

export function LoadingLogo({
  size = "md",
  imageSrc = "/m-dev-o.png"
}: {
  size?: "sm" | "md" | "lg";
  imageSrc?: string;
}) {
  const dimensions = size === "lg" ? "h-28 w-28" : size === "sm" ? "h-14 w-14" : "h-20 w-20";

  return (
    <div className={`mogcia-loading-logo relative ${dimensions}`} aria-hidden="true">
      <Image alt="" className="h-full w-full object-contain drop-shadow-[0_16px_28px_rgba(244,95,122,0.18)]" height={140} priority={size === "lg"} src={imageSrc} width={140} />
      <span className="mogcia-loading-antenna absolute left-1/2 top-[8%] h-2 w-2 -translate-x-1/2 rounded-none bg-[#F45F7A]" />
    </div>
  );
}
