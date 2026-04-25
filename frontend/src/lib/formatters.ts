export function formatMoney(value?: number | null) {
  const numeric = Number(value ?? 0);
  if (Math.abs(numeric) >= 1_000) {
    return `$${(numeric / 1_000).toFixed(1)}B`;
  }
  return `$${numeric.toFixed(1)}M`;
}

export function formatCount(value?: number | null) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

export function compactText(value: string, max = 92) {
  if (!value || value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}
