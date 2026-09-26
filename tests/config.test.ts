import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SETTING_DEFAULTS } from "../src/lib/settings-shape.ts";
import { PRICES } from "../src/lib/llm/pricing.ts";

/**
 * The gap between a schema and the form that posts to it.
 *
 * A Zod object rejects the WHOLE payload, not the one missing key. So a required
 * key added to the save schema and forgotten in the form's call makes every save
 * on that screen fail — and the symptom is never the new field, it is "could not
 * save" on a card that worked yesterday. The types do not catch it: a server
 * action takes `unknown` at the boundary.
 *
 * These read the source and compare it, which is the only way to see it without
 * a browser.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function schemaFields(source: string): string[] {
  const start = source.indexOf(".object({");
  const end = source.indexOf("  .strict();");
  assert.ok(start > 0 && end > start, "the settings schema is not shaped as expected");
  return [...source.slice(start, end).matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]!);
}

test("every field in the settings schema is sent by the form", () => {
  const fields = schemaFields(read("src/lib/actions/settings.ts"));
  assert.ok(fields.length >= 12, `only found ${fields.length} fields`);
  const form = read("src/components/settings/settings-form.tsx");
  const posted = form.slice(form.indexOf("useState<SettingsInput>({"), form.indexOf("  const [issues"));
  for (const field of fields) {
    assert.ok(new RegExp(`\\b${field}:`).test(posted), `the form never sends ${field}`);
  }
});

test("the settings schema is strict, so an unknown key is refused and not dropped", () => {
  // Dropped silently is the worse failure: the column keeps its old value and
  // the screen reports success.
  assert.match(read("src/lib/actions/settings.ts"), /\.strict\(\);/);
});

test("the save returns the parse's own issues, not a generic message", () => {
  const source = read("src/lib/actions/settings.ts");
  assert.match(source, /issues: parsed\.error\.issues\.map/);
  assert.match(source, /path: issue\.path\.join/);
  assert.match(source, /code: issue\.code/);
});

test("every field in the schema has a label in both editions", () => {
  const fields = schemaFields(read("src/lib/actions/settings.ts"));
  for (const lang of ["fa", "en"] as const) {
    const messages = JSON.parse(read(`messages/${lang}.json`)) as {
      settings: { field: Record<string, string> };
    };
    for (const field of fields) {
      assert.ok(messages.settings.field[field], `${lang}.json has no label for ${field}`);
    }
  }
});

test("both catalogues hold exactly the same keys", () => {
  const keys = (value: unknown, prefix = ""): string[] => {
    if (typeof value !== "object" || value === null) return [prefix];
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      keys(v, prefix ? `${prefix}.${k}` : k),
    );
  };
  const fa = new Set(keys(JSON.parse(read("messages/fa.json"))));
  const en = new Set(keys(JSON.parse(read("messages/en.json"))));
  const onlyFa = [...fa].filter((k) => !en.has(k));
  const onlyEn = [...en].filter((k) => !fa.has(k));
  assert.deepEqual(onlyFa, [], "keys only in fa.json");
  assert.deepEqual(onlyEn, [], "keys only in en.json");
  assert.ok(fa.size > 200, `only ${fa.size} keys`);
});

test("no Persian string carries a Unicode bidi mark", () => {
  // They print as literal boxes in some surfaces and are never a deliberate
  // choice: they arrive as a reflex around an inline Latin term.
  // Built from codepoints on purpose: writing the class with literal
  // characters puts the very marks this forbids INTO this file, invisibly.
  // That happened when this test was written, and this line is the fix.
  const codes = [0x200e, 0x200f, 0x2066, 0x2067, 0x2068, 0x2069,
                 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x061c];
  const marks = new RegExp(`[${codes.map((n) => String.fromCodePoint(n)).join("")}]`, "u");
  const fa = read("messages/fa.json");
  assert.ok(!marks.test(fa), "fa.json contains a bidi mark");
});

test("the default models are priced, or their spending is invisible", () => {
  assert.ok(PRICES[SETTING_DEFAULTS.sttModel], `${SETTING_DEFAULTS.sttModel} has no price`);
  assert.ok(PRICES[SETTING_DEFAULTS.writerModel], `${SETTING_DEFAULTS.writerModel} has no price`);
});

test("the schema's own bounds admit the defaults", () => {
  // A default outside its own schema's range is a form that cannot be saved
  // until something is changed, which reads as the screen being broken.
  const source = read("src/lib/actions/settings.ts");
  const bound = (field: string, kind: "min" | "max") => {
    const line = source.match(new RegExp(`${field}: z\\.number\\(\\)[^,]*`))?.[0] ?? "";
    const found = line.match(new RegExp(`\\.${kind}\\((\\d[\\d_]*)\\)`));
    return found ? Number(found[1]!.replace(/_/g, "")) : null;
  };
  for (const [field, value] of [
    ["sttMaxOutputTokens", SETTING_DEFAULTS.sttMaxOutputTokens],
    ["writerMaxOutputTokens", SETTING_DEFAULTS.writerMaxOutputTokens],
    ["dailyCeilingUsd", SETTING_DEFAULTS.dailyCeilingUsd],
    ["monthlyCeilingUsd", SETTING_DEFAULTS.monthlyCeilingUsd],
    ["retentionDays", SETTING_DEFAULTS.retentionDays],
  ] as const) {
    const low = bound(field, "min");
    const high = bound(field, "max");
    if (low !== null) assert.ok(value >= low, `${field} default ${value} is below its own min ${low}`);
    if (high !== null) assert.ok(value <= high, `${field} default ${value} is above its own max ${high}`);
  }
});

test("the schema in the SQL agrees with the settings the code writes", () => {
  // The other half of the same gap: a column the action writes and the schema
  // file does not create fails at runtime with PGRST204 and nothing else.
  const sql = read("db/01_schema.sql");
  const action = read("src/lib/actions/settings.ts");
  const columns = [...action.matchAll(/^ {6}([a-z_]+): value\./gm)].map((m) => m[1]!);
  assert.ok(columns.length >= 12, `only found ${columns.length} columns in the update`);
  for (const column of columns) {
    assert.ok(
      new RegExp(`^\\s+${column}\\s`, "m").test(sql),
      `db/01_schema.sql never creates shenava_settings.${column}`,
    );
  }
});
