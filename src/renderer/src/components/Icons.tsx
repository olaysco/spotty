interface IconProps {
  size?: number;
  className?: string;
}

function svg(path: JSX.Element, { size = 16, className }: IconProps, viewBox = '0 0 24 24'): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const PlayIcon = (p: IconProps): JSX.Element => svg(<path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.04 1.04 0 0 0 0-1.76l-11-6.86A1.04 1.04 0 0 0 8 5.14Z" />, p);

export const PauseIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <rect x="6" y="4" width="4.5" height="16" rx="1.2" />
      <rect x="13.5" y="4" width="4.5" height="16" rx="1.2" />
    </>,
    p
  );

export const NextIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M5 5.5v13c0 .77.84 1.25 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 5 5.5Z" />
      <rect x="17" y="5" width="3" height="14" rx="1" />
    </>,
    p
  );

export const PrevIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M19 5.5v13c0 .77-.84 1.25-1.5.86l-10-6.5a1 1 0 0 1 0-1.72l10-6.5A1 1 0 0 1 19 5.5Z" />
      <rect x="4" y="5" width="3" height="14" rx="1" />
    </>,
    p
  );

export const GearIcon = (p: IconProps): JSX.Element =>
  svg(
    <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm9.4 3.5a7.5 7.5 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L16.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z" transform="translate(-1.5 0) scale(0.95)" />,
    p
  );

export const CloseIcon = (p: IconProps): JSX.Element =>
  svg(<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z" />, p);

export const MinusIcon = (p: IconProps): JSX.Element => svg(<rect x="5" y="11" width="14" height="2.4" rx="1.2" />, p);

export const NoteIcon = (p: IconProps): JSX.Element =>
  svg(<path d="M9 3v10.55A4 4 0 1 0 11 17V7h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H9Z" />, p);

export const VolumeIcon = (p: IconProps): JSX.Element =>
  svg(
    <path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Zm-2.5-8.8v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z" />,
    p
  );

export const SpotifyIcon = (p: IconProps): JSX.Element =>
  svg(
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.3 14.5a.62.62 0 0 1-.86.21c-2.36-1.44-5.33-1.77-8.83-.97a.62.62 0 1 1-.28-1.22c3.83-.87 7.11-.49 9.76 1.12.3.18.39.57.21.86Zm1.23-2.86a.78.78 0 0 1-1.07.26c-2.7-1.66-6.82-2.14-10-1.17a.78.78 0 1 1-.46-1.5c3.65-1.1 8.18-.57 11.28 1.34.36.23.48.7.25 1.07Zm.11-2.97c-3.24-1.93-8.59-2.1-11.69-1.16a.94.94 0 1 1-.54-1.79c3.55-1.08 9.46-.87 13.19 1.34a.94.94 0 0 1-.96 1.61Z" />,
    p
  );

export const PinIcon = ({ filled = false, ...p }: IconProps & { filled?: boolean }): JSX.Element =>
  svg(
    filled ? (
      <path d="M14 4v6l2 2v2h-5v6l-1 1-1-1v-6H4v-2l2-2V4H5V2h14v2h-5Z" transform="translate(2.5 0)" />
    ) : (
      <path
        d="M14 4v6l2 2v2h-5v6l-1 1-1-1v-6H4v-2l2-2V4H5V2h14v2h-5Zm-6 0v6.83L6.83 12h10.34L16 10.83V4H8Z"
        transform="translate(2.5 0)"
        fillRule="evenodd"
      />
    ),
    p
  );
