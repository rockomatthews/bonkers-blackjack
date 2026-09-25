/** Demo accounting uses integer cents; never round a small wager's fee up. */
export const FEE_POLICY = 'initial-wager-25bps-floor-cent-v1';
export const LEGACY_FEE_POLICY = 'none-v1';
export function roundFee(bet: number) {
  if (!Number.isSafeInteger(bet) || bet < 0) throw Error('Invalid fee base');
  return Math.floor(bet / 400);
}
