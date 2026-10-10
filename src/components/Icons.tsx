// Small stroke icons in one consistent hand: 24px grid, 1.8px rounded strokes, currentColor.

type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const MicIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

export const PageIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6 3.5h8.5L18.5 7.5V20.5H6z" />
    <path d="M14.5 3.5v4h4M9 11.5h6.5M9 14.5h6.5M9 17.5h4" />
  </svg>
);

export const TallyIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6 5v14M10 5v14M14 5v14M18 5v14M3.5 15.5 20.5 8.5" />
  </svg>
);

export const HintIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M9.2 9.3a2.9 2.9 0 1 1 4.1 2.6c-.8.4-1.3 1-1.3 1.9v.7" />
    <circle cx="12" cy="17.6" r=".6" fill="currentColor" />
    <path d="M12 2.8a9.2 9.2 0 1 0 .01 0" />
  </svg>
);

export const RepeatIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9M19.5 4.5V9H15" />
    <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15M4.5 19.5V15H9" />
  </svg>
);

export const SkipIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 6l8 6-8 6zM17.5 6v12" />
  </svg>
);

export const ShrugIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 15.5h7M9 9.5h.01M15 9.5h.01" />
  </svg>
);

export const StopIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);

export const NextIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" />
  </svg>
);

export const ExplainIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5.5h16v10H11l-4.5 3.5v-3.5H4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);

export const CalendarIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="4" y="5.5" width="16" height="14" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </svg>
);

export const CameraIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4z" />
    <circle cx="12" cy="13.2" r="3.4" />
  </svg>
);

export const PasteIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M9 4.5h6v2.5H9z" />
    <path d="M15 5.5h3v15H6v-15h3M9 11h6M9 14h6M9 17h4" />
  </svg>
);

export const FileIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 15v4.5h14V15" />
  </svg>
);

export const TrashIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />
  </svg>
);

export const ArrowIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12h13M12.5 6.5 18 12l-5.5 5.5" />
  </svg>
);

export const KeyboardIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="6" width="18" height="12" rx="2.5" />
    <path d="M7 10h.01M10.3 10h.01M13.7 10h.01M17 10h.01M8 14h8" />
  </svg>
);
