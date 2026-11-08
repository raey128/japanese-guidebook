/** Celebration copy (R16.5). */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export const MILESTONES: Record<number, string> = {
  1: "🎉 Your first place in {city}! Welcome aboard.",
  5: "🎉 5 places in {city}! You're getting the hang of this.",
  10: "🎉 10 places in {city}, you're a local now!",
  25: "🏆 25 places in {city}! Travellers owe you one.",
  50: "🏆 50 places in {city}! Legendary.",
};

export function rankingMessage(count: number, city: string): { title: string; big: boolean } {
  const milestone = MILESTONES[count];
  if (milestone) return { title: milestone.replace("{city}", city), big: true };
  return { title: `Nice! That's your ${ordinal(count)} place in ${city}!`, big: false };
}

export const ADDED_MESSAGE = "Added! Thanks for helping fellow travellers 🙌";
export const SENT_FOR_REVIEW_MESSAGE = "Sent for review! We'll add it soon 🙌";
