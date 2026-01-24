/**
 * Currency formatting utilities.
 * All amounts are stored in cents (smallest currency unit).
 */

/**
 * Formats cents to a dollar string (e.g., 10000n -> "$100.00")
 */
export function formatCents(cents: bigint, currency: string = 'USD'): string {
  const dollars = Number(cents) / 100;
  const formatted = dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted}`;
}

/**
 * Converts dollars to cents (e.g., 100.00 -> 10000n)
 */
export function dollarsToCents(dollars: number): bigint {
  return BigInt(Math.round(dollars * 100));
}

/**
 * Converts cents to dollars (e.g., 10000n -> 100.00)
 */
export function centsToDollars(cents: bigint): number {
  return Number(cents) / 100;
}
