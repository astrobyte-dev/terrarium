// Minimal line icons (no emoji, no icon-font dep). stroke=currentColor so they
// inherit theme tokens. Kept in one file so components import by name.
type P = { className?: string }
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const LeafIcon = ({ className }: P) => (
  <svg className={className} {...base}>
    <path d="M12 21c0-6 0-9 6-13-1 6-3 9-6 10Z" />
    <path d="M12 21c0-5-1-8-6-11 1 5 2 8 6 8Z" />
    <path d="M12 21v-3" />
  </svg>
)
export const DashIcon = ({ className }: P) => (
  <svg className={className} {...base}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
)
export const BotIcon = ({ className }: P) => (
  <svg className={className} {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    <path d="M19 3v4M17 5h4" />
  </svg>
)
export const BrainsIcon = ({ className }: P) => (
  <svg className={className} {...base}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M9 3v2M12 3v2M15 3v2M9 19v2M12 19v2M15 19v2M3 9h2M3 12h2M3 15h2M19 9h2M19 12h2M19 15h2" />
  </svg>
)
export const ChatIcon = ({ className }: P) => (
  <svg className={className} {...base}>
    <path d="M4 5h16v11H9l-4 3v-3H4Z" />
  </svg>
)
export const DoctorIcon = ({ className }: P) => (
  <svg className={className} {...base}>
    <path d="M3 12h4l2 5 4-12 2 7h6" />
  </svg>
)
export const PlayIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
)
export const StopIcon = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
)
export const RestartIcon = ({ className }: P) => (
  <svg className={className} {...base} strokeWidth={2}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v4h-4" />
  </svg>
)
export const MinIcon = ({ className }: P) => (
  <svg className={className} {...base} strokeWidth={1.8}>
    <path d="M5 12h14" />
  </svg>
)
export const CloseIcon = ({ className }: P) => (
  <svg className={className} {...base} strokeWidth={1.8}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const BrainIcon = ({ className }: P) => (
  <svg className={className} {...base} strokeWidth={1.6}>
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 5 1 3 3 0 0 0 5-1 3 3 0 0 0 2-5 3 3 0 0 0-2-5 3 3 0 0 0-3-3 3 3 0 0 0-4 0Z" />
  </svg>
)
export const GpuIcon = ({ className }: P) => (
  <svg className={className} {...base} strokeWidth={1.6}>
    <rect x="4" y="7" width="16" height="10" rx="2" />
    <path d="M8 7V5m8 2V5M8 19v-2m8 2v-2" />
  </svg>
)
