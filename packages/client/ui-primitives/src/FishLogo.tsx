import type { IconProps } from './icons/props.ts'

/** Native viewBox of {@link FISH_LOGO_PATH} (width and height in user units). */
export const FISH_LOGO_VIEWBOX = { width: 23.16, height: 17.04 }

/** The brand mark silhouette path data, exported for consumers that compose their own svg around the same geometry. */
export const FISH_LOGO_PATH = 'M4 2.5C4 1.67 4.67 1 5.5 1H6.5C7.33 1 8 1.67 8 2.5V6.5H15.16V2.5C15.16 1.67 15.83 1 16.66 1H17.66C18.49 1 19.16 1.67 19.16 2.5V14.54C19.16 15.37 18.49 16.04 17.66 16.04H16.66C15.83 16.04 15.16 15.37 15.16 14.54V10.5H8V14.54C8 15.37 7.33 16.04 6.5 16.04H5.5C4.67 16.04 4 15.37 4 14.54Z'

/**
 * Render the brand logo.
 * @param props.size - width in px (default 24; height keeps the 23.16:17.04 ratio).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={(size * FISH_LOGO_VIEWBOX.height) / FISH_LOGO_VIEWBOX.width}
      className={className}
      viewBox={`0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <path d={FISH_LOGO_PATH} fill="currentColor" />
    </svg>
  )
}
