# 納税金額シミュレーター 基本設計書

## 1. システムアーキテクチャ

### 1.1 全体構成

本システムは、ブラウザ上で動作するクライアントサイドアプリケーションです。外部APIやサーバーサイド処理を使用せず、すべての処理をブラウザ内で実行します。

```
┌─────────────────────────────────────┐
│        ブラウザ（クライアント）        │
├─────────────────────────────────────┤
│  React UI (App.tsx)                 │
│  ├─ 入力フォーム                     │
│  ├─ 計算結果表示                     │
│  └─ 保存/読み込みUI                  │
├─────────────────────────────────────┤
│  Domain Layer                       │
│  ├─ 計算エンジン (engine.ts)        │
│  ├─ バリデーション (validation.ts)  │
│  ├─ データ保存 (storage.ts)         │
│  └─ ルール管理 (rules/)             │
├─────────────────────────────────────┤
│  Data Storage                       │
│  ├─ localStorage                   │
│  └─ JSONルールファイル               │
└─────────────────────────────────────┘
```

### 1.2 技術スタック

- **フレームワーク**: React 18.3.1
- **言語**: TypeScript 5.4.5
- **ビルドツール**: Vite 5.4.8
- **データ保存**: `localStorage`（キー: `tax-sim:saves:v1`）
- **ルール管理**: 年度別JSONファイル（`rules_YYYY.json`）

### 1.3 モジュール構成

```
src/
├── App.tsx                    # メインUIコンポーネント
├── main.tsx                   # エントリーポイント
├── domain/                    # ドメインロジック層
│   ├── types.ts              # 型定義
│   ├── engine.ts             # 計算エンジン
│   ├── validation.ts         # 入力バリデーション
│   ├── storage.ts            # データ保存
│   ├── sample.ts             # デモデータ生成
│   └── rules/                # ルール管理
│       ├── index.ts          # ルール読み込み
│       ├── rules_2024.json   # 2024年度ルール
│       ├── rules_2025.json   # 2025年度ルール
│       ├── rules_2026.json   # 2026年度ルール
│       └── rules_2027.json   # 2027年度ルール
└── utils/                     # ユーティリティ
    └── format.ts             # 金額フォーマット
```

## 2. データ構造設計

### 2.1 入力データ型（`TaxInput`）

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
    sources: SalarySource[];        // 給与支払先リスト
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
    employee: { ... } | null;
    national: { ... } | null;
    mixed: { blocks: MixedBlock[] } | null;
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
  comparisonSites: {
    id: string;
    name: string;
    amount: number;
  }[];
  save: {
    selectedSaveId: string | null;
    previousYearTotalIncome: number | null;
    previousYearInputMode: 'none' | 'fromSave' | 'useCurrent' | 'manual'; // 前年所得の入力方法（必須選択）
    previousYearManual?: { ... };  // 前年情報の詳細手入力（manual選択時）
  };
};
```

### 2.2 ルールデータ型（`RuleYear`）

```typescript
type RuleYear = {
  year: number;
  inherits_from?: number;          // 継承元年度
  income_tax: {
    rate_table: RateTableRow[];     // 所得税速算表
    basic_deduction: {
      type: 'brackets';
      brackets: BasicDeductionBracket[];
    };
    salary_income_deduction: {
      type: 'function_with_brackets';
      brackets: SalaryIncomeDeductionBracket[];
      minimum: number;
    };
    dependent_income_threshold?: { value: number };
  };
  pension: {
    national_pension_monthly: { value: number | null };
  };
  resident_tax: {
    municipality: string;
    income_rate: number;
    per_capita: number;
  };
  separate_tax: {
    stock: { rate: number };
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
  earthquake_deduction?: { cap: number };
  blue_deduction?: {
    book: number;
    electronic: number;
    none?: number;
  };
  defaults?: {
    siRate?: number;
  };
};
```

### 2.3 計算結果型（`EngineOutput`）

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
  separateTaxStock: number;         // 株式分離課税（計算結果サマリーには表示しない）
  socialInsuranceDeduction: number; // 社会保険料控除合計
  furusatoDonationLimit: number;    // ふるさと納税上限（本アプリ）
  adoptedLimit: number;             // ふるさと納税上限（採用値）
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

### 2.4 計算行型（`CalcLine`）

```typescript
type CalcLine = {
  id: string;                      // 一意ID
  section: string;                  // セクション（例: "income.salary"）
  title: string;                   // タイトル
  expression: string;               // 計算式説明
  terms: Term[];                    // 計算項
  display?: 'calc' | 'info';       // 表示種別
  result?: number;                  // 計算結果
  resultKey?: string;               // 結果キー（他行参照用）
  notes?: string[];                 // 注記
  warnings?: string[];              // 警告
};

type Term = {
  key?: string;                    // 参照キー
  name: string;                    // 項名
  value: number | string;           // 値
  unit: 'yen' | 'pct' | 'count' | 'month' | 'text';
  displayValue?: string;            // 表示値（フォーマット済み）
};
```

### 2.5 保存レコード型（`SaveRecord`）

```typescript
type SaveRecord = {
  id: string;                       // UUID
  schemaVersion: 1;                 // スキーマバージョン
  year: number;                     // 年度
  name: string;                     // 保存名
  input: TaxInput;                  // 入力データ
  summary: Summary;                 // 計算結果サマリー
  derived: DerivedValues;           // 導出値
  previousYearTotalIncome: number;  // 前年総所得
  createdAt: string;                // ISO8601作成日時
  updatedAt: string;                // ISO8601更新日時
};
```

## 3. モジュール設計

### 3.1 計算エンジンモジュール（`engine.ts`）

**責務**: すべての税額計算を実行し、計算過程を`CalcLine`として生成

**主要関数**:
- `calculateAll(input: TaxInput): EngineOutput`

**計算フロー**:
1. 収入計算（給与、事業、株式）
2. 保険料計算（社保、国保、国年）
3. 控除計算（基礎控除、社会保険料控除、その他控除）
4. 課税所得計算
5. 所得税計算
6. 住民税計算
7. 分離課税計算
8. ふるさと納税計算

### 3.2 バリデーションモジュール（`validation.ts`）

**責務**: 入力データの妥当性を検証

**主要関数**:
- `validateInput(input: TaxInput): ValidationResult`

**検証内容**:
- 年度の妥当性
- 給与入力の妥当性
- 事業入力の妥当性
- 保険モード別の妥当性（複合モード、国保のみモード）
- 国保世帯情報の妥当性
- 仲介サイト入力の妥当性
- 前年所得の入力方法の必須選択（未選択不可、fromSave時は保存データ選択必須）

### 3.3 データ保存モジュール（`storage.ts`）

**責務**: `localStorage`への保存・読み込み

**主要関数**:
- `loadSaves(): SaveRecord[]`
- `generateSaveName(year: number): string`
- `saveItem(...): SaveRecord`
- `renameItem(id: string, name: string): void`
- `deleteItem(id: string): void`

**ストレージ構造**:
- キー: `tax-sim:saves:v1`
- 値: `{ schemaVersion: 1, records: SaveRecord[] }`

### 3.4 ルール管理モジュール（`rules/index.ts`）

**責務**: 年度別ルールの読み込みと継承処理

**主要関数**:
- `getRule(year: number): RuleYear`
- `supportedYears: number[]`

**継承処理**:
- `inherits_from`が指定されている場合、前年度のルールを継承
- 指定された年度のルールで上書き

### 3.5 UIモジュール（`App.tsx`）

**責務**: ユーザーインターフェースの提供

**主要機能**:
- 入力フォーム（アコーディオン形式）
- 計算結果表示
- 保存/読み込みUI
- バリデーションエラー表示
- 必須未入力時の先頭エラー箇所へのスクロール/フォーカス（固定ヘッダー高さを考慮）
- 数値入力で0を正しく入力できるInputNumber制御

**セクション構成**:
1. 年度・保存
2. 収入
3. 控除
4. 保険
5. 係数上書き
6. 結果

## 4. UI設計

### 4.1 画面構成

**アコーディオン形式**（`<details>`/`<summary>`）:
- 各セクションを折りたたみ可能
- デフォルトで全セクションを開く

### 4.2 入力フォーム

**年度・保存セクション**:
- 年度選択（ドロップダウン）
- 保存一覧（リスト表示）
- 前年所得選択（ドロップダウン）

**収入セクション**:
- 給与: ON/OFF、支払先追加、主たる支払先選択
- 事業: ON/OFF、売上、経費、青色申告設定
- 株式: 配当、譲渡益（それぞれ総合/分離選択）

**控除セクション**:
- iDeCo、共済掛金、生命保険、地震保険
- 医療費控除: ON/OFF、内訳入力

**保険セクション**:
- モード選択（ラジオボタン）
- 各モードに応じた入力フォーム
- 複合モード: ブロック追加、サブブロック設定

**係数上書きセクション**:
- 所得税率、住民税所得割率、分離課税税率

**前年所得（国保推計用）**:
- 前年所得の入力方法は必須（未選択不可）
- 「保存データから選択」の場合は保存データ選択も必須（未選択不可）

**結果セクション**:
- サマリー表示
- ふるさと納税比較
- CalcLine表示（セクション別折りたたみ）
- 保存ボタン

### 4.3 計算結果表示

**CalcLine表示**:
- セクション別にグループ化
- `display='calc'`: 結果値を表示
- `display='info'`: 情報のみ表示（結果値なし）
- 計算項を展開表示
- 注記・警告を表示

## 5. データフロー

### 5.1 計算フロー

```
ユーザー入力
  ↓
TaxInput生成
  ↓
バリデーション
  ↓
計算エンジン実行
  ↓
EngineOutput生成
  ↓
UI表示
```

### 5.2 保存フロー

```
計算結果取得
  ↓
保存名生成（自動 or 手動）
  ↓
SaveRecord生成
  ↓
localStorage保存
  ↓
保存一覧更新
```

### 5.3 読み込みフロー

```
保存一覧から選択
  ↓
SaveRecord取得
  ↓
TaxInput復元
  ↓
UI入力フォーム更新
```

## 6. エラーハンドリング

### 6.1 バリデーションエラー

- エラー: 計算をブロックし、エラーメッセージを表示
- 警告: 計算は実行可能だが、警告メッセージを表示

### 6.2 保存エラー

- 名前重複: `SAVE_NAME_DUPLICATED`エラーを返す
- `localStorage`エラー: エラーメッセージを表示

### 6.3 計算エラー

- 計算中のエラー: エラーメッセージを表示し、計算結果をクリア

## 7. セキュリティ考慮事項

### 7.1 データ保存

- `localStorage`は同一オリジンのみアクセス可能
- 機密情報は保存しない（税務情報は個人情報のため、ユーザーに注意喚起）

### 7.2 入力検証

- クライアントサイドでのバリデーション（サーバーサイド検証は不要）

## 8. パフォーマンス考慮事項

### 8.1 計算処理

- 計算処理は同期的に実行（1秒以内に完了）
- 重い計算処理はないため、非同期化は不要

### 8.2 UI応答性

- 入力変更時は即座に反映（自動再計算はしない、計算ボタンで実行）

## 9. 拡張性考慮事項

### 9.1 年度追加

- 新しい年度のルールファイル（`rules_YYYY.json`）を追加するだけで対応可能

### 9.2 機能追加

- モジュール化により、新機能の追加が容易
- 型定義により、型安全性を維持

### 9.3 スキーマバージョン管理

- `SaveRecord`に`schemaVersion`を含めることで、将来のスキーマ変更に対応可能

