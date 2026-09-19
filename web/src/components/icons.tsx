/**
 * Small inline icons, drawn rather than pulled from a package: eight glyphs do
 * not justify a dependency, and inline SVG inherits `currentColor` so a theme
 * switch needs nothing extra.
 *
 * Every icon is decorative — each one sits beside a text label — so they are
 * hidden from assistive technology.
 */
type IconProps = { className?: string };

const svg = (path: React.ReactNode, extra?: Record<string, string>) =>
  function Icon({ className = 'h-4 w-4' }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        focusable="false"
        {...extra}
      >
        {path}
      </svg>
    );
  };

export const WalletIcon = svg(
  <>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v1" />
    <path d="M3 8.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
    <path d="M21 10h-4a2 2 0 0 0 0 4h4z" />
  </>,
);

export const ScalesIcon = svg(
  <>
    <path d="M12 4v16" />
    <path d="M6 8h12" />
    <path d="M6 8 3.5 14h5z" />
    <path d="M18 8l-2.5 6h5z" />
  </>,
);

export const ShieldCheckIcon = svg(
  <>
    <path d="M12 3.5 5 6v5.5c0 4 2.9 7.4 7 8.9 4.1-1.5 7-4.9 7-8.9V6z" />
    <path d="m9.2 12.1 1.9 1.9 3.7-3.8" />
  </>,
);

export const CopyIcon = svg(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </>,
);

export const FingerprintIcon = svg(
  <>
    <path d="M12 4a6.5 6.5 0 0 0-6.5 6.5v2" />
    <path d="M18.5 12v-1.5A6.5 6.5 0 0 0 15 4.7" />
    <path d="M8.8 10.8a3.2 3.2 0 0 1 6.4 0V15" />
    <path d="M12 11v5.5" />
    <path d="M5.9 16.5A9 9 0 0 0 7 20" />
    <path d="M15.2 17.5A7 7 0 0 1 14 20" />
  </>,
);

export const CheckCircleIcon = svg(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12 2.4 2.4 4.6-4.8" />
  </>,
);

export const LockIcon = svg(
  <>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </>,
);

export const ActivityIcon = svg(<path d="M3 12h3.5l2.5 6 4-13 2.5 7H21" />);

export const RowsIcon = svg(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M3.5 10h17M3.5 14.5h17" />
  </>,
);

export const SunIcon = svg(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v1.8M12 19.2V21M4.2 12H3M21 12h-1.2M6.3 6.3 5.4 5.4M18.6 18.6l-.9-.9M17.7 6.3l.9-.9M5.4 18.6l.9-.9" />
  </>,
);

export const MoonIcon = svg(<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />);

export const MonitorIcon = svg(
  <>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16.5V20" />
  </>,
);

export const MenuIcon = svg(<path d="M4 7h16M4 12h16M4 17h16" />);

export const CloseIcon = svg(<path d="m6 6 12 12M18 6 6 18" />);

export const ChevronDownIcon = svg(<path d="m6 9.5 6 6 6-6" />);

export const ArrowRightIcon = svg(<path d="M4 12h15m-5.5-5.5L19 12l-5.5 5.5" />);
