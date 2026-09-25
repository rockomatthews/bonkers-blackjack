export const CHIP_VALUES = [500, 2500, 5000, 10000] as const;
export function chipTotal(chips: number[]) { return chips.reduce((sum, value) => sum + value, 0); }
export function chipsForAmount(amount: number) {
  const chips: number[] = [];
  for (const value of [10000, 5000, 2500, 500, 100]) {
    while (amount >= value && chips.length < 200) { chips.push(value); amount -= value; }
  }
  return chips;
}
export function validChips(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= 200 && value.every(n => [100, ...CHIP_VALUES].includes(n));
}
