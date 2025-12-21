# 納税金額シミュレーター 詳細設計書

## 1. 計算エンジン詳細設計

### 1.1 主要関数仕様

#### `calculateAll(input: TaxInput): EngineOutput`

**概要**: すべての税額計算を実行し、計算過程を`CalcLine`として生成する。

**処理フロー**:
1. ルール取得: `getRule(input.year)`
2. 収入計算: 給与、事業、株式
3. 保険料計算: 社保、国保、国年
4. 控除計算: 各種控除
5. 課税所得計算
6. 所得税計算
7. 住民税計算
8. 分離課税計算
9. ふるさと納税計算
10. `EngineOutput`生成

**戻り値**: `EngineOutput`

**例外**: なし（計算エラーは結果に含める）

### 1.2 収入計算詳細

#### 給与所得計算

**処理**:
1. 給与収入合計: `salary.sources.reduce((s, v) => s + v.annual, 0)`
2. 給与所得控除: `calcSalaryDeduction(給与収入合計, brackets, minimum)`
3. 給与所得: `max(0, 給与収入合計 - 給与所得控除)`

**CalcLine生成**:
- 各支払先ごとの給与収入
- 給与収入合計
- 給与所得控除
- 給与所得

#### 事業所得計算

**処理**:
1. 事業所得（控除前）: `売上 - 経費`
2. 青色申告控除: 
   - ルールから取得（`blue_deduction[mode]` を使用）
3. 事業所得: `事業所得（控除前） - 青色申告控除`

**CalcLine生成**:
- 事業所得（売上、経費、青色控除を含む）

#### 株式収入計算

**処理**:
1. 総合課税に含める: `配当（総合） + 売買益（総合）`
2. 分離課税に含める: `配当（分離） + 売買益（分離）`

**CalcLine生成**:
- 株式収入（総合課税に合算）
- 分離課税は後続の分離課税計算で処理

#### 総所得計算

**処理**:
- 総所得（総合課税）: `給与所得 + 事業所得 + 株式（総合）`

**CalcLine生成**:
- 総所得（総合課税）

### 1.3 保険料計算詳細

#### 社保のみモード

**処理**:
- `inputMode === 'manual'`: `amount`をそのまま使用
- `inputMode === 'estimate'`: 
  - 基準給与: 収入欄の「主たる給与」で選択された支払先の年額（`input.salary.mainSourceId`）を使用（手入力給与がない場合は給与総額等にフォールバック）
  - 推計係数: `rule.defaults?.siRate ?? 0.15`（デフォルト値のみ使用）
  - 年額: `Math.round(基準給与 × 推計係数)`

**CalcLine生成**:
- 社保（手入力）または社保（推計年額）

#### 国保のみモード

**処理**:
- **国保**:
  - `mode === 'manual'`: `amount`をそのまま使用
  - `mode === 'estimate'`: 
    - 前年所得: `previousYearTotalIncome ?? totalIncomeGeneral`
    - 世田谷標準（内訳）で推計（基礎（医療）分/支援金分/介護分、各上限・均等割を反映）
- **国年**:
  - 月額: `monthlyOverride ?? rule.pension.national_pension_monthly.value ?? 0`
  - 合計: `月額 × payMonths`（免除月数は0円）

**CalcLine生成**:
- 国保（手入力）または国保（推計）
- 国民年金（月数内訳、info表示）
- 国民年金（国年）合計

#### 複合モード

**処理**:
- 各ブロックごとに処理:
  - **社保ブロック**:
    - 各サブブロックごとに:
      - `mode === 'manual'`: `amount`をそのまま使用
      - `mode === 'estimate'`: 
        - 年額: `Math.round(基準給与 × 推計係数)`（推計係数はデフォルト値のみ使用）
        - 按分: `prorateRound(年額, months)`
  - **国保ブロック**:
    - 各サブブロックごとに:
      - `mode === 'manual'`: `amount`をそのまま使用
      - `mode === 'estimate'`: 
        - 年額: `estimateNhiAnnual()`
        - 按分: `prorateRound(年額, months)`
  - **国民年金**:
    - 加入月数（`npPayMonths`）: `月額 × npPayMonths`を合計
    - 免除月数（`npExemptMonths`）: 0円（月数カウントのみ）
    - 月額（`npMonthlyOverride`）: 上書き可能（デフォルトはルールファイルの値）

**CalcLine生成**:
- 各ブロック・サブブロックごとに生成
- 按分計算には注記を追加: `"按分（年額×月数/12）は円単位で四捨五入"`

**按分計算**:
```typescript
const prorateRound = (annual: number, months: number) => 
  Math.round((annual * months) / 12);
```

### 1.4 控除計算詳細

#### 基礎控除

**処理**:
- **2019年以前**: 一律38万円
- **2020年～2024年**: 合計所得金額に応じた段階的控除
  - 2,400万円以下: 48万円
  - 2,400万円超～2,450万円以下: 32万円
  - 2,450万円超～2,500万円以下: 16万円
  - 2,500万円超: 0円
- **2025年以降**: 合計所得金額に応じた段階的控除
  - 2,350万円以下: 58万円
  - 2,350万円超～2,400万円以下: 48万円
  - 2,400万円超～2,450万円以下: 32万円
  - 2,450万円超～2,500万円以下: 16万円
  - 2,500万円超: 0円

**CalcLine生成**:
- 基礎控除（所得金額に応じた段階制）

#### 健康保険料

**処理**:
- 合計: `社保合計 + 国保合計 + 国年合計`

**CalcLine生成**:
- 社会保険料控除（合計）

#### iDeCo掛金、共済掛金

**処理**:
- 入力値をそのまま使用

**CalcLine生成**:
- 各控除ごとに生成

#### 生命保険料控除

**処理**:
1. 所得税用（カテゴリ別）:
   - 2万円以下: 支払保険料等の全額
   - 2万超～4万以下: 支払保険料/2 + 1万円
   - 4万超～8万以下: 支払保険料/4 + 2万円
   - 8万超: 一律4万円
2. 住民税用（カテゴリ別）:
   - 2万円以下: 支払保険料等の全額
   - 2万超～4万以下: 支払保険料/2 + 6千円
   - 4万超～8万以下: 支払保険料/4 + 1.4万円
   - 8万超: 一律2万8千円
3. 合計（所得税用）: `min(12万円, 一般＋介護医療＋個人年金)`
4. 合計（住民税用）: `min(7万円, 一般＋介護医療＋個人年金)`

**CalcLine生成**:
- 生命保険料控除（一般/介護医療/個人年金・所得税）
- 生命保険料控除（所得税控除・合計）
- 生命保険料控除（一般/介護医療/個人年金・住民税）
- 生命保険料控除（住民税控除・合計）
- ※「生命保険料控除（合計）」という統合行は表示しない（不要）

#### 地震保険料控除

**処理**:
- 所得税: `min(支払額, 5万円)`
- 住民税: `min(支払額, 2.5万円)`

**CalcLine生成**:
- 地震保険料控除（所得税控除）
- 地震保険料控除（住民税控除）
- ※「地震保険料控除（合計）」は表示しない

#### 医療費控除

**処理**:
1. 支払合計: `treatment + transport + other`
2. 実質支払: `max(0, 支払合計 - reimbursed)`
3. 閾値: `min(rule.medical_deduction.threshold_fixed, floor(totalIncomeGeneral × threshold_rate))`
4. 控除額: `clamp(実質支払 - 閾値, 0, rule.medical_deduction.cap)`

**CalcLine生成**:
- 医療費控除（ON時）または医療費控除OFF（info表示）

### 1.5 課税所得計算詳細

**処理**:
- `max(0, 総所得（総合） - 所得控除合計)`

**CalcLine生成**:
- 課税所得（総合課税）

### 1.6 所得税計算詳細

**処理**:
1. 速算表から該当レンジを取得: `rule.income_tax.rate_table.find(r => r.max === null || taxableIncome <= r.max)`
2. 税率: `overrides.incomeTaxRateOverride ?? rate_table.rate`
3. 所得税: `floor(課税所得 × 税率 - 控除額)`

**CalcLine生成**:
- 所得税（限界税率、info表示）
- 所得税（総合課税）
- 所得税（合計）= 所得税（総合課税）+ 分離課税の所得税 + 復興特別所得税
- **100円未満を切り捨て**: `floor((所得税（総合課税）+ 分離課税の所得税 + 復興特別所得税) / 100) * 100`

### 1.7 住民税計算詳細

**処理**:
1. 所得割率: `overrides.residentIncomeRateOverride ?? rule.resident_tax.income_rate`
2. 課税所得金額: `floor(max(0, 所得額 - 所得控除額) / 1000) * 1000`
   - 基礎控除: 2020年～2024年、2025年以降は`rule.resident_tax.basic_deduction`の段階表を使用（合計所得金額に応じて43万円/29万円/15万円/0円）、2019年以前は所得税基礎控除 - 5万円（フォールバック）
   - ※生命保険料控除・地震保険料控除は、住民税用控除額を使用する
3. 所得割: `floor(課税所得金額 × 所得割率)`
4. 均等割: `rule.resident_tax.per_capita`
5. 合計: `所得割 + 均等割 + 分離課税の住民税`

**CalcLine生成**:
- 住民税（限界税率、info表示）
- 住民税 所得額
- 住民税 課税所得金額（控除の内訳を明示）
  - 社会保険料控除
  - iDeCo掛金
  - 小規模企業共済
  - 経営セーフティ共済
  - 生命保険料控除（住民税）
  - 地震保険料控除（住民税）
  - 医療費控除
- 住民税（所得割）: `floor(floor(課税所得金額 × 所得割率) / 100) * 100`（100円未満を切り捨て）
- 住民税（合計）

### 1.8 分離課税計算詳細

**処理**:
1. 分離課税ベース: `配当（分離） + 売買益（分離）`
2. 税率: `overrides.separateTaxRateOverride ?? rule.separate_tax.stock.rate`
3. 税額: `floor(分離課税ベース × 税率)`

**CalcLine生成**:
- 株式（申告分離課税）税額

### 1.9 ふるさと納税計算詳細

**処理**:
1. **住民税特例分上限**: `住民税（合計） × 0.2`
2. **控除対象額（上限）**: 
   - 分母: `1 - 所得税率 - 10%`
   - `分母 > 0`の場合: `floor(住民税特例分上限 / 分母)`
   - それ以外: `0`
3. **寄付額上限**: `控除対象額 + 2000`
4. **内訳**:
   - 所得税控除: `floor(控除対象額 × 所得税率)`
   - 住民税基本分: `floor(控除対象額 × 10%)`
   - 住民税特例分: `控除対象額 - 所得税控除 - 住民税基本分`
5. **検証**: `特例分 ≤ 住民税（合計）×20%`
6. **仲介サイト比較**:
   - サイト最小値: `min(...comparisonSites.map(s => s.amount))`
   - 採用値: `min(本アプリ上限, サイト最小値)`

**CalcLine生成**:
- ふるさと納税 控除対象額（上限）
- ふるさと納税 寄付額上限
- ふるさと納税 所得税控除
- ふるさと納税 住民税基本分
- ふるさと納税 住民税特例分（検証結果を含む）
- 仲介サイト比較（採用値）

**想定差分（未実装機能）**:
- 国保が存在する場合: `-Math.round(nhiTotal * 0.1)`を表示（法定軽減の想定差分）

### 1.10 ヘルパー関数詳細

#### `calcSalaryDeduction(income: number, brackets: SalaryIncomeDeductionBracket[], minimum: number): number`

**処理**:
1. 該当ブラケットを取得: `brackets.find(b => b.max_income === null || income <= b.max_income)`
2. 数式評価: `evalFormula(bracket.formula, income)`
3. 最低保障: `max(評価結果, minimum)`
4. 切り捨て: `floor(結果)`

#### 生命保険料控除（カテゴリ別計算）

**所得税用（カテゴリ別）**:
- 2万円以下: 支払保険料等の全額
- 2万超～4万以下: 支払保険料/2 + 1万円
- 4万超～8万以下: 支払保険料/4 + 2万円
- 8万超: 一律4万円

**住民税用（カテゴリ別）**:
- 2万円以下: 支払保険料等の全額
- 2万超～4万以下: 支払保険料/2 + 6千円
- 4万超～8万以下: 支払保険料/4 + 1.4万円
- 8万超: 一律2万8千円

#### `prorateRound(annual: number, months: number): number`

**処理**:
- `Math.round((annual * months) / 12)`

#### `pickBracketValue(income: number, brackets: { max_income: number | null; deduction: number }[]): number`

**処理**:
1. 該当ブラケットを取得: `brackets.find(b => b.max_income === null || income <= b.max_income)`
2. `deduction`を返す（該当なしの場合は0）

#### `evalFormula(formula: string, income: number): number`

**処理**:
1. `formula`内の`income`を実際の値に置換
2. `new Function('income', 'return ' + formula)`で評価
3. 無限大・NaNチェック: `Number.isFinite(val) ? val : 0`

## 2. バリデーション詳細設計

### 2.1 主要関数仕様

#### `validateInput(input: TaxInput): ValidationResult`

**概要**: 入力データの妥当性を検証し、エラーと警告を返す。

**戻り値**: `{ errors: ValidationError[], warnings: ValidationWarning[] }`

### 2.2 検証項目詳細

#### 年度検証

```typescript
if (![2024, 2025, 2026, 2027].includes(input.year)) {
  errors.push({ field: 'year', message: '年度は 2024/2025/2026/2027 のいずれかを指定してください。' });
}
```

#### 給与検証

```typescript
if (input.salary.enabled) {
  if (input.salary.sources.length === 0) {
    errors.push({ field: 'salary.sources', message: '給与支払先を1件以上入力してください。' });
  }
  if (!input.salary.mainSourceId) {
    errors.push({ field: 'salary.mainSourceId', message: '主たる給与支払先を選択してください。' });
  }
  input.salary.sources.forEach((s, idx) => {
    if (s.annual < 0) {
      errors.push({ field: `salary.sources[${idx}].annual`, message: '給与年額は0以上で入力してください。' });
    }
  });
}
```

#### 事業検証

```typescript
if (input.business.enabled) {
  if (input.business.sales <= 0) {
    errors.push({ field: 'business.sales', message: '事業売上を入力してください。' });
  }
  if (input.business.expenses < 0) {
    errors.push({ field: 'business.expenses', message: '経費は0以上で入力してください。' });
  }
}
```

#### 保険（複合モード）検証

```typescript
if (input.insurance.mode === 'mixed') {
  const blocks = input.insurance.mixed?.blocks ?? [];
  const totalMonths = blocks.reduce((a, b) => a + b.months, 0);
  if (totalMonths !== 12) {
    errors.push({ field: 'insurance.mixed.blocks', message: '複合ブロックの合計月数は12ヶ月にしてください。' });
  }
  blocks.forEach((b, bi) => {
    if (b.months <= 0 || b.months > 12) {
      errors.push({ field: `insurance.mixed.blocks[${bi}].months`, message: 'ブロック月数は1〜12で入力してください。' });
    }
    if (b.type === 'employee') {
      const sum = b.breakdown.reduce((a, s) => a + s.months, 0);
      if (sum !== b.months) {
        errors.push({ field: `insurance.mixed.blocks[${bi}].breakdown`, message: '社保ブロックのサブ月数合計がブロック月数と一致していません。' });
      }
    } else {
      const sumNhi = b.nhiBreakdown.reduce((a, s) => a + s.months, 0);
      if (sumNhi !== b.months) {
        errors.push({ field: `insurance.mixed.blocks[${bi}].nhiBreakdown`, message: '国保ブロックの国保サブ月数合計がブロック月数と一致していません。' });
      }
      const sumNp = b.npPayMonths + b.npExemptMonths;
      if (sumNp !== b.months) {
        errors.push({ field: `insurance.mixed.blocks[${bi}].npPayMonths`, message: '国保ブロックの国民年金月数（加入+免除）がブロック月数と一致していません。' });
      }
    }
  });
}
```

#### 保険（国保のみモード）検証

```typescript
if (input.insurance.mode === 'nationalOnly' && input.insurance.national) {
  const totalMonths = input.insurance.national.np.payMonths + input.insurance.national.np.exemptMonths;
  if (totalMonths !== 12) {
    errors.push({ field: 'insurance.national.np', message: '国民年金の加入月数と免除月数の合計は12ヶ月にしてください。' });
  }
}
```

#### 国保世帯検証

```typescript
const hh = input.insurance.nhiHousehold;
if (hh.membersIncludingTaxpayer < 1) {
  errors.push({ field: 'insurance.nhiHousehold.membersIncludingTaxpayer', message: '国保加入者数は本人を含め1以上にしてください。' });
}
if (hh.members4064 > hh.membersIncludingTaxpayer) {
  errors.push({ field: 'insurance.nhiHousehold.members4064', message: '40〜64歳人数が国保加入者数を超えています。' });
}
if (hh.preschool > hh.membersIncludingTaxpayer) {
  errors.push({ field: 'insurance.nhiHousehold.preschool', message: '未就学児人数が国保加入者数を超えています。' });
}
if (hh.members4064 + hh.preschool > hh.membersIncludingTaxpayer) {
  errors.push({ field: 'insurance.nhiHousehold', message: '40〜64歳＋未就学児の合計が国保加入者数を超えています。' });
}
```

#### 仲介サイト検証

```typescript
input.comparisonSites.forEach((s, idx) => {
  if (s.amount < 0) {
    errors.push({ field: `comparisonSites[${idx}]`, message: '仲介サイト上限は0以上で入力してください。' });
  }
});
```

#### 警告

```typescript
if (input.family.dependentCount < input.family.dependents4064Count + input.family.preschoolCount) {
  warnings.push({ field: 'family.dependentCount', message: '扶養人数より内訳人数が多くなっています。' });
}
```

## 3. データ保存詳細設計

### 3.1 主要関数仕様

#### `loadSaves(): SaveRecord[]`

**処理**:
1. `localStorage.getItem('tax-sim:saves:v1')`を取得
2. JSONパース
3. `records`を取得し、`updatedAt`降順でソート
4. 返却

**エラーハンドリング**:
- `localStorage`が未定義: 空配列を返す
- パースエラー: 空配列を返す
- `records`が未定義: 空配列を返す

#### `generateSaveName(year: number): string`

**処理**:
1. 現在日時を取得: `YYYYMMDD`形式
2. プレフィックス生成: `${year}年度_納税金額試算_${YYYYMMDD}-`
3. 既存レコードから同じプレフィックスのレコードを取得
4. 連番を抽出し、最大値を取得
5. 次の連番を生成（3桁ゼロ埋め）
6. 保存名を返却: `${プレフィックス}${連番}`

#### `saveItem(name: string, year: number, input: TaxInput, summary: Summary, derived: DerivedValues): SaveRecord`

**処理**:
1. 名前重複チェック: `store.records.some(r => r.name === name)`
2. 重複時: `SAVE_NAME_DUPLICATED`エラーをthrow
3. `SaveRecord`生成:
   - `id`: `crypto.randomUUID()`
   - `schemaVersion`: `1`
   - `previousYearTotalIncome`: `derived.totalIncomeGeneral`
   - `createdAt`, `updatedAt`: `new Date().toISOString()`
4. `store.records.unshift(record)`で先頭に追加
5. `localStorage.setItem(...)`で保存
6. `SaveRecord`を返却

#### `renameItem(id: string, name: string): void`

**処理**:
1. 名前重複チェック（自分以外）: `store.records.some(r => r.name === name && r.id !== id)`
2. 重複時: `SAVE_NAME_DUPLICATED`エラーをthrow
3. 該当レコードを更新: `name`, `updatedAt`
4. `localStorage.setItem(...)`で保存

#### `deleteItem(id: string): void`

**処理**:
1. `store.records.filter(r => r.id !== id)`
2. `localStorage.setItem(...)`で保存

### 3.2 ストレージ構造詳細

**キー**: `tax-sim:saves:v1`

**値のJSON構造**:
```json
{
  "schemaVersion": 1,
  "records": [
    {
      "id": "uuid",
      "schemaVersion": 1,
      "year": 2024,
      "name": "2024年度_納税金額試算_20241201-001",
      "input": { /* TaxInput */ },
      "summary": { /* Summary */ },
      "derived": { /* DerivedValues */ },
      "previousYearTotalIncome": 5000000,
      "createdAt": "2024-12-01T00:00:00.000Z",
      "updatedAt": "2024-12-01T00:00:00.000Z"
    }
  ]
}
```

## 4. ルール管理詳細設計

### 4.1 主要関数仕様

#### `getRule(year: number): RuleYear`

**処理**:
1. `rawMap[year]`を取得
2. `inherits_from`が指定されている場合:
   - ベースルールを取得: `rawMap[inherits_from]`
   - マージ処理: ベースルールを継承し、指定年度のルールで上書き
3. ルールを返却（該当年度がない場合は2024年度を返却）

#### `mergeInherit(rule: RuleYear): RuleYear`

**処理**:
1. `inherits_from`が未指定: `rule`をそのまま返却
2. ベースルールを取得: `rawMap[inherits_from]`
3. マージ処理:
   - トップレベル: `{ ...base, ...rule }`
   - ネストされたオブジェクト: `{ ...base.income_tax, ...rule.income_tax }`など
4. マージ結果を返却

## 5. UI詳細設計

### 5.1 計算ボタン処理

**処理**:
1. `validateInput(input)`を実行
2. エラーがある場合: エラーメッセージを表示し、計算をブロック
3. エラーがない場合: `calculateAll(input)`を実行
4. `EngineOutput`を取得し、`engineOutput`ステートに設定
5. 結果セクションを開く

### 5.2 保存処理

**処理**:
1. `engineOutput`が存在しない場合: エラーメッセージを表示
2. 保存名が未入力の場合: `generateSaveName(year)`で自動生成
3. `saveItem(...)`を実行
4. エラー時: エラーメッセージを表示
5. 成功時: 保存一覧を更新、`selectedSaveId`を設定

### 5.3 読み込み処理

**処理**:
1. `saveRepo.get(id)`で`SaveRecord`を取得
2. `setInput(record.input)`で入力データを復元
3. `setSaveNameInput(record.name)`で保存名を設定
4. `selectedSaveId`を設定

### 5.4 CalcLine表示処理

**処理**:
1. `engineOutput.calcLines`をセクション別にグループ化
2. 各セクションごとに折りたたみ可能なUIを生成
3. `display === 'calc'`: 結果値を表示
4. `display === 'info'`: 結果値は非表示（情報のみ）
5. `terms`を展開表示
6. `notes`, `warnings`を表示

## 6. 計算式詳細

### 6.1 ふるさと納税（正式公式②）

**計算式**:
1. 住民税特例分上限: `住民税（合計） × 0.2`
2. 控除対象額（上限）: `(住民税（合計） × 0.2) ÷ (1 - 所得税率 - 0.1)`
3. 寄付額上限: `控除対象額 + 2000`
4. 所得税控除: `floor(控除対象額 × 所得税率)`
5. 住民税基本分: `floor(控除対象額 × 0.1)`
6. 住民税特例分: `控除対象額 - 所得税控除 - 住民税基本分`
7. 検証: `特例分 ≤ 住民税（合計） × 0.2`

**実装**:
```typescript
const specialCap = Math.floor(residentTotal * 0.2);
const denom = 1 - incomeTaxRate - 0.1;
const deductibleLimit = denom > 0 ? Math.floor(specialCap / denom) : 0;
const donationLimit = deductibleLimit + 2000;
const furusatoIncomeTax = Math.floor(deductibleLimit * incomeTaxRate);
const furusatoResidentBase = Math.floor(deductibleLimit * 0.1);
const furusatoResidentSpecial = deductibleLimit - furusatoIncomeTax - furusatoResidentBase;
```

### 6.2 按分計算

**計算式**: `Math.round((年額 × 月数) / 12)`

**実装**:
```typescript
const prorateRound = (annual: number, months: number) => 
  Math.round((annual * months) / 12);
```

**注記**: "按分（年額×月数/12）は円単位で四捨五入"

## 7. エラーハンドリング詳細

### 7.1 バリデーションエラー

**表示**:
- エラー: 赤色のボックスで表示、計算ボタンを無効化
- 警告: オレンジ色のボックスで表示、計算は実行可能

### 7.2 保存エラー

**エラー種別**:
- `SAVE_NAME_DUPLICATED`: "保存名が重複しています。"
- その他: "保存中にエラーが発生しました。"

### 7.3 計算エラー

**処理**:
- `try-catch`でエラーを捕捉
- エラーメッセージを表示
- `engineOutput`を`null`に設定

## 8. テスト仕様

### 8.1 テスト環境

- **フレームワーク**: Vitest（未実装、今後追加予定）

### 8.2 想定テストケース

#### 年度差分計算（`yearDiff`）

- 2024年度と2025年度の基礎控除の差分
- 2024年度と2025年度の給与所得控除の差分

#### ふるさと納税計算（`furusato`）

- 控除対象額の計算
- 寄付額上限の計算
- 内訳（所得税/住民税基本分/住民税特例分）の計算
- 特例分の検証（≤ 所得割×20%）
- 仲介サイト比較

#### 保険料計算（`insurance`）

- 複合モードの按分計算
- 国年月数の合計（12ヶ月）
- 社保推計の計算
- 国保推計の計算（世田谷標準の内訳: 基礎（医療）分/支援金分/介護分、上限・均等割、按分）

#### バリデーション（`validation`）

- 給与入力のバリデーション
- 事業入力のバリデーション
- 保険モード別のバリデーション
- 国保世帯情報のバリデーション

