import { getRule } from './rules';
import {
  CalcLine,
  EngineOutput,
  LifeInsuranceBracket,
  MixedBlock,
  RuleYear,
  SalaryIncomeDeductionBracket,
  TaxInput,
  Term,
  Summary,
  DerivedValues,
} from './types';
import { formatYen } from '../utils/format';

const floor = (v: number) => Math.floor(v);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const asTerm = (name: string, value: number | string, unit: Term['unit'] = 'yen'): Term => ({
  name,
  value,
  unit,
  displayValue: unit === 'yen' && typeof value === 'number' ? formatYen(value) : undefined,
});

const evalFormula = (formula: string, income: number): number => {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('income', `return ${formula};`) as (income: number) => number;
    const val = fn(income);
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
};

const pickBracketValue = (income: number, brackets: { max_income: number | null; deduction: number }[]) => {
  const row = brackets.find((b) => b.max_income === null || income <= b.max_income);
  return row ? row.deduction : 0;
};

const calcSalaryDeduction = (income: number, brackets: SalaryIncomeDeductionBracket[], minimum: number) => {
  const row = brackets.find((b) => b.max_income === null || income <= b.max_income);
  if (!row) return minimum;
  const v = evalFormula(row.formula.replace(/income/g, 'income'), income);
  return Math.max(minimum, Math.floor(v));
};

const calcLifeCategory = (paid: number, brackets: LifeInsuranceBracket[]): number => {
  const row = brackets.find((b) => b.maxPaid === null || paid <= b.maxPaid);
  if (!row) return 0;
  if (row.kind === 'fixed') return row.value ?? 0;
  return Math.floor((row.rate ?? 0) * paid + (row.add ?? 0));
};

// 所得税用の生命保険料控除計算
const calcLifeCategoryIncomeTax = (paid: number): number => {
  if (paid <= 20000) return paid; // 2万円以下: 全額
  if (paid <= 40000) return Math.floor(paid / 2 + 10000); // 2万超～4万以下: 支払/2 + 1万円
  if (paid <= 80000) return Math.floor(paid / 4 + 20000); // 4万超～8万以下: 支払/4 + 2万円
  return 40000; // 8万超: 一律4万円
};

// 住民税用の生命保険料控除計算
const calcLifeCategoryResidentTax = (paid: number): number => {
  if (paid <= 20000) return paid; // 2万円以下: 全額
  if (paid <= 40000) return Math.floor(paid / 2 + 6000); // 2万超～4万以下: 支払/2 + 6千円
  if (paid <= 80000) return Math.floor(paid / 4 + 14000); // 4万超～8万以下: 支払/4 + 1.4万円
  return 28000; // 8万超: 一律2万8千円
};

const prorateRound = (annual: number, months: number) => Math.round((annual * months) / 12);

const lineId = (() => {
  let i = 0;
  return () => `line-${++i}`;
})();

const push = (arr: CalcLine[], line: Omit<CalcLine, 'id'>) => arr.push({ id: lineId(), ...line });

export function calculateAll(input: TaxInput): EngineOutput {
  const rule = getRule(input.year);
  const lines: CalcLine[] = [];

  // --- Income ---
  const salaryGross = input.salary.enabled ? input.salary.sources.reduce((s, v) => s + (v.annual ?? 0), 0) : 0;
  input.salary.sources.forEach((s) =>
    push(lines, {
      section: 'income.salary',
      display: 'calc',
      title: `給与：${s.name || s.id}`,
      expression: '給与収入（支払先別）',
      terms: [asTerm('年額', s.annual)],
      result: s.annual,
      resultKey: `income.salary.source.${s.id}.annual`,
    }),
  );

  push(lines, {
    section: 'income.salary',
    display: 'calc',
    title: '給与収入合計',
    expression: 'sum(給与支払先 年額)',
    terms: input.salary.sources.map((s) => asTerm(s.name || s.id, s.annual)),
    result: salaryGross,
    resultKey: 'income.salary.grossTotal',
  });

  const salaryDeduction = input.salary.enabled
    ? calcSalaryDeduction(
        salaryGross,
        rule.income_tax.salary_income_deduction.brackets,
        rule.income_tax.salary_income_deduction.minimum,
      )
    : 0;
  const salaryIncome = input.salary.enabled ? Math.max(0, salaryGross - salaryDeduction) : 0;

  push(lines, {
    section: 'income.salary',
    display: 'calc',
    title: '給与所得控除',
    expression: '年度ルールに従い算出（最低保障あり）',
    terms: [asTerm('給与収入合計', salaryGross), asTerm('最低保障額', rule.income_tax.salary_income_deduction.minimum)],
    result: salaryDeduction,
    resultKey: 'income.salary.deduction',
  });

  push(lines, {
    section: 'income.salary',
    display: 'calc',
    title: '給与所得',
    expression: 'max(0, 給与収入合計 − 給与所得控除)',
    terms: [asTerm('給与収入合計', salaryGross), asTerm('給与所得控除', salaryDeduction)],
    result: salaryIncome,
    resultKey: 'income.salary.income',
  });

  const blueRule = rule.blue_deduction ?? { book: 0, electronic: 0 };
  const blueDed =
    input.business.enabled && input.business.blueReturn.enabled
      ? blueRule[input.business.blueReturn.mode] ?? 0
      : 0;
  const businessRaw = input.business.enabled ? input.business.sales - input.business.expenses : 0;
  const businessIncome = input.business.enabled ? businessRaw - blueDed : 0;

  push(lines, {
    section: 'income.business',
    display: 'calc',
    title: '事業所得',
    expression: '(売上 − 経費) − 青色申告控除',
    terms: [asTerm('売上', input.business.sales), asTerm('経費', input.business.expenses), asTerm('青色控除', blueDed)],
    result: businessIncome,
    resultKey: 'income.business.income',
    notes: input.business.blueReturn.enabled ? [`青色方式: ${input.business.blueReturn.mode === 'electronic' ? '電子帳簿' : '帳簿'}`] : ['青色なし'],
  });

  const stockGeneralDividend = input.stocks.dividend.taxMode === 'general' ? input.stocks.dividend.amount : 0;
  const stockSeparateDividend = input.stocks.dividend.taxMode === 'separate' ? input.stocks.dividend.amount : 0;
  const stockGeneralCapitalGain = input.stocks.capitalGain.taxMode === 'general' ? input.stocks.capitalGain.amount : 0;
  const stockSeparateCapitalGain = input.stocks.capitalGain.taxMode === 'separate' ? input.stocks.capitalGain.amount : 0;
  const stockGeneralIncome = stockGeneralDividend + stockGeneralCapitalGain;
  const stockSeparateBase = stockSeparateDividend + stockSeparateCapitalGain;

  push(lines, {
    section: 'income.stock.general',
    display: 'calc',
    title: '株式収入（総合課税に合算）',
    expression: '（配当：総合）＋（売買益：総合）',
    terms: [asTerm('配当（総合）', stockGeneralDividend), asTerm('売買益（総合）', stockGeneralCapitalGain)],
    result: stockGeneralIncome,
    resultKey: 'income.stock.generalIncome',
  });

  const totalIncomeGeneral = salaryIncome + businessIncome + stockGeneralIncome;

  push(lines, {
    section: 'income.general',
    display: 'calc',
    title: '総所得（総合課税）',
    expression: '給与所得 + 事業所得 + 株式（総合）',
    terms: [asTerm('給与所得', salaryIncome), asTerm('事業所得', businessIncome), asTerm('株式（総合）', stockGeneralIncome)],
    result: totalIncomeGeneral,
    resultKey: 'income.general.total',
  });

  // --- Insurance helpers ---
  const resolveBaseSalary = (sourceId?: string, manual?: number) => {
    if (sourceId) {
      const found = input.salary.sources.find((s) => s.id === sourceId);
      if (found) return found.annual;
    }
    return manual ?? salaryGross;
  };

  const calcEmployeeOnly = () => {
    if (!input.insurance.employee) return { si: 0 };
    if (input.insurance.employee.inputMode === 'manual') {
      const amt = input.insurance.employee.amount ?? 0;
      push(lines, {
        section: 'insurance.si',
        display: 'calc',
        title: '社保（手入力）',
        expression: '入力額を採用',
        terms: [asTerm('社保（合計）', amt)],
        result: amt,
      });
      return { si: amt };
    }
    // 社保（単独）の場合は、収入欄の主たる給与を使用
    const baseAnnual = resolveBaseSalary(input.salary.mainSourceId ?? undefined, input.insurance.employee.baseSalaryManual);
    const rate = rule.defaults?.siRate ?? 0.15;
    const annual = Math.round(baseAnnual * rate);
    push(lines, {
      section: 'insurance.si',
      display: 'calc',
      title: '社保（推計年額）',
      expression: '主たる給与年額 × 推計係数',
      terms: [asTerm('主たる給与（年額）', baseAnnual), { name: '推計係数', value: rate, unit: 'pct', displayValue: `${(rate * 100).toFixed(2)}%(${rate})` }],
      result: annual,
      resultKey: 'insurance.si.employee.annualEstimated',
    });
    return { si: annual };
  };

  const estimateNhiAnnual = (months: number = 12): { total: number; base: number; support: number; care: number } => {
    // 世田谷区の国民健康保険料計算方法
    // 基礎（医療）分: 所得割(賦課基準額×7.71%×加入月数÷12) + 均等割(加入者数×47,300円×加入月数÷12)、上限66万円
    // 支援金分: 所得割(賦課基準額×2.69%×加入月数÷12) + 均等割(加入者数×16,800円×加入月数÷12)、上限26万円
    // 介護分: 所得割(40～64歳の賦課基準額×2.25%×該当月数÷12) + 均等割(40～64歳の加入者数×16,600円×該当月数÷12)、上限17万円
    const prevIncome = input.save.previousYearTotalIncome ?? totalIncomeGeneral;
    const head = input.insurance.nhiHousehold;
    const monthRatio = months / 12;
    
    // 基礎（医療）分
    const baseIncomeRate = 0.0771; // 7.71%
    const baseEqualAmount = 47300; // 47,300円
    const baseIncome = Math.min(prevIncome * baseIncomeRate * monthRatio, 660000 * monthRatio);
    const baseEqual = head.membersIncludingTaxpayer * baseEqualAmount * monthRatio;
    const baseTotal = Math.min(baseIncome + baseEqual, 660000 * monthRatio);
    
    // 支援金分
    const supportIncomeRate = 0.0269; // 2.69%
    const supportEqualAmount = 16800; // 16,800円
    const supportIncome = Math.min(prevIncome * supportIncomeRate * monthRatio, 260000 * monthRatio);
    const supportEqual = head.membersIncludingTaxpayer * supportEqualAmount * monthRatio;
    const supportTotal = Math.min(supportIncome + supportEqual, 260000 * monthRatio);
    
    // 介護分（40～64歳のみ）
    const careIncomeRate = 0.0225; // 2.25%
    const careEqualAmount = 16600; // 16,600円
    const careIncome = Math.min(prevIncome * careIncomeRate * monthRatio, 170000 * monthRatio);
    const careEqual = head.members4064 * careEqualAmount * monthRatio;
    const careTotal = Math.min(careIncome + careEqual, 170000 * monthRatio);
    
    return {
      total: Math.round(baseTotal + supportTotal + careTotal),
      base: Math.round(baseTotal),
      support: Math.round(supportTotal),
      care: Math.round(careTotal),
    };
  };

  const calcNationalOnly = () => {
    if (!input.insurance.national) return { nhi: 0, np: { total: 0, payMonths: 0, exemptMonths: 0 } };
    let nhi = 0;
    if (input.insurance.national.nhi.mode === 'manual') {
      nhi = input.insurance.national.nhi.amount ?? 0;
      push(lines, {
        section: 'insurance.nhi',
        display: 'calc',
        title: '国保（手入力）',
        expression: '入力額を採用',
        terms: [asTerm('国保', nhi)],
        result: nhi,
        resultKey: 'insurance.nhi.total',
      });
    } else {
      const annual = estimateNhiAnnual(12);
      nhi = annual.total;
      // 基礎（医療）分の詳細計算
      const prevIncome = input.save.previousYearTotalIncome ?? totalIncomeGeneral;
      const head = input.insurance.nhiHousehold;
      const monthRatio = 12 / 12;
      const baseIncomeRate = 0.0771;
      const baseEqualAmount = 47300;
      const baseIncomeCalc = prevIncome * baseIncomeRate * monthRatio;
      const baseEqualCalc = head.membersIncludingTaxpayer * baseEqualAmount * monthRatio;
      const baseIncome = Math.min(baseIncomeCalc, 660000 * monthRatio);
      const baseEqual = baseEqualCalc;
      const baseTotal = Math.min(baseIncome + baseEqual, 660000 * monthRatio);
      
      push(lines, {
        section: 'insurance.nhi',
        display: 'calc',
        title: '国保（推計）基礎（医療）分 所得割',
        expression: 'min(前年総所得 × 7.71% × 月数/12, 上限66万円 × 月数/12)',
        terms: [
          asTerm('前年総所得', prevIncome),
          { name: '所得割率', value: 0.0771, unit: 'pct', displayValue: '7.71%' },
          { name: '月数', value: 12, unit: 'month', displayValue: '12ヶ月' },
          { name: '計算値', value: baseIncomeCalc, unit: 'yen', displayValue: formatYen(baseIncomeCalc) },
          { name: '上限', value: 660000 * monthRatio, unit: 'yen', displayValue: formatYen(660000 * monthRatio) },
        ],
        result: baseIncome,
        resultKey: 'insurance.nhi.base.income',
      });
      push(lines, {
        section: 'insurance.nhi',
        display: 'calc',
        title: '国保（推計）基礎（医療）分 均等割',
        expression: '加入者数 × 47,300円 × 月数/12',
        terms: [
          { name: '加入者数（本人含む）', value: head.membersIncludingTaxpayer, unit: 'count', displayValue: `${head.membersIncludingTaxpayer}人` },
          { name: '均等割額', value: 47300, unit: 'yen', displayValue: '47,300円/人' },
          { name: '月数', value: 12, unit: 'month', displayValue: '12ヶ月' },
        ],
        result: baseEqual,
        resultKey: 'insurance.nhi.base.equal',
      });
      push(lines, {
        section: 'insurance.nhi',
        display: 'calc',
        title: '国保（推計）基礎（医療）分 合計',
        expression: 'min(所得割 + 均等割, 上限66万円)',
        terms: [
          asTerm('所得割', baseIncome),
          asTerm('均等割', baseEqual),
          { name: '上限', value: 660000 * monthRatio, unit: 'yen', displayValue: formatYen(660000 * monthRatio) },
        ],
        result: annual.base,
        resultKey: 'insurance.nhi.base',
      });
      push(lines, {
        section: 'insurance.nhi',
        display: 'calc',
        title: '国保（推計）支援金分',
        expression: 'min(所得割 + 均等割, 上限26万円)',
        terms: [
          asTerm('前年総所得', input.save.previousYearTotalIncome ?? totalIncomeGeneral),
          { name: '所得割率', value: 0.0269, unit: 'pct', displayValue: '2.69%' },
          { name: '加入者数（本人含む）', value: input.insurance.nhiHousehold.membersIncludingTaxpayer, unit: 'count', displayValue: `${input.insurance.nhiHousehold.membersIncludingTaxpayer}人` },
          { name: '均等割額', value: 16800, unit: 'yen', displayValue: '16,800円/人' },
        ],
        result: annual.support,
        resultKey: 'insurance.nhi.support',
      });
      push(lines, {
        section: 'insurance.nhi',
        display: 'calc',
        title: '国保（推計）介護分',
        expression: 'min(所得割 + 均等割, 上限17万円)',
        terms: [
          asTerm('前年総所得', input.save.previousYearTotalIncome ?? totalIncomeGeneral),
          { name: '所得割率', value: 0.0225, unit: 'pct', displayValue: '2.25%' },
          asTerm('40～64歳人数', input.insurance.nhiHousehold.members4064, 'count'),
          { name: '均等割額', value: 16600, unit: 'yen', displayValue: '16,600円/人' },
        ],
        result: annual.care,
        resultKey: 'insurance.nhi.care',
      });
      push(lines, {
        section: 'insurance.nhi',
        display: 'calc',
        title: '国保（推計）合計',
        expression: '基礎（医療）分 + 支援金分 + 介護分',
        terms: [
          asTerm('基礎（医療）分', annual.base),
          asTerm('支援金分', annual.support),
          asTerm('介護分', annual.care),
        ],
        result: annual.total,
        resultKey: 'insurance.nhi.total',
        notes: [
          '世田谷区の計算方法に基づく推計値です。',
          '実際の保険料は前年所得、加入者数、年齢構成等により異なります。',
        ],
      });
    }

    const npMonthly = input.insurance.national.np.monthlyOverride ?? rule.pension.national_pension_monthly.value ?? 0;
    const payMonths = input.insurance.national.np.payMonths;
    const exemptMonths = input.insurance.national.np.exemptMonths;
    const npTotal = npMonthly * payMonths;

    push(lines, {
      section: 'insurance.np',
      display: 'info',
      title: '国民年金（月数内訳）',
      expression: '加入と免除を同一年で分割可能',
      terms: [
        { name: '加入（月数）', value: payMonths, unit: 'month', displayValue: `${payMonths}ヶ月` },
        { name: '免除（月数）', value: exemptMonths, unit: 'month', displayValue: `${exemptMonths}ヶ月` },
      ],
      resultKey: 'insurance.np.infoMonths',
    });

    push(lines, {
      section: 'insurance.np',
      display: 'calc',
      title: '国民年金（国年）合計',
      expression: '月額×加入月数（免除は￥0）',
      terms: [
        asTerm('月額', npMonthly),
        { name: '加入（月数）', value: payMonths, unit: 'month', displayValue: `${payMonths}ヶ月` },
        { name: '参照年度', value: input.year, unit: 'text', displayValue: `${input.year}年度` },
      ],
      result: npTotal,
      resultKey: 'insurance.np.total',
      notes: [`月額${formatYen(npMonthly)}は${input.year}年度の国民年金月額です。`],
    });

    return { nhi, np: { total: npTotal, payMonths, exemptMonths } };
  };

  const calcMixed = () => {
    let si = 0;
    let nhi = 0;
    let npTotal = 0;
    let payMonths = 0;
    let exemptMonths = 0;
    (input.insurance.mixed?.blocks ?? []).forEach((block, bi) => {
      if (block.type === 'employee') {
        block.breakdown.forEach((sub, siIndex) => {
          if (sub.mode === 'manual') {
            const amt = sub.amount ?? 0;
            si += amt;
            push(lines, {
              section: 'insurance.si',
              display: 'calc',
              title: `社保（ブロック${bi + 1} 手入力）`,
              expression: '入力額',
              terms: [{ name: '月数', value: sub.months, unit: 'month', displayValue: `${sub.months}ヶ月` }],
              result: amt,
              resultKey: `insurance.si.block${bi + 1}.sub${siIndex + 1}.amount`,
            });
          } else {
            const base = resolveBaseSalary(sub.baseSalarySourceId, sub.baseSalaryManual);
            const rate = rule.defaults?.siRate ?? 0.15;
            const annual = Math.round(base * rate);
            const amt = prorateRound(annual, sub.months);
            si += amt;
            push(lines, {
              section: 'insurance.si',
              display: 'calc',
              title: `社保（ブロック${bi + 1} 推計年額）`,
              expression: '主たる給与年額 × 推計係数',
              terms: [asTerm('主たる給与', base), { name: '推計係数', value: rate, unit: 'pct', displayValue: `${(rate * 100).toFixed(2)}%(${rate})` }],
              result: annual,
              resultKey: `insurance.si.block${bi + 1}.sub${siIndex + 1}.annualEstimated`,
            });
            push(lines, {
              section: 'insurance.si',
              display: 'calc',
              title: `社保（ブロック${bi + 1} 按分）`,
              expression: '推計年額 × 月数 / 12',
              terms: [asTerm('推計年額', annual), { name: '月数', value: sub.months, unit: 'month', displayValue: `${sub.months}ヶ月` }],
              result: amt,
              notes: ['按分（年額×月数/12）は円単位で四捨五入'],
              resultKey: `insurance.si.block${bi + 1}.sub${siIndex + 1}.amount`,
            });
          }
        });
      } else {
        block.nhiBreakdown.forEach((sub, niIndex) => {
          if (sub.mode === 'manual') {
            const amt = sub.amount ?? 0;
            nhi += amt;
            push(lines, {
              section: 'insurance.nhi',
              display: 'calc',
              title: `国保（ブロック${bi + 1} 手入力）`,
              expression: '入力額',
              terms: [{ name: '月数', value: sub.months, unit: 'month', displayValue: `${sub.months}ヶ月` }],
              result: amt,
              resultKey: `insurance.nhi.block${bi + 1}.sub${niIndex + 1}.amount`,
            });
          } else {
            const annual = estimateNhiAnnual(sub.months);
            nhi += annual.total;
            // ブロックの基礎（医療）分の詳細計算
            const blockPrevIncome = input.save.previousYearTotalIncome ?? totalIncomeGeneral;
            const blockHead = input.insurance.nhiHousehold;
            const blockMonthRatio = sub.months / 12;
            const blockBaseIncomeRate = 0.0771;
            const blockBaseEqualAmount = 47300;
            const blockBaseIncomeCalc = blockPrevIncome * blockBaseIncomeRate * blockMonthRatio;
            const blockBaseEqualCalc = blockHead.membersIncludingTaxpayer * blockBaseEqualAmount * blockMonthRatio;
            const blockBaseIncome = Math.min(blockBaseIncomeCalc, 660000 * blockMonthRatio);
            const blockBaseEqual = blockBaseEqualCalc;
            const blockBaseTotal = Math.min(blockBaseIncome + blockBaseEqual, 660000 * blockMonthRatio);
            
            push(lines, {
              section: 'insurance.nhi',
              display: 'calc',
              title: `国保（ブロック${bi + 1} 推計）基礎（医療）分 所得割`,
              expression: `min(前年総所得 × 7.71% × ${sub.months}ヶ月/12, 上限66万円 × ${sub.months}ヶ月/12)`,
              terms: [
                asTerm('前年総所得', blockPrevIncome),
                { name: '所得割率', value: 0.0771, unit: 'pct', displayValue: '7.71%' },
                { name: '月数', value: sub.months, unit: 'month', displayValue: `${sub.months}ヶ月` },
                { name: '計算値', value: blockBaseIncomeCalc, unit: 'yen', displayValue: formatYen(blockBaseIncomeCalc) },
                { name: '上限', value: 660000 * blockMonthRatio, unit: 'yen', displayValue: formatYen(660000 * blockMonthRatio) },
              ],
              result: blockBaseIncome,
              resultKey: `insurance.nhi.block${bi + 1}.sub${niIndex + 1}.base.income`,
            });
            push(lines, {
              section: 'insurance.nhi',
              display: 'calc',
              title: `国保（ブロック${bi + 1} 推計）基礎（医療）分 均等割`,
              expression: `加入者数 × 47,300円 × ${sub.months}ヶ月/12`,
              terms: [
                { name: '加入者数（本人含む）', value: blockHead.membersIncludingTaxpayer, unit: 'count', displayValue: `${blockHead.membersIncludingTaxpayer}人` },
                { name: '均等割額', value: 47300, unit: 'yen', displayValue: '47,300円/人' },
                { name: '月数', value: sub.months, unit: 'month', displayValue: `${sub.months}ヶ月` },
              ],
              result: blockBaseEqual,
              resultKey: `insurance.nhi.block${bi + 1}.sub${niIndex + 1}.base.equal`,
            });
            push(lines, {
              section: 'insurance.nhi',
              display: 'calc',
              title: `国保（ブロック${bi + 1} 推計）基礎（医療）分 合計`,
              expression: `min(所得割 + 均等割, 上限66万円 × ${sub.months}ヶ月/12)`,
              terms: [
                asTerm('所得割', blockBaseIncome),
                asTerm('均等割', blockBaseEqual),
                { name: '上限', value: 660000 * blockMonthRatio, unit: 'yen', displayValue: formatYen(660000 * blockMonthRatio) },
              ],
              result: annual.base,
              resultKey: `insurance.nhi.block${bi + 1}.sub${niIndex + 1}.base`,
            });
            push(lines, {
              section: 'insurance.nhi',
              display: 'calc',
              title: `国保（ブロック${bi + 1} 推計）支援金分`,
              expression: `min(所得割 + 均等割, 上限26万円) × ${sub.months}ヶ月 / 12`,
              terms: [
                asTerm('前年総所得', input.save.previousYearTotalIncome ?? totalIncomeGeneral),
                { name: '所得割率', value: 0.0269, unit: 'pct', displayValue: '2.69%' },
                { name: '加入者数（本人含む）', value: input.insurance.nhiHousehold.membersIncludingTaxpayer, unit: 'count', displayValue: `${input.insurance.nhiHousehold.membersIncludingTaxpayer}人` },
                { name: '均等割額', value: 16800, unit: 'yen', displayValue: '16,800円/人' },
                { name: '月数', value: sub.months, unit: 'month', displayValue: `${sub.months}ヶ月` },
              ],
              result: annual.support,
              resultKey: `insurance.nhi.block${bi + 1}.sub${niIndex + 1}.support`,
            });
            push(lines, {
              section: 'insurance.nhi',
              display: 'calc',
              title: `国保（ブロック${bi + 1} 推計）介護分`,
              expression: `min(所得割 + 均等割, 上限17万円) × ${sub.months}ヶ月 / 12`,
              terms: [
                asTerm('前年総所得', input.save.previousYearTotalIncome ?? totalIncomeGeneral),
                { name: '所得割率', value: 0.0225, unit: 'pct', displayValue: '2.25%' },
                { name: '40～64歳人数', value: input.insurance.nhiHousehold.members4064, unit: 'count', displayValue: `${input.insurance.nhiHousehold.members4064}人` },
                { name: '均等割額', value: 16600, unit: 'yen', displayValue: '16,600円/人' },
                { name: '月数', value: sub.months, unit: 'month', displayValue: `${sub.months}ヶ月` },
              ],
              result: annual.care,
              resultKey: `insurance.nhi.block${bi + 1}.sub${niIndex + 1}.care`,
            });
            push(lines, {
              section: 'insurance.nhi',
              display: 'calc',
              title: `国保（ブロック${bi + 1} 推計）合計`,
              expression: '基礎（医療）分 + 支援金分 + 介護分',
              terms: [
                asTerm('基礎（医療）分', annual.base),
                asTerm('支援金分', annual.support),
                asTerm('介護分', annual.care),
              ],
              result: annual.total,
              resultKey: `insurance.nhi.block${bi + 1}.sub${niIndex + 1}.amount`,
              notes: [
                `世田谷区の計算方法に基づく推計値（${sub.months}ヶ月分）`,
              ],
            });
          }
        });

        const npMonthly = block.npMonthlyOverride ?? rule.pension.national_pension_monthly.value ?? 0;
        const blockPayMonths = block.npPayMonths;
        const blockExemptMonths = block.npExemptMonths;
        const blockNpTotal = npMonthly * blockPayMonths;
        npTotal += blockNpTotal;
        payMonths += blockPayMonths;
        exemptMonths += blockExemptMonths;
      }
    });

    push(lines, {
      section: 'insurance.np',
      display: 'info',
      title: '国民年金（月数内訳）',
      expression: '加入と免除を同一年で分割可能',
      terms: [
        { name: '加入（月数）', value: payMonths, unit: 'month', displayValue: `${payMonths}ヶ月` },
        { name: '免除（月数）', value: exemptMonths, unit: 'month', displayValue: `${exemptMonths}ヶ月` },
      ],
      resultKey: 'insurance.np.infoMonths',
    });

    const npMonthlyForDisplay = input.insurance.national?.np.monthlyOverride ?? rule.pension.national_pension_monthly.value ?? 0;
    push(lines, {
      section: 'insurance.np',
      display: 'calc',
      title: '国民年金（国年）合計',
      expression: '月額×加入月数（免除は￥0）',
      terms: [
        asTerm('月額', npMonthlyForDisplay),
        { name: '加入（月数）', value: payMonths, unit: 'month', displayValue: `${payMonths}ヶ月` },
        { name: '参照年度', value: input.year, unit: 'text', displayValue: `${input.year}年度` },
      ],
      result: npTotal,
      resultKey: 'insurance.np.total',
      notes: [`月額${formatYen(npMonthlyForDisplay)}は${input.year}年度の国民年金月額です。`],
    });

    return { si, nhi, np: { total: npTotal, payMonths, exemptMonths } };
  };

  let siTotal = 0;
  let nhiTotal = 0;
  let npTotal = 0;
  let npPayMonths = 0;
  let npExemptMonths = 0;

  push(lines, {
    section: 'insurance.si',
    display: 'info',
    title: '保険料入力ルール',
    expression: '手入力と推計は同一年度内で併用可能。国保加入者数は本人を含む。法定軽減は未実装。',
    terms: [],
    notes: ['国保の法定軽減（7割/5割/2割）は未実装（想定差分のみ表示）'],
  });

  if (input.insurance.mode === 'employeeOnly') {
    const res = calcEmployeeOnly();
    siTotal = res.si;
  } else if (input.insurance.mode === 'nationalOnly') {
    const res = calcNationalOnly();
    nhiTotal = res.nhi;
    npTotal = res.np.total;
    npPayMonths = res.np.payMonths;
    npExemptMonths = res.np.exemptMonths;
  } else {
    const res = calcMixed();
    siTotal = res.si;
    nhiTotal = res.nhi;
    npTotal = res.np.total;
    npPayMonths = res.np.payMonths;
    npExemptMonths = res.np.exemptMonths;
  }

  push(lines, {
    section: 'insurance.si',
    display: 'calc',
    title: '社会保険料（社保）合計',
    expression: '各ブロック（手入力/推計）の合計',
    terms: [],
    result: siTotal,
    resultKey: 'insurance.si.total',
  });

  push(lines, {
    section: 'insurance.nhi',
    display: 'calc',
    title: '国民健康保険料（国保）合計',
    expression: '各ブロック（手入力/推計）の合計',
    terms: [],
    result: nhiTotal,
    resultKey: 'insurance.nhi.total',
  });

  // 国民年金の月額を取得（複合モードの場合は最初のブロックから取得）
  let npMonthlyForTotal = rule.pension.national_pension_monthly.value ?? 0;
  if (input.insurance.mode === 'mixed' && input.insurance.mixed?.blocks) {
    for (const block of input.insurance.mixed.blocks) {
      if (block.type === 'national' && block.npMonthlyOverride !== null && block.npMonthlyOverride !== undefined) {
        npMonthlyForTotal = block.npMonthlyOverride;
        break;
      }
    }
  } else if (input.insurance.mode === 'nationalOnly' && input.insurance.national) {
    if (input.insurance.national.np.monthlyOverride !== null && input.insurance.national.np.monthlyOverride !== undefined) {
      npMonthlyForTotal = input.insurance.national.np.monthlyOverride;
    }
  }
  
  push(lines, {
    section: 'insurance.np',
    display: 'calc',
    title: '国民年金（国年）合計',
    expression: '月額×加入月数（免除は￥0）',
    terms: [
      asTerm('月額', npMonthlyForTotal),
      { name: '加入（月数）', value: npPayMonths, unit: 'month', displayValue: `${npPayMonths}ヶ月` },
      { name: '参照年度', value: input.year, unit: 'text', displayValue: `${input.year}年度` },
    ],
    result: npTotal,
    resultKey: 'insurance.np.total',
    notes: [`月額${formatYen(npMonthlyForTotal)}は${input.year}年度の国民年金月額です。`],
  });

  const socialInsuranceDeduction = siTotal + nhiTotal + npTotal;

  // --- Deductions ---
  const basicDeduction = pickBracketValue(totalIncomeGeneral, rule.income_tax.basic_deduction.brackets);
  const ideco = input.deductions.ideco;
  const small = input.deductions.smallBizMutualAid;
  const safety = input.deductions.safetyMutualAid;
  const paidLife = input.deductions.lifeInsurance;
  // 所得税用の生命保険料控除計算
  const lifeGeneralIncomeTax = calcLifeCategoryIncomeTax(paidLife.general);
  const lifeNursingIncomeTax = calcLifeCategoryIncomeTax(paidLife.nursingMedical);
  const lifePensionIncomeTax = calcLifeCategoryIncomeTax(paidLife.pension);
  const lifeTotalIncomeTax = Math.min(120000, lifeGeneralIncomeTax + lifeNursingIncomeTax + lifePensionIncomeTax);
  
  // 住民税用の生命保険料控除計算
  const lifeGeneralResidentTax = calcLifeCategoryResidentTax(paidLife.general);
  const lifeNursingResidentTax = calcLifeCategoryResidentTax(paidLife.nursingMedical);
  const lifePensionResidentTax = calcLifeCategoryResidentTax(paidLife.pension);
  const lifeTotalResidentTax = Math.min(70000, lifeGeneralResidentTax + lifeNursingResidentTax + lifePensionResidentTax);
  
  const lifeTotal = lifeTotalIncomeTax; // 控除合計には所得税控除を使用
  // 地震保険料控除: 所得税上限5万円、住民税上限25,000円
  const earthquakeIncomeTax = Math.min(50000, input.deductions.earthquake);
  const earthquakeResidentTax = Math.min(25000, input.deductions.earthquake);
  const earthquake = earthquakeIncomeTax; // 控除合計には所得税控除を使用

  const med = input.deductions.medical;
  const paidTotal = med.treatment + med.transport + med.other;
  const netPaid = Math.max(0, paidTotal - med.reimbursed);
  const medThreshold = Math.min(rule.medical_deduction.threshold_fixed, Math.floor(totalIncomeGeneral * rule.medical_deduction.threshold_rate));
  const medDed = med.enabled ? clamp(netPaid - medThreshold, 0, rule.medical_deduction.cap) : 0;

  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '基礎控除',
    expression: '年度ルール（合計所得金額により段階制）',
    terms: [asTerm('合計所得金額（総合）', totalIncomeGeneral)],
    result: basicDeduction,
    resultKey: 'deduction.basic',
  });

  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '社会保険料控除（合計）',
    expression: '社保 + 国保 + 国年',
    terms: [asTerm('社保', siTotal), asTerm('国保', nhiTotal), asTerm('国年', npTotal)],
    result: socialInsuranceDeduction,
    resultKey: 'deduction.socialInsurance.total',
  });

  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: 'iDeCo掛金',
    expression: '入力値',
    terms: [asTerm('掛金', ideco)],
    result: ideco,
    resultKey: 'deduction.ideco',
  });

  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '小規模企業共済掛金',
    expression: '入力値',
    terms: [asTerm('掛金', small)],
    result: small,
    resultKey: 'deduction.smallBizMutualAid',
  });

  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '経営セーフティ共済掛金',
    expression: '入力値',
    terms: [asTerm('掛金', safety)],
    result: safety,
    resultKey: 'deduction.safetyMutualAid',
  });

  // 生命保険料控除の計算式を明示（所得税用）
  const getLifeExpressionIncomeTax = (paid: number): string => {
    if (paid <= 20000) return '支払保険料の全額';
    if (paid <= 40000) return '支払保険料 ÷ 2 + 1万円';
    if (paid <= 80000) return '支払保険料 ÷ 4 + 2万円';
    return '一律4万円';
  };
  
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '生命保険料控除（一般・所得税）',
    expression: getLifeExpressionIncomeTax(paidLife.general),
    terms: [
      asTerm('支払保険料', paidLife.general),
      { name: '控除額', value: lifeGeneralIncomeTax, unit: 'yen', displayValue: formatYen(lifeGeneralIncomeTax) },
    ],
    result: lifeGeneralIncomeTax,
    resultKey: 'deduction.lifeInsurance.general.incomeTax',
  });
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '生命保険料控除（介護医療・所得税）',
    expression: getLifeExpressionIncomeTax(paidLife.nursingMedical),
    terms: [
      asTerm('支払保険料', paidLife.nursingMedical),
      { name: '控除額', value: lifeNursingIncomeTax, unit: 'yen', displayValue: formatYen(lifeNursingIncomeTax) },
    ],
    result: lifeNursingIncomeTax,
    resultKey: 'deduction.lifeInsurance.nursingMedical.incomeTax',
  });
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '生命保険料控除（個人年金・所得税）',
    expression: getLifeExpressionIncomeTax(paidLife.pension),
    terms: [
      asTerm('支払保険料', paidLife.pension),
      { name: '控除額', value: lifePensionIncomeTax, unit: 'yen', displayValue: formatYen(lifePensionIncomeTax) },
    ],
    result: lifePensionIncomeTax,
    resultKey: 'deduction.lifeInsurance.pension.incomeTax',
  });
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '生命保険料控除（所得税控除・合計）',
    expression: 'min(一般＋介護医療＋個人年金, 上限12万円)',
    terms: [
      asTerm('一般', lifeGeneralIncomeTax),
      asTerm('介護医療', lifeNursingIncomeTax),
      asTerm('個人年金', lifePensionIncomeTax),
      { name: '上限', value: 120000, unit: 'yen', displayValue: '12万円' },
    ],
    result: lifeTotalIncomeTax,
    resultKey: 'deduction.lifeInsurance.incomeTax',
  });
  
  // 生命保険料控除の計算式を明示（住民税用）
  const getLifeExpressionResidentTax = (paid: number): string => {
    if (paid <= 20000) return '支払保険料の全額';
    if (paid <= 40000) return '支払保険料 ÷ 2 + 6千円';
    if (paid <= 80000) return '支払保険料 ÷ 4 + 1.4万円';
    return '一律2万8千円';
  };
  
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '生命保険料控除（一般・住民税）',
    expression: getLifeExpressionResidentTax(paidLife.general),
    terms: [
      asTerm('支払保険料', paidLife.general),
      { name: '控除額', value: lifeGeneralResidentTax, unit: 'yen', displayValue: formatYen(lifeGeneralResidentTax) },
    ],
    result: lifeGeneralResidentTax,
    resultKey: 'deduction.lifeInsurance.general.residentTax',
  });
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '生命保険料控除（介護医療・住民税）',
    expression: getLifeExpressionResidentTax(paidLife.nursingMedical),
    terms: [
      asTerm('支払保険料', paidLife.nursingMedical),
      { name: '控除額', value: lifeNursingResidentTax, unit: 'yen', displayValue: formatYen(lifeNursingResidentTax) },
    ],
    result: lifeNursingResidentTax,
    resultKey: 'deduction.lifeInsurance.nursingMedical.residentTax',
  });
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '生命保険料控除（個人年金・住民税）',
    expression: getLifeExpressionResidentTax(paidLife.pension),
    terms: [
      asTerm('支払保険料', paidLife.pension),
      { name: '控除額', value: lifePensionResidentTax, unit: 'yen', displayValue: formatYen(lifePensionResidentTax) },
    ],
    result: lifePensionResidentTax,
    resultKey: 'deduction.lifeInsurance.pension.residentTax',
  });
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '生命保険料控除（住民税控除・合計）',
    expression: 'min(一般＋介護医療＋個人年金, 上限7万円)',
    terms: [
      asTerm('一般', lifeGeneralResidentTax),
      asTerm('介護医療', lifeNursingResidentTax),
      asTerm('個人年金', lifePensionResidentTax),
      { name: '上限', value: 70000, unit: 'yen', displayValue: '7万円' },
    ],
    result: lifeTotalResidentTax,
    resultKey: 'deduction.lifeInsurance.residentTax',
  });

  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '地震保険料控除（所得税控除）',
    expression: 'min(支払額, 上限5万円)',
    terms: [
      asTerm('支払額', input.deductions.earthquake),
      { name: '上限', value: 50000, unit: 'yen', displayValue: '5万円' },
    ],
    result: earthquakeIncomeTax,
    resultKey: 'deduction.earthquake.incomeTax',
  });
  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '地震保険料控除（住民税控除）',
    expression: 'min(支払額, 上限25,000円)',
    terms: [
      asTerm('支払額', input.deductions.earthquake),
      { name: '上限', value: 25000, unit: 'yen', displayValue: '25,000円' },
    ],
    result: earthquakeResidentTax,
    resultKey: 'deduction.earthquake.residentTax',
  });

  if (med.enabled) {
    push(lines, {
      section: 'deduction',
      display: 'calc',
      title: '医療費控除',
      expression: 'max(0, (支払合計−補填) − 閾値)（上限あり）',
      terms: [
        asTerm('治療費等', med.treatment),
        asTerm('通院交通費', med.transport),
        asTerm('その他', med.other),
        asTerm('補填', med.reimbursed),
        asTerm('合計所得金額（総合）', totalIncomeGeneral),
        asTerm('閾値', medThreshold),
        asTerm('上限', rule.medical_deduction.cap),
      ],
      result: medDed,
      resultKey: 'deduction.medical',
    });
  } else {
    push(lines, {
      section: 'deduction',
      display: 'info',
      title: '医療費控除',
      expression: '医療費控除はOFFのため計算対象外',
      terms: [],
      resultKey: 'deduction.medical.off',
    });
  }

  const deductionTotal =
    basicDeduction +
    socialInsuranceDeduction +
    ideco +
    small +
    safety +
    lifeTotal +
    earthquake +
    medDed;

  push(lines, {
    section: 'deduction',
    display: 'calc',
    title: '所得控除合計',
    expression: '基礎 + 社会保険料 + 掛金系 + 医療 + 生命保険 + 地震',
    terms: [
      asTerm('基礎控除', basicDeduction),
      asTerm('社会保険料控除', socialInsuranceDeduction),
      asTerm('iDeCo掛金', ideco),
      asTerm('小規模企業共済', small),
      asTerm('経営セーフティ共済', safety),
      asTerm('医療費控除', medDed),
      asTerm('生命保険料控除（所得税）', lifeTotalIncomeTax),
      asTerm('地震保険料控除（所得税）', earthquake),
    ],
    result: deductionTotal,
    resultKey: 'deduction.total',
  });

  // --- Taxable ---
  // 課税所得は1000円未満の端数を切り捨て
  const taxableIncomeRaw = Math.max(0, totalIncomeGeneral - deductionTotal);
  const taxableIncome = Math.floor(taxableIncomeRaw / 1000) * 1000;
  push(lines, {
    section: 'taxable',
    display: 'calc',
    title: '課税所得（総合課税）',
    expression: 'floor(max(0, 総所得（総合） − 所得控除合計) / 1000) × 1000',
    terms: [
      asTerm('総所得（総合課税）', totalIncomeGeneral),
      asTerm('所得控除合計', deductionTotal),
      asTerm('計算値', taxableIncomeRaw),
    ],
    result: taxableIncome,
    resultKey: 'taxable.general',
    notes: ['1000円未満の端数を切り捨て'],
  });

  // --- Income tax ---
  const incomeRateRow = rule.income_tax.rate_table.find((r) => r.max === null || taxableIncome <= (r.max ?? Number.MAX_SAFE_INTEGER)) ?? rule.income_tax.rate_table[rule.income_tax.rate_table.length - 1];
  const incomeTaxRate = input.overrides.incomeTaxRateOverride ?? incomeRateRow.rate;
  const incomeTax = Math.max(0, floor(taxableIncome * incomeTaxRate - incomeRateRow.deduction));

  push(lines, {
    section: 'tax.income',
    display: 'info',
    title: '所得税（限界税率）',
    expression: '速算表の税率（上書き可能）',
    terms: [
      { name: '該当レンジ', value: incomeRateRow.label, unit: 'text' },
      { name: '税率', value: incomeTaxRate, unit: 'pct', displayValue: `${(incomeTaxRate * 100).toFixed(2)}%(${incomeTaxRate})` },
      { name: '控除額', value: incomeRateRow.deduction, unit: 'yen', displayValue: formatYen(incomeRateRow.deduction) },
    ],
    resultKey: 'tax.income.marginalRate',
  });

  push(lines, {
    section: 'tax.income',
    display: 'calc',
    title: '所得税（総合課税）',
    expression: 'floor(課税所得×税率−控除額)',
    terms: [asTerm('課税所得（総合）', taxableIncome), { name: '税率', value: incomeTaxRate, unit: 'pct', displayValue: `${(incomeTaxRate * 100).toFixed(2)}%(${incomeTaxRate})` }, asTerm('控除額', incomeRateRow.deduction)],
    result: incomeTax,
    resultKey: 'tax.income.general',
  });

  // --- Resident tax ---
  // 住民税の計算: 所得額 → 課税所得金額 → 所得割額 → 住民税
  // 1. 所得額 = 総所得（給与所得 + 事業所得 + 株式（総合））
  const residentIncomeAmount = totalIncomeGeneral; // 所得額 = 総所得
  
  // 2. 課税所得金額 = 所得額 - 所得控除額
  // 住民税基礎控除は合計所得金額に応じて段階的に設定（2025年以降）
  const residentBasicDeduction = rule.resident_tax.basic_deduction
    ? pickBracketValue(totalIncomeGeneral, rule.resident_tax.basic_deduction.brackets)
    : Math.max(0, basicDeduction - 50000); // 2024年以前は所得税基礎控除 - 5万円
  // 生命保険料控除と地震保険料控除は住民税控除の計算結果を使用
  const residentDeductionTotal = residentBasicDeduction + socialInsuranceDeduction + ideco + small + safety + lifeTotalResidentTax + earthquakeResidentTax + medDed;
  const residentTaxableIncomeRaw = Math.max(0, residentIncomeAmount - residentDeductionTotal);
  const residentTaxableIncome = Math.floor(residentTaxableIncomeRaw / 1000) * 1000; // 1000円未満切り捨て
  
  // 3. 所得割額 = 課税所得 × 10%（税率）- 税額控除額（今回は税額控除額は0と仮定）
  const residentRate = input.overrides.residentIncomeRateOverride ?? rule.resident_tax.income_rate;
  const residentIncomePart = floor(residentTaxableIncome * residentRate);
  
  push(lines, {
    section: 'tax.resident',
    display: 'info',
    title: '住民税（限界税率）',
    expression: '所得割率（上書き可能）',
    terms: [
      { name: '基準自治体', value: rule.resident_tax.municipality, unit: 'text' },
      { name: '所得割率', value: residentRate, unit: 'pct', displayValue: `${(residentRate * 100).toFixed(2)}%(${residentRate})` },
    ],
    resultKey: 'tax.resident.marginalRate',
  });
  
  // 分離課税の株式税額に含まれる住民税を計算（先に計算）
  // 税率0.20315の内訳: 所得税15.315% + 住民税5%（復興特別所得税0.315%含む）
  const separateResidentRateForResident = 0.05; // 住民税5%
  const separateResidentTaxForResident = floor(stockSeparateBase * separateResidentRateForResident);
  
  // 4. 均等割 = 5,000円（一般的な均等割額）
  const residentPerCapita = 5000; // 均等割 = 5,000円
  
  const residentTotal = residentIncomePart + residentPerCapita + separateResidentTaxForResident;

  push(lines, {
    section: 'tax.resident',
    display: 'calc',
    title: '住民税 所得額',
    expression: '総所得（給与所得 + 事業所得 + 株式（総合））',
    terms: [
      asTerm('給与所得', salaryIncome),
      asTerm('事業所得', businessIncome),
      asTerm('株式（総合）', stockGeneralIncome),
    ],
    result: residentIncomeAmount,
    resultKey: 'tax.resident.incomeAmount',
  });
  
  push(lines, {
    section: 'tax.resident',
    display: 'calc',
    title: '住民税 課税所得金額',
    expression: '所得額 - 所得控除額',
    terms: [
      asTerm('所得額', residentIncomeAmount),
      asTerm('基礎控除（住民税）', residentBasicDeduction),
      asTerm('社会保険料控除', socialInsuranceDeduction),
      asTerm('iDeCo掛金', ideco),
      asTerm('小規模企業共済', small),
      asTerm('経営セーフティ共済', safety),
      asTerm('生命保険料控除（住民税）', lifeTotalResidentTax),
      asTerm('地震保険料控除（住民税）', earthquakeResidentTax),
      asTerm('医療費控除', medDed),
      asTerm('所得控除合計', residentDeductionTotal),
    ],
    result: residentTaxableIncome,
    resultKey: 'tax.resident.taxableIncome',
    notes: ['1000円未満の端数を切り捨て', '生命保険料控除と地震保険料控除は住民税控除の計算結果を使用'],
  });
  
  push(lines, {
    section: 'tax.resident',
    display: 'calc',
    title: '住民税（所得割）',
    expression: 'floor(課税所得金額 × 所得割率10%)',
    terms: [
      { name: '基準自治体', value: rule.resident_tax.municipality, unit: 'text' },
      asTerm('課税所得金額', residentTaxableIncome),
      { name: '所得割率', value: residentRate, unit: 'pct', displayValue: `${(residentRate * 100).toFixed(2)}%(${residentRate})` },
    ],
    result: residentIncomePart,
    resultKey: 'tax.resident.incomePart',
  });

  push(lines, {
    section: 'tax.resident',
    display: 'calc',
    title: '住民税（合計）',
    expression: '所得割 + 均等割 + 分離課税の住民税',
    terms: [
      asTerm('所得割', residentIncomePart),
      asTerm('均等割', residentPerCapita),
      asTerm('分離課税の住民税', separateResidentTaxForResident),
    ],
    result: residentTotal,
    resultKey: 'tax.resident.total',
  });
  
  // 分離課税の住民税を住民税合計に含める（既に上で計算済み）

  // --- Separate tax ---
  const separateRate = input.overrides.separateTaxRateOverride ?? rule.separate_tax.stock.rate;
  const separateTax = floor(stockSeparateBase * separateRate);
  // 税率0.20315の内訳: 所得税15% + 復興特別所得税0.315% + 住民税5%
  const separateIncomeTaxRateForSeparate = 0.15; // 所得税15%
  const separateReconstructionRateForSeparate = 0.00315; // 復興特別所得税0.315%
  const separateResidentRateForSeparate = 0.05; // 住民税5%
  const separateIncomeTax = floor(stockSeparateBase * separateIncomeTaxRateForSeparate);
  const separateReconstructionTax = floor(stockSeparateBase * separateReconstructionRateForSeparate);
  const separateResidentTaxForSeparate = floor(stockSeparateBase * separateResidentRateForSeparate);
  
  // 所得税（合計）= 所得税（総合課税）+ 分離課税の所得税 + 復興特別所得税
  const incomeTaxTotal = incomeTax + separateIncomeTax + separateReconstructionTax;

  push(lines, {
    section: 'tax.income',
    display: 'calc',
    title: '所得税（合計）',
    expression: '所得税（総合課税）+ 分離課税の所得税 + 復興特別所得税',
    terms: [
      asTerm('所得税（総合課税）', incomeTax),
      asTerm('分離課税の所得税', separateIncomeTax),
      asTerm('復興特別所得税', separateReconstructionTax),
    ],
    result: incomeTaxTotal,
    resultKey: 'tax.income.total',
  });

  push(lines, {
    section: 'tax.separate',
    display: 'calc',
    title: '株式（申告分離課税）税額',
    expression: 'floor((配当＋売買益)×税率20.315%)',
    terms: [
      asTerm('配当（分離）', stockSeparateDividend),
      asTerm('売買益（分離）', stockSeparateCapitalGain),
      { name: '税率', value: separateRate, unit: 'pct', displayValue: `${(separateRate * 100).toFixed(3)}%(${separateRate})` },
    ],
    result: separateTax,
    resultKey: 'tax.separate.stock',
    notes: [
      `税率20.315%の内訳:`,
      `- 所得税: ${(separateIncomeTaxRateForSeparate * 100).toFixed(2)}% = ${formatYen(separateIncomeTax)}`,
      `- 復興特別所得税: ${(separateReconstructionRateForSeparate * 100).toFixed(3)}% = ${formatYen(separateReconstructionTax)}`,
      `- 住民税: ${(separateResidentRateForSeparate * 100).toFixed(2)}% = ${formatYen(separateResidentTaxForSeparate)}`,
    ],
  });

  // --- Furusato ---
  const specialCap = Math.floor(residentIncomePart * 0.2);
  const denom = 1 - incomeTaxRate - residentRate;
  const deductibleLimit = denom > 0 ? Math.floor(specialCap / denom) : 0;
  const donationLimit = deductibleLimit + 2000;
  const furusatoIncomeTax = Math.floor(deductibleLimit * incomeTaxRate);
  const furusatoResidentBase = Math.floor(deductibleLimit * residentRate);
  const furusatoResidentSpecial = deductibleLimit - furusatoIncomeTax - furusatoResidentBase;

  push(lines, {
    section: 'furusato.limit',
    display: 'calc',
    title: 'ふるさと納税 控除対象額（上限）',
    expression: '(住民税所得割額 × 20%) ÷ (1 − 所得税率 − 10%)',
    terms: [
      asTerm('住民税所得割額', residentIncomePart),
      { name: '住民税特例分 上限率', value: 0.2, unit: 'pct', displayValue: '20%(0.20)' },
      { name: '所得税率', value: incomeTaxRate, unit: 'pct', displayValue: `${(incomeTaxRate * 100).toFixed(2)}%(${incomeTaxRate})` },
      { name: '住民税基本分率', value: residentRate, unit: 'pct', displayValue: `${(residentRate * 100).toFixed(2)}%(${residentRate})` },
    ],
    result: deductibleLimit,
    resultKey: 'furusato.deductible.limit',
    notes: [`特例分 ≤ 所得割×20%: ${furusatoResidentSpecial <= specialCap ? 'OK' : 'NG'}`],
  });

  push(lines, {
    section: 'furusato.limit',
    display: 'calc',
    title: 'ふるさと納税 寄付額上限',
    expression: '控除対象額 + 自己負担額',
    terms: [
      { key: 'furusato.deductible.limit', name: '控除対象額', value: deductibleLimit, unit: 'yen', displayValue: formatYen(deductibleLimit) },
      { name: '自己負担額', value: 2000, unit: 'yen', displayValue: '￥2,000' },
    ],
    result: donationLimit,
    resultKey: 'furusato.donation.limit',
  });

  push(lines, {
    section: 'furusato.breakdown',
    display: 'calc',
    title: 'ふるさと納税 所得税控除',
    expression: '控除対象額 × 所得税率',
    terms: [
      { key: 'furusato.deductible.limit', name: '控除対象額', value: deductibleLimit, unit: 'yen', displayValue: formatYen(deductibleLimit) },
      { name: '所得税率', value: incomeTaxRate, unit: 'pct', displayValue: `${(incomeTaxRate * 100).toFixed(2)}%(${incomeTaxRate})` },
    ],
    result: furusatoIncomeTax,
    resultKey: 'furusato.breakdown.incomeTax',
  });

  push(lines, {
    section: 'furusato.breakdown',
    display: 'calc',
    title: 'ふるさと納税 住民税基本分',
    expression: '控除対象額 × 10%',
    terms: [
      { key: 'furusato.deductible.limit', name: '控除対象額', value: deductibleLimit, unit: 'yen', displayValue: formatYen(deductibleLimit) },
      { name: '住民税基本分率', value: residentRate, unit: 'pct', displayValue: `${(residentRate * 100).toFixed(2)}%(${residentRate})` },
    ],
    result: furusatoResidentBase,
    resultKey: 'furusato.breakdown.residentBase',
  });

  push(lines, {
    section: 'furusato.breakdown',
    display: 'calc',
    title: 'ふるさと納税 住民税特例分',
    expression: '控除対象額 − 所得税控除 − 住民税基本分',
    terms: [
      { key: 'furusato.deductible.limit', name: '控除対象額', value: deductibleLimit, unit: 'yen', displayValue: formatYen(deductibleLimit) },
      { key: 'furusato.breakdown.incomeTax', name: '所得税控除', value: furusatoIncomeTax, unit: 'yen', displayValue: formatYen(furusatoIncomeTax) },
      { key: 'furusato.breakdown.residentBase', name: '住民税基本分', value: furusatoResidentBase, unit: 'yen', displayValue: formatYen(furusatoResidentBase) },
    ],
    result: furusatoResidentSpecial,
    resultKey: 'furusato.breakdown.residentSpecial',
    notes: [`この金額は『住民税所得割額×20%』以下である必要があります（上限: ${formatYen(specialCap)}）`],
  });

  const sites = input.comparisonSites.filter((s) => s.amount > 0);
  const minSite = sites.length > 0 ? Math.min(...sites.map((s) => s.amount)) : Number.POSITIVE_INFINITY;
  const adoptedLimit = Number.isFinite(minSite) ? Math.min(donationLimit, minSite) : donationLimit;

  push(lines, {
    section: 'furusato.limit',
    display: 'calc',
    title: '仲介サイト比較',
    expression: 'サイト最小 vs 本アプリ（低い方を採用）',
    terms: [
      { name: 'サイト最小', value: Number.isFinite(minSite) ? minSite : 0, unit: 'yen', displayValue: Number.isFinite(minSite) ? formatYen(minSite) : '未入力' },
      { name: '本アプリ', value: donationLimit, unit: 'yen', displayValue: formatYen(donationLimit) },
    ],
    result: adoptedLimit,
    resultKey: 'furusato.adopted',
    notes: ['比較結果として、より低い上限額を採用します'],
  });

  // 想定差分（未実装の法定軽減）
  if (nhiTotal > 0) {
    // 7割軽減：国保料 - 国保料 × (100% - 70%) = 国保料 - 国保料 × 30% = 国保料 × 70%
    const diff70 = Math.round(nhiTotal - nhiTotal * (1 - 0.7));
    // 5割軽減：国保料 - 国保料 × (100% - 50%) = 国保料 - 国保料 × 50% = 国保料 × 50%
    const diff50 = Math.round(nhiTotal - nhiTotal * (1 - 0.5));
    // 2割軽減：国保料 - 国保料 × (100% - 20%) = 国保料 - 国保料 × 80% = 国保料 × 20%
    const diff20 = Math.round(nhiTotal - nhiTotal * (1 - 0.2));
    
    push(lines, {
      section: 'diff',
      display: 'info',
      title: '国保法定軽減（未実装）',
      expression: '法定軽減が適用された場合の想定差分',
      terms: [],
      notes: ['国保の法定軽減（7割/5割/2割）は未実装です。以下は参考値です。'],
      resultKey: 'diff.nhi.reductionInfo',
    });

    if (diff70 > 0) {
      push(lines, {
        section: 'diff',
        display: 'calc',
        title: '7割軽減適用時の想定差分',
        expression: '国保料 - 国保料 × (100% - 70%)',
        terms: [
          asTerm('国保料', nhiTotal),
          { name: '軽減率', value: 0.7, unit: 'pct', displayValue: '70%' },
          { name: '軽減後負担率', value: 0.3, unit: 'pct', displayValue: '30%' },
        ],
        result: -diff70,
        resultKey: 'diff.nhi.reduction70',
        notes: ['7割軽減が適用された場合、国保料は30%になります'],
      });
    }

    if (diff50 > 0) {
      push(lines, {
        section: 'diff',
        display: 'calc',
        title: '5割軽減適用時の想定差分',
        expression: '国保料 - 国保料 × (100% - 50%)',
        terms: [
          asTerm('国保料', nhiTotal),
          { name: '軽減率', value: 0.5, unit: 'pct', displayValue: '50%' },
          { name: '軽減後負担率', value: 0.5, unit: 'pct', displayValue: '50%' },
        ],
        result: -diff50,
        resultKey: 'diff.nhi.reduction50',
        notes: ['5割軽減が適用された場合、国保料は50%になります'],
      });
    }

    if (diff20 > 0) {
      push(lines, {
        section: 'diff',
        display: 'calc',
        title: '2割軽減適用時の想定差分',
        expression: '国保料 - 国保料 × (100% - 20%)',
        terms: [
          asTerm('国保料', nhiTotal),
          { name: '軽減率', value: 0.2, unit: 'pct', displayValue: '20%' },
          { name: '軽減後負担率', value: 0.8, unit: 'pct', displayValue: '80%' },
        ],
        result: -diff20,
        resultKey: 'diff.nhi.reduction20',
        notes: ['2割軽減が適用された場合、国保料は80%になります'],
      });
    }
  }

  const summary: Summary = {
    year: input.year,
    incomeTaxGeneral: incomeTaxTotal,
    residentTaxTotal: residentTotal,
    separateTaxStock: separateTax,
    socialInsuranceDeduction: socialInsuranceDeduction,
    furusatoDonationLimit: donationLimit,
    adoptedLimit,
  };

  const derived: DerivedValues = {
    taxableIncomeGeneral: taxableIncome,
    residentIncomePart,
    incomeTaxRate,
    totalIncomeGeneral,
    socialInsuranceTotal: siTotal,
    nhiTotal,
    npTotal,
    npMonthsPay: npPayMonths,
    npMonthsExempt: npExemptMonths,
    furusatoDonationLimit: donationLimit,
  };

  return {
    calcLines: lines,
    summary,
    derived,
  };
}

