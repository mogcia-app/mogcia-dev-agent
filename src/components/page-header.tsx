import Image from "next/image";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  imageSrc = "/m-dev-2.png"
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  imageSrc?: string;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-[#F0E7E9] bg-white/85 p-5 shadow-[0_18px_45px_rgba(142,91,96,0.07)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Image alt="" className="h-20 w-20 object-contain" height={112} priority src={imageSrc} width={112} />
        <div>
          <h2 className="text-3xl font-bold text-[#2B2B2B]">{title}</h2>
          <p className="mt-2 text-sm font-semibold text-[#777]">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </header>
  );
}
