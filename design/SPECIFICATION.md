# 納税金額シミュレーター 仕様書

## 1. プロジェクト概要

### 1.1 目的
本アプリケーションは、所得税・住民税・株式分離課税・ふるさと納税の上限額を計算するためのローカル実行型のシミュレーターです。計算式の透明性を重視し、すべての計算過程を`CalcLine`として表示します。

### 1.2 技術スタック
- **フレームワーク**: React 18.3.1 + TypeScript 5.4.5
- **ビルドツール**: Vite 5.4.8
- **実行環境**: ブラウザ（ローカル実行、外部API不要）
- **データ保存**: `localStorage`（`tax-sim:saves:v1`キー）
- **ルール管理**: 年度別JSONファイル（`rules_YYYY.json`）

### 1.3 対応年度
- 2024年度
- 2025年度
- 2026年度
- 2027年度

## 2. ディレクトリ構造

```
tax_simulator/
├── src/
│   ├── App.tsx                    # メインUIコンポーネント（アコーディオン形式）
│   ├── main.tsx                   # エントリーポイント
│   ├── domain/
│   │   ├── types.ts               # 型定義（TaxInput, RuleYear, CalcLine等）
│   │   ├── engine.ts              # 計算エンジン（calculateAll）
│   │   ├── validation.ts           # 入力バリデーション
│   │   ├── storage.ts              # localStorage保存/読み込み
│   │   ├── sample.ts               # デモ入力データ生成
│   │   └── rules/
│   │       ├── index.ts            # ルール読み込み（年度別）
│   │       ├── rules_2024.json     # 2024年度ルール
│   │       ├── rules_2025.json     # 2025年度ルール
│   │       ├── rules_2026.json     # 2026年度ルール
│   │       └── rules_2027.json     # 2027年度ルール
│   └── utils/
│       └── format.ts               # 金額フォーマット（asYen）
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 3. 型定義（`src/domain/types.ts`）

### 3.1 入力型（`TaxInput`）

```typescript
type TaxInput = {
  year: number;                    // 年度（2024-2027）
  family: {
    taxpayerAge: number;            // 納税者年齢
    spouseCount: number;            // 配偶者数（任意入力）
    dependentCount: number;         // 扶養人数（任意入力）
    dependents4064Count: number;    // 扶養内40-64歳人数
    preschoolCount: number;         // 扶養内未就学児人数
  };
  salary: {
    enabled: boolean;               // 給与収入ON/OFF
    sources: SalarySource[];       // 給与支払先リスト（複数可）
    mainSourceId: string | null;   // 主たる給与支払先ID
  };
  business: {
    enabled: boolean;               // 事業所得ON/OFF
    sales: number;                  // 売上
    expenses: number;               // 経費
    blueReturn: {
      enabled: boolean;             // 青色申告ON/OFF
      mode: 'electronic' | 'book'; // 電子/帳簿
    };
  };
  stocks: {
    dividend: {
      amount: number;               // 配当額
      taxMode: 'general' | 'separate'; // 総合/分離
    };
    capitalGain: {
      amount: number;               // 売買益
      taxMode: 'general' | 'separate'; // 総合/分離
    };
  };
  deductions: {
    ideco: number;                  // iDeCo掛金
    smallBizMutualAid: number;     // 小規模企業共済掛金
    safetyMutualAid: number;        // 経営セーフティ共済掛金
    lifeInsurance: {
      general: number;              // 一般生命保険料
      nursingMedical: number;       // 介護医療保険料
      pension: number;              // 個人年金保険料
    };
    earthquake: number;             // 地震保険料
    medical: {
      enabled: boolean;             // 医療費控除ON/OFF
      treatment: number;           // 治療費等
      transport: number;           // 通院交通費
      other: number;                // その他
      reimbursed: number;           // 補填額
    };
  };
  insurance: {
    mode: 'employeeOnly' | 'nationalOnly' | 'mixed'; // 保険モード
    employee: { ... } | null;       // 社保のみモード
    national: { ... } | null;       // 国保のみモード
    mixed: { blocks: MixedBlock[] } | null; // 複合モード
    nhiHousehold: {
      membersIncludingTaxpayer: number; // 国保加入者数（本人含む）
      members4064: number;          // 40-64歳人数
      preschool: number;            // 未就学児人数
    };
  };
  overrides: {
    incomeTaxRateOverride?: number | null;      // 所得税率上書き
    residentIncomeRateOverride?: number | null; // 住民税所得割率上書き
    separateTaxRateOverride?: number | null;    // 分離課税税率上書き
  };
  comparisonSites: {               // 仲介サイト比較
    id: string;
    name: string;
    amount: number;                 // 上限額
  }[];
  save: {
    selectedSaveId: string | null;  // 選択中保存ID
    previousYearTotalIncome: number | null; // 前年総所得（国保推計用）
    previousYearInputMode: 'none' | 'fromSave' | 'useCurrent' | 'manual'; // 前年所得の入力方法（必須選択）
    previousYearManual?: { ... };  // 前年情報の詳細手入力（manual選択時）
  };
};
```

### 3.2 ルール型（`RuleYear`）

```typescript
type RuleYear = {
  year: number;
  inherits_from?: number;          // 継承元年度
  income_tax: {
    rate_table: RateTableRow[];    // 所得税速算表
    basic_deduction: {
      type: 'brackets';
      brackets: BasicDeductionBracket[]; // 基礎控除段階
    };
    salary_income_deduction: {
      type: 'function_with_brackets';
      brackets: SalaryIncomeDeductionBracket[]; // 給与所得控除
      minimum: number;
    };
    dependent_income_threshold?: { value: number };
  };
  pension: {
    national_pension_monthly: { value: number | null };
  };
  resident_tax: {
    municipality: string;          // 基準自治体（例: "東京都 世田谷区"）
    income_rate: number;            // 所得割率（0.1 = 10%）
    per_capita: number;             // 均等割額
  };
  separate_tax: {
    stock: { rate: number };        // 株式分離課税税率
  };
  medical_deduction: {
    threshold_fixed: number;        // 医療費控除閾値（固定）
    threshold_rate: number;         // 医療費控除閾値（所得割合）
    cap: number;                    // 医療費控除上限
  };
  life_insurance_deduction: {
    totalCap: number;               // 生命保険料控除合計上限
    general: { brackets: LifeInsuranceBracket[] };
    nursingMedical: { brackets: LifeInsuranceBracket[] };
    pension: { brackets: LifeInsuranceBracket[] };
  };
  earthquake_deduction?: { cap: number };
  blue_deduction?: {
    book: number;                   // 青色申告帳簿方式控除
    electronic: number;             // 青色申告電子帳簿控除
    none?: number;
  };
  defaults?: {
    siRate?: number;                // 社保推計係数（デフォルト0.15）
  };
};
```

### 3.3 計算結果型（`EngineOutput`）

```typescript
type EngineOutput = {
  calcLines: CalcLine[];           // 計算過程（全行）
  summary: Summary;                // サマリー
  derived: DerivedValues;           // 導出値
};

type Summary = {
  year: number;
  incomeTaxGeneral: number;         // 所得税（合計）= 所得税（総合課税）+ 分離課税の所得税 + 復興特別所得税（100円未満切り捨て）
  residentTaxTotal: number;         // 住民税合計
  separateTaxStock: number;        // 株式分離課税（計算結果サマリーには表示しない）
  socialInsuranceDeduction: number; // 社会保険料控除合計
  furusatoDonationLimit: number;    // ふるさと納税上限（本アプリ）
  adoptedLimit: number;             // ふるさと納税上限（採用値：サイト比較後）
};

type DerivedValues = {
  taxableIncomeGeneral: number;     // 課税所得（総合）
  residentIncomePart: number;       // 住民税所得割額（100円未満切り捨て）
  incomeTaxRate: number;            // 所得税率（限界）
  totalIncomeGeneral: number;       // 総所得（総合）
  socialInsuranceTotal: number;     // 社保合計
  nhiTotal: number;                 // 国保合計
  npTotal: number;                  // 国年合計
  npMonthsPay: number;              // 国年加入月数
  npMonthsExempt: number;           // 国年免除月数
  furusatoDonationLimit: number;    // ふるさと納税上限
};
```

### 3.4 計算行型（`CalcLine`）

```typescript
type CalcLine = {
  id: string;                      // 一意ID
  section: string;                  // セクション（例: "income.salary"）
  title: string;                    // タイトル
  expression: string;               // 計算式説明
  terms: Term[];                    // 計算項
  display?: 'calc' | 'info';       // 表示種別（calc=結果表示、info=情報のみ）
  result?: number;                  // 計算結果（display='calc'時のみ表示）
  resultKey?: string;               // 結果キー（他行参照用）
  notes?: string[];                 // 注記
  warnings?: string[];              // 警告
};

type Term = {
  key?: string;                    // 参照キー（他CalcLine参照）
  name: string;                     // 項名
  value: number | string;           // 値
  unit: 'yen' | 'pct' | 'count' | 'month' | 'text';
  displayValue?: string;            // 表示値（フォーマット済み）
};
```

### 3.5 保存レコード型（`SaveRecord`）

```typescript
type SaveRecord = {
  id: string;                       // UUID
  schemaVersion: 1;                // スキーマバージョン
  year: number;                     // 年度
  name: string;                     // 保存名（自動生成: "YYYY年度_納税金額試算_YYYYMMDD-連番"）
  input: TaxInput;                  // 入力データ
  summary: Summary;                 // 計算結果サマリー
  derived: DerivedValues;           // 導出値
  previousYearTotalIncome: number;  // 前年総所得（次年度の国保推計用）
  createdAt: string;                // ISO8601作成日時
  updatedAt: string;                // ISO8601更新日時
};
```

## 4. 計算エンジン（`src/domain/engine.ts`）

### 4.1 主要関数

#### `calculateAll(input: TaxInput): EngineOutput`
すべての計算を実行し、`CalcLine`配列、`Summary`、`DerivedValues`を返す。

**計算順序**:
1. **収入計算** (`calcIncome`)
   - 給与収入合計 → 給与所得控除 → 給与所得
   - 事業所得（売上-経費-青色控除）
   - 株式収入（総合/分離に分割）
   - 総所得（総合課税）

2. **保険料計算** (`calcInsurance`)
   - **社保のみモード**: 手入力 or 推計（収入欄の「主たる給与」×係数）
   - **国保のみモード**: 国保（手入力/推計）、国年（加入/免除月数）
   - **複合モード**: ブロック単位で社保/国保/国年を按分計算
     - 按分計算: `Math.round(年額 × 月数 / 12)`（円単位四捨五入）

3. **控除計算** (`calcDeductions`)
   - 基礎控除（所得金額に応じた段階制）
   - 社会保険料控除（社保+国保+国年）
   - iDeCo掛金、小規模企業共済、経営セーフティ共済
   - 生命保険料控除（所得税/住民税で計算式・上限が異なる）
   - 地震保険料控除（所得税/住民税で上限が異なる）
   - 医療費控除（支払合計-補填-閾値、上限あり）

4. **課税所得計算** (`calcTaxable`)
   - `max(0, 総所得（総合） - 所得控除合計)`

5. **所得税計算** (`calcIncomeTax`)
   - 速算表から税率・控除額を取得
   - `floor(課税所得 × 税率 - 控除額)`
   - 限界税率を`DerivedValues`に格納

6. **住民税計算** (`calcResidentTax`)
   - 課税所得金額: `floor(max(0, 所得額 - 所得控除額) / 1000) * 1000`
     - ※生命保険料控除・地震保険料控除は住民税用控除額を使用する
     - ※計算過程では控除の内訳を明示する（社会保険/iDeCo/共済/生命保険（住民税）/地震（住民税）/医療費など）
   - 所得割: `floor(課税所得金額 × 所得割率)`（デフォルト10%）
   - 均等割: 固定額（世田谷区標準）
   - 合計: 所得割 + 均等割

7. **分離課税計算** (`calcSeparateTax`)
   - `floor((配当（分離）+ 売買益（分離)) × 税率)`

8. **ふるさと納税計算** (`calcFurusato`)
   - **控除対象額（上限）**: `(住民税（合計） × 20%) ÷ (1 - 所得税率 - 10%)`
   - **寄付額上限**: 控除対象額 + 2,000円
   - **内訳**:
     - 所得税控除: 控除対象額 × 所得税率
     - 住民税基本分: 控除対象額 × 10%
     - 住民税特例分: 控除対象額 - 所得税控除 - 住民税基本分
   - **仲介サイト比較**: 本アプリと仲介サイトの最小値を採用

### 4.2 ヘルパー関数

- `calcSalaryDeduction(income, brackets, minimum)`: 給与所得控除計算
- **生命保険料控除（所得税・カテゴリ別）**
  - 2万円以下: 支払保険料等の全額
  - 2万超～4万以下: 支払保険料/2 + 1万円
  - 4万超～8万以下: 支払保険料/4 + 2万円
  - 8万超: 一律4万円
- **生命保険料控除（住民税・カテゴリ別）**
  - 2万円以下: 支払保険料等の全額
  - 2万超～4万以下: 支払保険料/2 + 6千円
  - 4万超～8万以下: 支払保険料/4 + 1.4万円
  - 8万超: 一律2万8千円
- **合計**
  - 所得税: `min(12万円, 一般＋介護医療＋個人年金)`
  - 住民税: `min(7万円, 一般＋介護医療＋個人年金)`
- `prorateRound(annual, months)`: 按分計算（年額×月数/12、四捨五入）
- `pickBracketValue(income, brackets)`: 段階制控除の値取得
- `evalFormula(formula, income)`: 数式評価（給与所得控除用）

## 5. バリデーション（`src/domain/validation.ts`）

### 5.1 主要関数

#### `validateInput(input: TaxInput): ValidationResult`
入力データの妥当性を検証し、エラーと警告を返す。

**検証項目**:

1. **年度**: 2024/2025/2026/2027のいずれか
2. **給与**: 
   - ON時は支払先1件以上
   - 主たる支払先が選択されている
   - 年額が0以上
3. **事業**: 
   - ON時は売上>0
   - 経費≥0
4. **保険（複合モード）**:
   - ブロック合計月数 = 12
   - 各ブロック月数: 1-12
   - 社保ブロック: サブ月数合計 = 親ブロック月数
   - 国保ブロック: 国保サブ月数合計 = 親ブロック月数
   - 国保ブロック: 国民年金月数（加入月数+免除月数）= 親ブロック月数
5. **保険（国保のみモード）**:
   - 国年加入月数 + 免除月数 = 12
6. **国保世帯**:
   - 加入者数（本人含む）≥1
   - 40-64歳人数 ≤ 加入者数
   - 未就学児人数 ≤ 加入者数
   - 40-64歳+未就学児合計 ≤ 加入者数
7. **仲介サイト**: 上限額≥0
8. **警告**:
   - 扶養人数より内訳人数が多い場合
9. **前年所得（国保推計用）**:
   - 前年所得の入力方法は必須（未選択不可）
   - 「保存データから選択」の場合は保存データ選択も必須（未選択不可）

## 6. データ保存（`src/domain/storage.ts`）

### 6.1 主要関数

#### `loadSaves(): SaveRecord[]`
`localStorage`から全保存レコードを読み込み、更新日時降順で返す。

#### `generateSaveName(year: number): string`
自動保存名を生成: `"YYYY年度_納税金額試算_YYYYMMDD-連番"`（連番は3桁ゼロ埋め）

#### `saveItem(name, year, input, summary, derived): SaveRecord`
新規保存。名前重複時は`SAVE_NAME_DUPLICATED`エラー。

#### `renameItem(id, name): void`
保存名変更。名前重複時は`SAVE_NAME_DUPLICATED`エラー。

#### `deleteItem(id): void`
保存レコード削除。

### 6.2 ストレージ構造

**キー**: `tax-sim:saves:v1`

**値**:
```json
{
  "schemaVersion": 1,
  "records": [
    {
      "id": "uuid",
      "schemaVersion": 1,
      "year": 2024,
      "name": "2024年度_納税金額試算_20241201-001",
      "input": { ... },
      "summary": { ... },
      "derived": { ... },
      "previousYearTotalIncome": 5000000,
      "createdAt": "2024-12-01T00:00:00.000Z",
      "updatedAt": "2024-12-01T00:00:00.000Z"
    }
  ]
}
```

## 7. UI（`src/App.tsx`）

### 7.1 構造

**アコーディオン形式**（`<details>`/`<summary>`）:
1. **年度・保存**: 年度選択、保存一覧、前年所得選択
2. **収入**: 給与（複数支払先）、事業、株式
3. **控除**: iDeCo、共済、生命保険、地震、医療費
4. **保険**: モード選択（社保のみ/国保のみ/複合）、各モードの入力
5. **係数上書き**: 所得税率、住民税所得割率、分離課税税率
6. **結果**: サマリー、ふるさと納税比較、CalcLine表示、保存

### 7.2 主要機能

- **計算ボタン**: 入力内容で計算実行（バリデーション通過時のみ）
- **保存**: 結果画面から保存（自動命名 or 手動命名）
- **読み込み**: 保存一覧から選択して入力データを復元
- **前年所得利用**:
  - 前年所得の入力方法は必須（未選択不可）
  - 「保存データから選択」の場合は保存データ選択も必須（未選択不可）
  - 保存データの`previousYearTotalIncome`を次年度の国保推計に使用可能
  - 「今年の情報を仮で使用」「手入力」にも対応

### 7.3 CalcLine表示

- **セクション別に折りたたみ可能**
- **`display='calc'`**: 結果値を表示
- **`display='info'`**: 結果値は非表示（情報のみ）
- **計算項**: 各項の値と単位を表示
- **注記・警告**: 下部に表示

## 8. ルールファイル（`src/domain/rules/rules_YYYY.json`）

### 8.1 構造

各年度のルールはJSON形式で定義。`inherits_from`で前年度を継承可能。

**主要項目**:
- `income_tax`: 所得税関連（速算表、基礎控除、給与所得控除）
- `pension`: 国民年金月額
- `resident_tax`: 住民税（自治体、所得割率、均等割）
- `separate_tax`: 分離課税税率
- `medical_deduction`: 医療費控除（閾値、上限）
- `life_insurance_deduction`: 生命保険料控除（カテゴリ別、合計上限）
- `earthquake_deduction`: 地震保険料控除上限
- `blue_deduction`: 青色申告控除
- `defaults`: デフォルト推計係数

### 8.2 ルール読み込み（`src/domain/rules/index.ts`）

- `getRule(year)`: 指定年度のルールを取得（継承処理含む）
- `supportedYears`: 対応年度リスト

## 9. ユーティリティ（`src/utils/format.ts`）

### 9.1 関数

#### `formatYen(n: number): string`
金額を日本円形式でフォーマット: `"￥1,234,567"`（負数対応）

## 10. 未実装機能

### 10.1 国保法定軽減
国保の法定軽減（7割/5割/2割）は未実装。結果画面に「想定差分」として概算を表示（`-￥xxx`）。

## 11. 計算式の詳細

### 11.1 ふるさと納税（正式公式②）

1. **住民税特例分上限**: `住民税（合計） × 20%`
2. **控除対象額（上限）**: `(住民税（合計） × 20%) ÷ (1 - 所得税率 - 10%)`
3. **寄付額上限**: `控除対象額 + 2,000円`
4. **内訳**:
   - 所得税控除: `控除対象額 × 所得税率`
   - 住民税基本分: `控除対象額 × 10%`
   - 住民税特例分: `控除対象額 - 所得税控除 - 住民税基本分`
5. **検証**: 特例分 ≤ 所得割×20%

### 11.2 按分計算

保険料の按分計算は**円単位で四捨五入**:
```
按分額 = Math.round(年額 × 月数 / 12)
```

## 12. テスト

### 12.1 テスト環境
- **フレームワーク**: Vitest（未実装、今後追加予定）

### 12.2 想定テストケース
- `yearDiff`: 年度差分計算
- `furusato`: ふるさと納税計算
- `insurance`: 保険料計算（複合モード、按分、国年月数）
- `validation`: バリデーション

## 13. 開発・ビルド

### 13.1 コマンド

```bash
npm run dev        # 開発サーバー起動（ポート5173）
npm run build      # 本番ビルド
npm run preview    # ビルド結果プレビュー
npm run lint       # TypeScript型チェック
```

### 13.2 設定ファイル

- `vite.config.ts`: Vite設定（Reactプラグイン、ポート5173）
- `tsconfig.json`: TypeScript設定
- `package.json`: 依存関係とスクリプト

## 14. 注意事項

1. **概算・比較用途**: 最終的な控除額は自治体・税務署の確定処理に依存
2. **ふるさと納税**: 本ツールと仲介サイトの「低い方」を採用
3. **国保法定軽減**: 未実装（想定差分のみ表示）
4. **保存データ**: `localStorage`に依存（ブラウザ削除で消失の可能性）

## 15. 今後の拡張予定

- Vitestテストの実装
- 国保法定軽減の実装
- バリデーション警告の拡充
- UI/UXの改善

