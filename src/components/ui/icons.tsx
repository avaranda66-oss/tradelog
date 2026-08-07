import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
  ...props,
});

export const IconSync = (p: IconProps) => (
  <svg {...base(p)}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
);
export const IconJournal = (p: IconProps) => (
  <svg {...base(p)}><rect x="5" y="3" width="14" height="18" /><path d="M9 7h6M9 11h6M9 15h4" /></svg>
);
export const IconUpload = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
);
export const IconChart = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 21h18" /><path d="M6 21v-8M11 21V5M16 21v-11M21 21v-4" /></svg>
);
export const IconMic = (p: IconProps) => (
  <svg {...base(p)}><rect x="9" y="3" width="6" height="11" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconCamera = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="7" width="18" height="13" /><path d="M8 7l2-3h4l2 3" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const IconVideo = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="6" width="13" height="12" /><path d="M16 10l5-3v10l-5-3" /></svg>
);
export const IconSettings = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></svg>
);
export const IconTarget = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
);
export const IconScale = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3v18M5 7l7-4 7 4" /><path d="M3 13l2-6 2 6a3.5 3.5 0 0 1-4 0ZM17 13l2-6 2 6a3.5 3.5 0 0 1-4 0Z" /></svg>
);
export const IconClock = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconArrowUp = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const IconArrowDown = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
export const IconDash = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
);
export const IconTerminal = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" /><path d="M7 9l3 3-3 3M12 15h5" /></svg>
);
export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 12.5l5 5L20 6.5" /></svg>
);
export const IconAlert = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3L2 21h20L12 3Z" /><path d="M12 10v4M12 17.5v.5" /></svg>
);
export const IconFile = (p: IconProps) => (
  <svg {...base(p)}><path d="M6 2h9l4 4v16H6V2Z" /><path d="M15 2v4h4" /></svg>
);
