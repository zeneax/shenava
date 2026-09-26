/**
 * What each section of the proposal is for, as the writer is told it.
 *
 * It lives in a file of its own, with no imports, because the modules that use
 * it are marked `server-only` — and `server-only` does not resolve outside Next,
 * which would put this string beyond the reach of a test. The wording here is
 * the one rule the whole product is judged on, so a test asserts the phrasing
 * and softening it has to be a deliberate act with a failing test in front of it.
 */
export const PROPOSAL_GUIDE = `The proposal this draft feeds has these sections, in this order, and each wants exactly this:
- title: the engagement in a few words, as the proposal's heading.
- engagement: project (a scoped build with an end), consulting (advice by the hour or the day), training (teaching the client's people), retainer (ongoing work by the month); unknown if the meeting did not settle it.
- summary: two or three sentences — what the client needs, what the studio proposes, and what changes for them afterwards.
- understanding: the client's situation as THEY described it — their business, their team, their tools, what goes wrong today and what it costs them. Their words where you can; their numbers exactly.
- goals: what the client wants to be true afterwards. Outcomes, not features.
- phases: the stages the CONSULTANT proposed and the client accepted, each with a title and a line of detail; "when" only if the meeting settled it. scheduleNote: one line on the overall timing, only if it was discussed.
- method: how the studio will work — discovery, iterations, what the client's side provides, how handover and support happen. From what the consultant said and the client agreed to.
- deliverables: what the client will hold at the end, one per line, concrete.
- budget: ONLY what was actually said about money and time, by whom, in their terms. Never a figure the studio did not say or the client did not say.
- exclusions: what was named as out of scope, and what the client said should not change.
- assumptions: what the studio would be relying on — accesses, data, a person on their side, a tool staying as it is — said or plainly implied.
- nextSteps: what the two sides agreed to do next, in order.
- openQuestions: everything the meeting left unsettled that the proposal will need — as questions, one per line.`;

