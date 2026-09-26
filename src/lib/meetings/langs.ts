/**
 * The two editions, in one place.
 *
 * Both the dialogue and the draft label themselves per language, and a second
 * definition of "the languages" is a second thing to keep in step. This file
 * has no imports so anything may reach it.
 */
export const LANGS = ["fa", "en"] as const;
export type Lang = (typeof LANGS)[number];
