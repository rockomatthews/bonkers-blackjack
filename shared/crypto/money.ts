/** USDC uses six decimals. Wire amounts are decimal strings, never JS floats. */
export const USDC_SCALE = 1_000_000n;
export const CENT = 10_000n;
export function units(input: unknown): bigint {
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]{0,29})$/.test(input)) throw Error('Invalid token amount');
  return BigInt(input);
}
export function parseUSDC(input: string): bigint {
  if (!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,6})?$/.test(input)) throw Error('Use a positive decimal with at most six decimal places');
  const [whole, fraction=''] = input.split('.');
  return BigInt(whole)*USDC_SCALE+BigInt(fraction.padEnd(6,'0'));
}
export function formatUSDC(value: bigint): string {
  if(value<0n)throw Error('Negative balance');
  return `${value/USDC_SCALE}.${(value%USDC_SCALE).toString().padStart(6,'0')}`;
}
export const wagerFee = (stake: bigint) => stake * 25n / 10_000n / CENT * CENT;
export function validateStake(stake: bigint, min: bigint, max: bigint) {
  if(stake<min || stake>max || stake%USDC_SCALE!==0n)throw Error('Wager must be a whole USDC within table limits');
}
