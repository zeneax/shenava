# The colours are measured, and nothing in the build measures them

**Symptom.** Nobody reports a contrast ratio. What gets reported is "the
application is too dark", and that sentence has at least three causes which feel
identical to the person saying it and need different fixes:

1. There is no way to choose an edition, so the operating system decides and a
   reader in dark mode never sees the light one whatever its colours are.
2. The light ground is not light — beige at L\* 89 reads as dim next to any
   other window, however calm it looks on its own.
3. The ground is fine and the TEXT on it is too pale to read.

The third is the one that hides. `--ink-faint` sat at 2.83:1 against the light
ground for the life of this project, `--warm` at 3.12:1 and `--cool` at 4.34:1 —
three of five colour roles below the 4.5:1 that ordinary body text needs — while
`--ink` at 11.49:1 made every screenshot look fine. `--ink-faint` is what about
a hundred captions, chips and hints in this application are written in.

**What it was.** The palette was designed as a set of colours and never checked
as a set of PAIRS. A role is only readable against a particular surface, and
this design has three surfaces per edition: the ground, the raised panel and the
sunken well. Nine roles times three surfaces is twenty-seven pairs per edition,
and the worst of them is the one that decides whether a value is usable.

The two that bite are the ones nobody pictures. In the light edition the worst
surface is the SUNKEN well — darker than the ground — so `--ink-faint` has to be
set for the well and then looks needlessly dark against the page. In the dark
edition it inverts: the worst surface is the RAISED panel, the lightest thing
there, so `--ink-faint` has to be set for the panel. A value chosen by eye
against the ground fails on one surface in each edition, every time.

**Why nothing could have told you.** `tsc` does not read CSS. The tests do not
render. Tailwind has no opinion about whether two of your tokens can be seen
together. A screenshot taken on a bright laptop at full brightness shows a
palette that is unreadable on a dimmer screen, which is where most of this
application is actually read.

**The command that finds it again.** Paste the tokens from `globals.css` in and
run it. It prints the worst pairing in each edition, which is the only number
that matters.

```bash
python3 - <<'PY'
def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def L(h):
    h = h.lstrip("#"); r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
def ratio(a, b):
    la, lb = L(a), L(b); hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

EDITIONS = {
  "light": (
    {"paper": "#faf6ee", "raised": "#ffffff", "sunken": "#f0eadd"},
    {"ink": "#20242a", "ink-soft": "#4a515b", "ink-faint": "#646a73",
     "cool": "#1d6360", "warm": "#8b5010", "good": "#2f6b37", "bad": "#9c3628"},
  ),
  "dark": (
    {"paper": "#22252a", "raised": "#2b2f35", "sunken": "#1a1d21"},
    {"ink": "#e6e1d8", "ink-soft": "#b0aca4", "ink-faint": "#99958d",
     "cool": "#7cbdb7", "warm": "#e0a866", "good": "#7fba86", "bad": "#e08a79"},
  ),
}
for name, (surfaces, roles) in EDITIONS.items():
    worst, where = 99, ""
    for role, fg in roles.items():
        for surface, bg in surfaces.items():
            r = ratio(fg, bg)
            if r < worst: worst, where = r, f"{role} on {surface}"
    flag = "ok" if worst >= 4.5 else "BELOW 4.5:1"
    print(f"{name:<6} worst pairing: {where:<22} {worst:.2f}:1  {flag}")
PY
```

Both editions must print `ok`. A role that only clears on the ground is a role
that will be unreadable somewhere on the page, and which surface it fails on
depends on the edition, so check both before believing either.

**What the ratios do not cover.** Size. Persian letterforms spend on dots and
loops what a Latin face spends on nothing, so 12px Persian is smaller than 12px
English in every way that matters, and the contrast of a string it is too small
to resolve is beside the point. The type scale lives in the `@theme` block of
`globals.css` for that reason — redefining `--text-sm` there moves all 114 of
this application's `text-sm` strings at once, which is the only way a change
like that stays consistent.
