/**
 * The hero's one moving part: a row of bars that resolves into lines of text.
 *
 * It is the product in one picture — audio on one side, words on the other —
 * so it is worth the forty lines. Pure CSS: the bars carry the `bar` keyframe
 * with a stagger, the lines fade in on a delay. Nothing here runs JavaScript,
 * so it costs nothing and works before hydration.
 *
 * Every bar height is fixed rather than random: a random set changes on every
 * render and a re-render then reads as a glitch.
 */
const HEIGHTS = [
  28, 46, 22, 64, 38, 80, 52, 34, 70, 44, 26, 58, 88, 40, 30, 62, 48, 24, 74, 36,
];

export function Waveform() {
  return (
    <div
      aria-hidden
      className="flex items-center gap-8 overflow-hidden"
      style={{ position: "relative" }}
    >
      <div className="flex h-24 shrink-0 items-center gap-[3px]">
        {HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="bar w-[3px] rounded-full"
            style={{
              height: `${h}%`,
              background: "var(--warm)",
              animationDelay: `${i * 0.055}s`,
              opacity: 0.55 + (h / 100) * 0.45,
            }}
          />
        ))}
      </div>

      <svg
        className="h-5 w-5 shrink-0 flip"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-faint)"
        strokeWidth="1.5"
      >
        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
        {[100, 84, 92, 66].map((w, i) => (
          <span
            key={i}
            className="rise h-[7px] rounded-full"
            style={{
              width: `${w}%`,
              background: "var(--cool)",
              opacity: 0.4,
              animationDelay: `${0.5 + i * 0.13}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
