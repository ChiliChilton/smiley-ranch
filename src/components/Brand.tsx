/** The family's HK brand: an H whose right post is also the K's stem. Drawn in the current text color. */
export function Brand({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size * 1.2} height={size} viewBox="0 0 120 100" className={className} aria-label="HK brand" role="img">
      <g stroke="currentColor" strokeWidth="10" fill="none" strokeLinecap="butt" strokeLinejoin="miter">
        <path d="M15 4v92M61 4v92M15 50h46M62 52L112 7M62 52l50 45" />
      </g>
    </svg>
  )
}
