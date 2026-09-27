/**
 * Every page behind the rail is `force-dynamic`, so a click waits on Postgres
 * before React holds anything to render — and with no boundary here the browser
 * simply stayed on the page you were leaving, for seconds, with nothing said.
 * This is that boundary: the door now opens at once onto a skeleton of the
 * shape that is coming.
 *
 * It is deliberately shapeless beyond a heading and some rows. Every door lands
 * on a heading and a list of some kind, and a skeleton that guessed each page
 * exactly would be five files to keep in step with five pages.
 *
 * `aria-hidden`, and no text: boxes are nothing to read out, and the state is
 * already announced where it belongs, on the door being waited for. A message
 * here would also need a locale, which a `loading.tsx` is not handed.
 */
export default function Loading() {
  return (
    <section aria-hidden="true" className="rise">
      <div className="shimmer h-8 w-48 rounded-lg" style={{ backgroundColor: "var(--paper-raised)" }} />
      <div className="mt-8 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="shimmer rounded-(--radius-panel)"
            style={{
              backgroundColor: "var(--paper-raised)",
              height: "4.5rem",
              opacity: 1 - i * 0.18,
            }}
          />
        ))}
      </div>
    </section>
  );
}
