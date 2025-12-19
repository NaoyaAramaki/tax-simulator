import { TaxInput } from './types';

export const createDemoInput = (year: number): TaxInput => ({
  year,
  family: {
    taxpayerAge: 42,
    spouseCount: 0,
    dependentCount: 1,
    dependents4064Count: 0,
    preschoolCount: 0,
  },
  salary: {
    enabled: true,
    sources: [
      { id: 'A', name: '支払先A', annual: 4_000_000 },
      { id: 'B', name: '支払先B', annual: 1_200_000 },
    ],
    mainSourceId: 'A',
  },
  business: {
    enabled: true,
    sales: 5_000_000,
    expenses: 1_200_000,
    blueReturn: { enabled: true, mode: 'electronic' },
  },
  stocks: {
    dividend: { amount: 80_000, taxMode: 'general' },
    capitalGain: { amount: 200_000, taxMode: 'separate' },
  },
  deductions: {
    ideco: 120_000,
    smallBizMutualAid: 240_000,
    safetyMutualAid: 200_000,
    medical: { enabled: true, treatment: 40_000, transport: 10_000, other: 0, reimbursed: 0 },
    lifeInsurance: { general: 80_000, nursingMedical: 50_000, pension: 60_000 },
    earthquake: 30_000,
  },
  insurance: {
    mode: 'mixed',
    employee: null,
    national: null,
    mixed: {
      blocks: [
        {
          id: 'emp1',
          type: 'employee',
          months: 6,
          breakdown: [
            { id: 'emp1a', mode: 'estimate', months: 6, baseSalarySourceId: 'A' },
          ],
        },
        {
          id: 'nat1',
          type: 'national',
          months: 6,
          nhiBreakdown: [{ id: 'nat1a', mode: 'estimate', months: 6 }],
          npPayMonths: 5,
          npExemptMonths: 1,
          npMonthlyOverride: null,
        },
      ],
    },
    nhiHousehold: { membersIncludingTaxpayer: 3, members4064: 1, preschool: 0 },
  },
  overrides: {
    incomeTaxRateOverride: null,
    residentIncomeRateOverride: null,
    separateTaxRateOverride: null,
  },
  comparisonSites: [
    { id: 'siteA', name: 'サイトA', amount: 90_000 },
    { id: 'siteB', name: 'サイトB', amount: 110_000 },
  ],
  save: { 
    selectedSaveId: null, 
    previousYearTotalIncome: null,
    previousYearInputMode: 'none',
    previousYearManual: undefined,
  },
});

export const createEmptyInput = (year: number): TaxInput => ({
  year,
  family: {
    taxpayerAge: 0,
    spouseCount: 0,
    dependentCount: 0,
    dependents4064Count: 0,
    preschoolCount: 0,
  },
  salary: {
    enabled: false,
    sources: [],
    mainSourceId: null,
  },
  business: {
    enabled: false,
    sales: 0,
    expenses: 0,
    blueReturn: { enabled: false, mode: 'electronic' },
  },
  stocks: {
    dividend: { amount: 0, taxMode: 'general' },
    capitalGain: { amount: 0, taxMode: 'separate' },
  },
  deductions: {
    ideco: 0,
    smallBizMutualAid: 0,
    safetyMutualAid: 0,
    // UIから「医療費控除を使う」チェックボックスを削除するため、常に有効扱いにする（全て0なら控除は0）
    medical: { enabled: true, treatment: 0, transport: 0, other: 0, reimbursed: 0 },
    lifeInsurance: { general: 0, nursingMedical: 0, pension: 0 },
    earthquake: 0,
  },
  insurance: {
    mode: 'employeeOnly',
    employee: null,
    national: null,
    mixed: null,
    nhiHousehold: { membersIncludingTaxpayer: 1, members4064: 0, preschool: 0 },
  },
  overrides: {
    incomeTaxRateOverride: null,
    residentIncomeRateOverride: null,
    separateTaxRateOverride: null,
  },
  comparisonSites: [],
  save: { 
    selectedSaveId: null, 
    previousYearTotalIncome: null,
    previousYearInputMode: 'none',
    previousYearManual: undefined,
  },
});

