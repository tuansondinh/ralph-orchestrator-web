export function PixelCat() {
  return (
    <div
      aria-hidden="true"
      className="ralph-pixel-cat-wrap pointer-events-none fixed top-1.5 -right-14 z-40 origin-top-right select-none sm:top-2 sm:-right-20"
      data-testid="pixel-cat"
    >
      <svg
        className="ralph-pixel-cat h-[84px] w-[126px] sm:h-[98px] sm:w-[147px]"
        shapeRendering="crispEdges"
        viewBox="0 0 96 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect fill="#1e293b" height="8" width="96" x="0" y="56" />
        <rect fill="#334155" height="4" width="92" x="2" y="56" />

        <g className="ralph-pixel-cat-tail">
          <rect fill="#f97316" height="4" width="4" x="8" y="36" />
          <rect fill="#f97316" height="4" width="4" x="4" y="40" />
          <rect fill="#f97316" height="4" width="8" x="4" y="44" />
          <rect fill="#ea580c" height="4" width="4" x="4" y="44" />
        </g>

        <rect fill="#f97316" height="16" width="44" x="16" y="32" />
        <rect fill="#fdba74" height="8" width="24" x="24" y="36" />
        <rect fill="#ea580c" height="16" width="4" x="28" y="32" />
        <rect fill="#ea580c" height="16" width="4" x="40" y="32" />

        <rect fill="#f97316" height="20" width="24" x="56" y="24" />
        <rect fill="#f97316" height="4" width="4" x="60" y="20" />
        <rect fill="#f97316" height="4" width="4" x="72" y="20" />
        <rect fill="#fb923c" height="8" width="12" x="62" y="28" />

        <g className="ralph-pixel-cat-eyes">
          <rect fill="#0f172a" height="4" width="4" x="62" y="32" />
          <rect fill="#0f172a" height="4" width="4" x="70" y="32" />
        </g>
        <rect fill="#fda4af" height="4" width="4" x="66" y="36" />

        <rect fill="#f59e0b" height="4" width="8" x="20" y="48" />
        <rect fill="#f59e0b" height="4" width="8" x="44" y="48" />
      </svg>
    </div>
  )
}
