import { TaxInput, ValidationError, ValidationResult, ValidationWarning } from './types';

export const validateInput = (input: TaxInput): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const err = (field: string, message: string) => errors.push({ field, message });
  const warn = (field: string, message: string) => warnings.push({ field, message });

  if (![2024, 2025, 2026, 2027].includes(input.year)) {
    err('year', '年度は 2024/2025/2026/2027 のいずれかを指定してください。');
  }

  if (!input.save.previousYearInputMode || input.save.previousYearInputMode === 'none') {
    err('save.previousYearInputMode', '前年所得の入力方法を選択してください。');
  }
  if (input.save.previousYearInputMode === 'fromSave' && !input.save.selectedSaveId) {
    err('save.selectedSaveId', '保存データを選択してください。');
  }

  if (input.salary.enabled) {
    if ((input.salary.sources?.length ?? 0) === 0) {
      err('salary.sources', '給与支払先を1件以上入力してください。');
    }
    if (!input.salary.mainSourceId) {
      err('salary.mainSourceId', '主たる給与支払先を選択してください。');
    }
    input.salary.sources.forEach((s, idx) => {
      if (s.annual < 0) err(`salary.sources[${idx}].annual`, '給与年額は0以上で入力してください。');
    });
  }

  if (input.business.enabled) {
    if (input.business.sales <= 0) err('business.sales', '事業売上を入力してください。');
    if (input.business.expenses < 0) err('business.expenses', '経費は0以上で入力してください。');
  }

  if (input.insurance.mode === 'mixed') {
    const blocks = input.insurance.mixed?.blocks ?? [];
    const totalMonths = blocks.reduce((a, b) => a + b.months, 0);
    if (totalMonths !== 12) err('insurance.mixed.blocks', '複合ブロックの合計月数は12ヶ月にしてください。');
    blocks.forEach((b, bi) => {
      if (b.months <= 0 || b.months > 12) err(`insurance.mixed.blocks[${bi}].months`, 'ブロック月数は1〜12で入力してください。');
      if (b.type === 'employee') {
        // 社保ブロックはサブブロックを廃止し、月数のみで計算するため、バリデーション不要
      } else {
        const sumNhi = b.nhiBreakdown.reduce((a, s) => a + s.months, 0);
        if (sumNhi !== b.months) err(`insurance.mixed.blocks[${bi}].nhiBreakdown`, '国保ブロックの国保サブ月数合計がブロック月数と一致していません。');
        const sumNp = b.npPayMonths + b.npExemptMonths;
        if (sumNp !== b.months) err(`insurance.mixed.blocks[${bi}].npPayMonths`, '国保ブロックの国民年金月数（加入+免除）がブロック月数と一致していません。');
      }
    });
  }

  if (input.insurance.mode === 'nationalOnly' && input.insurance.national) {
    const totalMonths = input.insurance.national.np.payMonths + input.insurance.national.np.exemptMonths;
    if (totalMonths !== 12) err('insurance.national.np', '国民年金の加入月数と免除月数の合計は12ヶ月にしてください。');
  }

  const hh = input.insurance.nhiHousehold;
  if (hh.membersIncludingTaxpayer < 1) err('insurance.nhiHousehold.membersIncludingTaxpayer', '国保加入者数は本人を含め1以上にしてください。');
  if (hh.members4064 > hh.membersIncludingTaxpayer) err('insurance.nhiHousehold.members4064', '40〜64歳人数が国保加入者数を超えています。');
  if (hh.preschool > hh.membersIncludingTaxpayer) err('insurance.nhiHousehold.preschool', '未就学児人数が国保加入者数を超えています。');
  if (hh.members4064 + hh.preschool > hh.membersIncludingTaxpayer) err('insurance.nhiHousehold', '40〜64歳＋未就学児の合計が国保加入者数を超えています。');

  if (input.family.dependentCount < input.family.dependents4064Count + input.family.preschoolCount) {
    warn('family.dependentCount', '扶養人数より内訳人数が多くなっています。');
  }

  input.comparisonSites.forEach((s, idx) => {
    if (s.amount < 0) err(`comparisonSites[${idx}]`, '仲介サイト上限は0以上で入力してください。');
  });

  return { errors, warnings };
};

