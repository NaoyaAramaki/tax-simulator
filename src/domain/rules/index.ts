import r2024 from './rules_2024.json';
import r2025 from './rules_2025.json';
import r2026 from './rules_2026.json';
import r2027 from './rules_2027.json';
import { RuleYear } from '../types';

const rawMap: Record<number, RuleYear> = {
  2024: r2024 as RuleYear,
  2025: r2025 as RuleYear,
  2026: r2026 as RuleYear,
  2027: r2027 as RuleYear,
};

const mergeInherit = (rule: RuleYear): RuleYear => {
  if (!rule.inherits_from) return rule;
  const base = rawMap[rule.inherits_from];
  if (!base) return rule;
  return {
    ...base,
    ...rule,
    income_tax: { ...base.income_tax, ...rule.income_tax },
    pension: { ...base.pension, ...rule.pension },
    resident_tax: { ...base.resident_tax, ...rule.resident_tax },
    separate_tax: { ...base.separate_tax, ...rule.separate_tax },
    medical_deduction: { ...base.medical_deduction, ...rule.medical_deduction },
    life_insurance_deduction: { ...base.life_insurance_deduction, ...rule.life_insurance_deduction },
    earthquake_deduction: rule.earthquake_deduction ?? base.earthquake_deduction,
    blue_deduction: rule.blue_deduction ?? base.blue_deduction,
    defaults: { ...base.defaults, ...rule.defaults },
  };
};

const ruleMap: Record<number, RuleYear> = Object.fromEntries(
  Object.entries(rawMap).map(([y, v]) => [Number(y), mergeInherit(v)]),
);

export const getRule = (year: number): RuleYear => ruleMap[year] ?? ruleMap[2024];
export const supportedYears = Object.keys(ruleMap).map((y) => Number(y)).sort();

