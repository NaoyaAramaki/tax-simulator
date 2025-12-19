# ドメインロジックフォルダ

このフォルダには、アプリケーションのビジネスロジック（ドメインロジック）が格納されています。

## ファイル構成

### types.ts
アプリケーション全体で使用する型定義です。

**主要な型**:
- `TaxInput`: 入力データ型
- `RuleYear`: 年度別ルール型
- `EngineOutput`: 計算結果型
- `CalcLine`: 計算過程表示型
- `SaveRecord`: 保存レコード型
- `ValidationResult`: バリデーション結果型

### engine.ts
税額計算エンジンのメインモジュールです。

**主要関数**:
- `calculateAll(input: TaxInput): EngineOutput`: すべての計算を実行

**計算フロー**:
1. 収入計算（給与、事業、株式）
2. 保険料計算（社保、国保、国年）
3. 控除計算（各種控除）
4. 課税所得計算
5. 所得税計算
6. 住民税計算
7. 分離課税計算
8. ふるさと納税計算

### validation.ts
入力データのバリデーションを行うモジュールです。

**主要関数**:
- `validateInput(input: TaxInput): ValidationResult`: 入力データの妥当性を検証

**検証内容**:
- 年度の妥当性
- 給与入力の妥当性
- 事業入力の妥当性
- 保険モード別の妥当性
- 国保世帯情報の妥当性
- 前年所得の入力方法の必須選択（未選択不可、fromSave時は保存データ選択必須）

### storage.ts
`localStorage`への保存・読み込みを行うモジュールです。

**主要関数**:
- `loadSaves(): SaveRecord[]`: 保存一覧を読み込み
- `generateSaveName(year: number): string`: 保存名を自動生成
- `saveItem(...): SaveRecord`: 新規保存
- `renameItem(id: string, name: string): void`: 保存名変更
- `deleteItem(id: string): void`: 保存データ削除

**ストレージ構造**:
- キー: `tax-sim:saves:v1`
- 値: `{ schemaVersion: 1, records: SaveRecord[] }`

### sample.ts
デモ入力データを生成するモジュールです。

**主要関数**:
- `createDemoInput(year: number): TaxInput`: デモ入力データを生成

### rules/
年度別の税制ルールを管理するフォルダです。

詳細は `rules/README.md` を参照してください。

## モジュール間の依存関係

```
types.ts (型定義)
    ↑
    ├── engine.ts (計算エンジン)
    ├── validation.ts (バリデーション)
    ├── storage.ts (データ保存)
    └── sample.ts (デモデータ)
```

## 設計原則

1. **純粋関数**: 計算ロジックは副作用のない純粋関数として実装
2. **型安全性**: TypeScriptの型システムを活用
3. **単一責任**: 各モジュールは明確な責務を持つ
4. **テスタビリティ**: テストしやすい構造

## 参考資料

- 詳細設計書: `../../../design/DETAILED_DESIGN.md`
- テスト仕様書: `../../../tests/TEST_SPECIFICATION.md`

