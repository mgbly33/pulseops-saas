export function currencySymbol(currency?: string): string {
  return currency === 'USD' ? '$' : '¥';
}

export function formatCurrency(value: number, currency = 'CNY', compact = false): string {
  const sym = currencySymbol(currency);
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}k`;
  }
  return `${sym}${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  })}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

export function formatDateTime(iso: string, lang: 'zh' | 'en' = 'zh'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
