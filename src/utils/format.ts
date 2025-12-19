export const formatYen = (n: number): string => {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(n));
  return `${sign}￥${abs.toLocaleString('ja-JP')}`;
};

export const asYen = (value: number): string => formatYen(value);

