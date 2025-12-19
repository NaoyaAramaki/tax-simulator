export type Currency = number;

export type DisplayKind = 'calc' | 'info';

export type Unit = 'yen' | 'pct' | 'count' | 'month' | 'text';

export type Term = {
  key?: string;
  name: string;
  value: number | string;
  unit: Unit;
  displayValue?: string;
};

export type CalcLine = {
  id: string;
  section: string;
  title: string;
  expression: string;
  terms: Term[];
  display?: DisplayKind;
  result?: number;
  resultKey?: string;
  notes?: string[];
  warnings?: string[];
};

export type RateTableRow = {
  max?: number | null;
  rate: number;
  deduction: number;
  label: string;
};

export type BasicDeductionBracket = {
  max_income: number | null;
  deduction: number;
  effective_from?: string;
  effective_to?: string | null;
  overrideable?: boolean;
};

export type SalaryIncomeDeductionBracket = {
  max_income: number | null;
  formula: string;
  effective_from?: string;
  effective_to?: string | null;
  overrideable?: boolean;
};

export type LifeInsuranceBracket = {
  maxPaid: number | null;
  kind: 'fixed' | 'linear';
  value?: number;
  rate?: number;
  add?: number;
};

export type RuleYear = {
  year: number;
  inherits_from?: number;
  income_tax: {
    rate_table: RateTableRow[];
    basic_deduction: {
      type: 'brackets';
      unit: 'yen';
      brackets: BasicDeductionBracket[];
      notes?: string[];
      sources?: string[];
    };
    salary_income_deduction: {
      type: 'function_with_brackets';
      changed_range_only?: boolean;
      brackets: SalaryIncomeDeductionBracket[];
      minimum: number;
      notes?: string[];
      sources?: string[];
    };
    dependent_income_threshold?: {
      value: number;
      sources?: string[];
    };
  };
  pension: {
    national_pension_monthly: {
      value: number | null;
      unit: 'yen';
      needs_update?: boolean;
      sources?: string[];
    };
  };
  resident_tax: {
    municipality: string;
    income_rate: number;
    per_capita: number;
    note?: string;
    basic_deduction?: {
      type: 'brackets';
      unit: 'yen';
      brackets: BasicDeductionBracket[];
      notes?: string[];
    };
  };
  separate_tax: {
    stock: {
      rate: number;
    };
  };
  medical_deduction: {
    threshold_fixed: number;
    threshold_rate: number;
    cap: number;
  };
  life_insurance_deduction: {
    totalCap: number;
    general: { brackets: LifeInsuranceBracket[] };
    nursingMedical: { brackets: LifeInsuranceBracket[] };
    pension: { brackets: LifeInsuranceBracket[] };
  };
  earthquake_deduction?: {
    cap: number;
  };
  blue_deduction?: {
    book: number;
    electronic: number;
    none?: number;
  };
  defaults?: {
    siRate?: number;
  };
};

export type SalarySource = { id: string; name: string; annual: number };

export type TaxInput = {
  year: number;
  family: {
    taxpayerAge: number;
    spouseCount: number;
    dependentCount: number;
    dependents4064Count: number;
    preschoolCount: number;
  };
  salary: {
    enabled: boolean;
    sources: SalarySource[];
    mainSourceId: string | null;
  };
  business: {
    enabled: boolean;
    sales: number;
    expenses: number;
    blueReturn: {
      enabled: boolean;
      mode: 'electronic' | 'book';
    };
  };
  stocks: {
    dividend: { amount: number; taxMode: 'general' | 'separate' };
    capitalGain: { amount: number; taxMode: 'general' | 'separate' };
  };
  deductions: {
    ideco: number;
    smallBizMutualAid: number;
    safetyMutualAid: number;
    lifeInsurance: {
      general: number;
      nursingMedical: number;
      pension: number;
    };
    earthquake: number;
    medical: {
      enabled: boolean;
      treatment: number;
      transport: number;
      other: number;
      reimbursed: number;
    };
  };
  insurance: {
    mode: 'employeeOnly' | 'nationalOnly' | 'mixed';
    employee: {
      inputMode: 'manual' | 'estimate';
      amount?: number;
      salarySourceId?: string;
      baseSalaryManual?: number;
    } | null;
    national: {
      nhi: {
        mode: 'manual' | 'estimate';
        amount?: number;
      };
      np: {
        payMonths: number;
        exemptMonths: number;
        monthlyOverride?: number | null;
      };
    } | null;
    mixed: {
      blocks: MixedBlock[];
    } | null;
    nhiHousehold: {
      membersIncludingTaxpayer: number;
      members4064: number;
      preschool: number;
    };
  };
  overrides: {
    incomeTaxRateOverride?: number | null;
    residentIncomeRateOverride?: number | null;
    separateTaxRateOverride?: number | null;
  };
  comparisonSites: { id: string; name: string; amount: number }[];
  save: {
    selectedSaveId: string | null;
    previousYearTotalIncome: number | null;
    previousYearInputMode: 'none' | 'fromSave' | 'useCurrent' | 'manual';
    previousYearManual?: {
      totalIncome: number;
      incomeBreakdown: {
        salary: number;
        business: number;
        realEstate: number;
        dividend: number;
        transfer: number;
        temporary: number;
        miscellaneous: number;
      };
      deductions: {
        basic: number;
        spouse: number;
        dependent: number;
        disabled: number;
        widow: number;
        workingStudent: number;
        socialInsurance: number;
        lifeInsurance: number;
        earthquake: number;
        medical: number;
        donation: number;
      };
      taxCredits: {
        housingLoan: number;
        dividend: number;
        foreignTax: number;
      };
      household: {
        nhiMembers: number;
        members4064: number;
        preschool: number;
        householdIncome: number;
      };
    };
  };
};

export type MixedBlock =
  | {
      id: string;
      type: 'employee';
      months: number;
      breakdown: {
        id: string;
        mode: 'manual' | 'estimate';
        months: number;
        amount?: number;
        baseSalarySourceId?: string;
        baseSalaryManual?: number;
      }[];
    }
  | {
      id: string;
      type: 'national';
      months: number;
      nhiBreakdown: {
        id: string;
        mode: 'manual' | 'estimate';
        months: number;
        amount?: number;
      }[];
      npPayMonths: number;
      npExemptMonths: number;
      npMonthlyOverride?: number | null;
    };

export type DerivedValues = {
  taxableIncomeGeneral: number;
  residentIncomePart: number;
  incomeTaxRate: number;
  totalIncomeGeneral: number;
  socialInsuranceTotal: number;
  nhiTotal: number;
  npTotal: number;
  npMonthsPay: number;
  npMonthsExempt: number;
  furusatoDonationLimit: number;
};

export type Summary = {
  year: number;
  incomeTaxGeneral: number;
  residentTaxTotal: number;
  separateTaxStock: number;
  socialInsuranceDeduction: number;
  furusatoDonationLimit: number;
  adoptedLimit: number;
};

export type EngineOutput = {
  calcLines: CalcLine[];
  summary: Summary;
  derived: DerivedValues;
};

export type ValidationError = { field: string; message: string };
export type ValidationWarning = { field: string; message: string };
export type ValidationResult = {
  errors: ValidationError[];
  warnings: ValidationWarning[];
};

export type SaveRecord = {
  id: string;
  schemaVersion: 1;
  year: number;
  name: string;
  input: TaxInput;
  summary: Summary;
  derived: DerivedValues;
  previousYearTotalIncome: number;
  createdAt: string;
  updatedAt: string;
};

