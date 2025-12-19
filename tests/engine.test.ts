import { describe, expect, it } from 'vitest';
import { calculateAll } from '../src/domain/engine';
import { createEmptyInput } from '../src/domain/sample';

function getResult(out: ReturnType<typeof calculateAll>, key: string): number {
  const hit = out.calcLines.find((l) => l.resultKey === key);
  if (!hit) throw new Error(`CalcLine not found: ${key}`);
  if (hit.result === undefined) throw new Error(`CalcLine result is undefined: ${key}`);
  return hit.result;
}

function setSalary(input: ReturnType<typeof createEmptyInput>, annual: number) {
  return {
    ...input,
    salary: {
      enabled: true,
      sources: [{ id: 'A', name: '支払先A', annual }],
      mainSourceId: 'A',
    },
  };
}

describe('engine.calculateAll', () => {
  it('青色申告控除（2024 電子帳簿=65万円, 帳簿=55万円）', () => {
    const base = createEmptyInput(2024);
    const inputElectronic = {
      ...base,
      business: {
        enabled: true,
        sales: 5_000_000,
        expenses: 1_200_000,
        blueReturn: { enabled: true, mode: 'electronic' as const },
      },
    };
    const outElectronic = calculateAll(inputElectronic);
    expect(getResult(outElectronic, 'income.business.income')).toBe(5_000_000 - 1_200_000 - 650_000);

    const inputBook = {
      ...base,
      business: {
        enabled: true,
        sales: 5_000_000,
        expenses: 1_200_000,
        blueReturn: { enabled: true, mode: 'book' as const },
      },
    };
    const outBook = calculateAll(inputBook);
    expect(getResult(outBook, 'income.business.income')).toBe(5_000_000 - 1_200_000 - 550_000);
  });

  it('社保（単独・推計）は収入欄の主たる給与を参照', () => {
    let input = createEmptyInput(2024);
    input = setSalary(input, 4_000_000);
    input = {
      ...input,
      save: { ...input.save, previousYearInputMode: 'useCurrent' },
      insurance: {
        ...input.insurance,
        mode: 'employeeOnly',
        employee: { inputMode: 'estimate', baseSalaryManual: undefined },
        national: null,
        mixed: null,
      },
    };
    const out = calculateAll(input);
    expect(getResult(out, 'insurance.si.total')).toBe(Math.round(4_000_000 * 0.15));
  });

  it('国保推計（世田谷標準内訳）: 前年総所得×率 + 均等割、上限、丸め', () => {
    let input = createEmptyInput(2024);
    input = {
      ...input,
      save: { ...input.save, previousYearInputMode: 'manual', previousYearTotalIncome: 5_000_000 },
      insurance: {
        ...input.insurance,
        mode: 'nationalOnly',
        nhiHousehold: { membersIncludingTaxpayer: 3, members4064: 1, preschool: 0 },
        national: {
          nhi: { mode: 'estimate', amount: undefined },
          np: { payMonths: 0, exemptMonths: 12, monthlyOverride: undefined },
        },
      },
    };

    const out = calculateAll(input);

    const base = Math.round(Math.min(5_000_000 * 0.0771 + 47_300 * 3, 660_000));
    const support = Math.round(Math.min(5_000_000 * 0.0269 + 16_800 * 3, 260_000));
    const care = Math.round(Math.min(5_000_000 * 0.0225 + 16_600 * 1, 170_000));
    const expectedTotal = Math.round(base + support + care);

    expect(out.derived.nhiTotal).toBe(expectedTotal);
  });

  it('国保推計（世田谷標準）は各区分が上限に張り付く（高所得ケース）', () => {
    const input = {
      ...createEmptyInput(2024),
      save: { ...createEmptyInput(2024).save, previousYearInputMode: 'manual' as const, previousYearTotalIncome: 100_000_000 },
      insurance: {
        ...createEmptyInput(2024).insurance,
        mode: 'nationalOnly' as const,
        nhiHousehold: { membersIncludingTaxpayer: 3, members4064: 1, preschool: 0 },
        national: {
          nhi: { mode: 'estimate' as const, amount: undefined },
          np: { payMonths: 0, exemptMonths: 12, monthlyOverride: undefined },
        },
      },
    };
    const out = calculateAll(input);
    expect(getResult(out, 'insurance.nhi.base')).toBe(660_000);
    expect(getResult(out, 'insurance.nhi.support')).toBe(260_000);
    expect(getResult(out, 'insurance.nhi.care')).toBe(170_000);
    expect(out.derived.nhiTotal).toBe(660_000 + 260_000 + 170_000);
  });

  it('生命保険料控除の境界値（所得税/住民税）を全パターン網羅', () => {
    const calcIncomeTax = (paid: number): number => {
      if (paid <= 20_000) return paid;
      if (paid <= 40_000) return Math.floor(paid / 2 + 10_000);
      if (paid <= 80_000) return Math.floor(paid / 4 + 20_000);
      return 40_000;
    };
    const calcResidentTax = (paid: number): number => {
      if (paid <= 20_000) return paid;
      if (paid <= 40_000) return Math.floor(paid / 2 + 6_000);
      if (paid <= 80_000) return Math.floor(paid / 4 + 14_000);
      return 28_000;
    };

    const cases = [20_000, 20_001, 40_000, 40_001, 80_000, 80_001];
    for (const paid of cases) {
      const input = {
        ...createEmptyInput(2024),
        save: { ...createEmptyInput(2024).save, previousYearInputMode: 'useCurrent' as const },
        deductions: {
          ...createEmptyInput(2024).deductions,
          lifeInsurance: { general: paid, nursingMedical: paid, pension: paid },
        },
      };
      const out = calculateAll(input);
      expect(getResult(out, 'deduction.lifeInsurance.general.incomeTax')).toBe(calcIncomeTax(paid));
      expect(getResult(out, 'deduction.lifeInsurance.general.residentTax')).toBe(calcResidentTax(paid));
      expect(getResult(out, 'deduction.lifeInsurance.nursingMedical.incomeTax')).toBe(calcIncomeTax(paid));
      expect(getResult(out, 'deduction.lifeInsurance.nursingMedical.residentTax')).toBe(calcResidentTax(paid));
      expect(getResult(out, 'deduction.lifeInsurance.pension.incomeTax')).toBe(calcIncomeTax(paid));
      expect(getResult(out, 'deduction.lifeInsurance.pension.residentTax')).toBe(calcResidentTax(paid));
    }
  });

  it('住民税 課税所得金額は1000円未満切り捨て', () => {
    // 住民税基礎控除（2020年～2024年、2025年以降は合計所得金額に応じて段階的に設定：2400万円以下43万円、2400万円超～2450万円以下29万円、2450万円超～2500万円以下15万円、2500万円超0円）があるため、
    // 所得額を 43万円 + (端数) にして 1000円未満切り捨てを確認する。
    let input = createEmptyInput(2024);
    input = {
      ...input,
      save: { ...input.save, previousYearInputMode: 'useCurrent' },
      salary: { enabled: false, sources: [], mainSourceId: null },
      business: { enabled: true, sales: 431_999, expenses: 0, blueReturn: { enabled: false, mode: 'book' } },
      insurance: { ...input.insurance, mode: 'employeeOnly', employee: { inputMode: 'manual', amount: 0 }, national: null, mixed: null },
    };
    const out1 = calculateAll(input);
    expect(getResult(out1, 'tax.resident.taxableIncome')).toBe(1000);

    input = {
      ...input,
      business: { ...input.business, sales: 430_999 },
    };
    const out2 = calculateAll(input);
    expect(getResult(out2, 'tax.resident.taxableIncome')).toBe(0);
  });
});


