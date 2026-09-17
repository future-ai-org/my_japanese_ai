import type { Language } from "../types/review";

export const LANGUAGE_LABELS: Record<Language, string> = {
  casual: "Casual",
  polite: "Polite",
  formal: "Formal",
};

export const EXAMPLES: Record<Language, string> = {
  casual: `Hey, want to grab lunch tomorrow?
I found a new ramen place near the station.
It's supposed to be really good, and not too expensive.
Let me know if you're free around noon.`,
  polite: `Thank you for your email.
I appreciate you taking the time to explain the schedule.
Would it be possible to meet on Tuesday afternoon?
Please let me know what works best for you.`,
  formal: `I am writing to confirm our appointment next week.
Please find attached the revised proposal for your review.
Should you have any questions, do not hesitate to contact me.
I look forward to your kind reply.`,
};
