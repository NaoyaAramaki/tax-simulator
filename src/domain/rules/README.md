# ルールファイルフォルダ

このフォルダには、年度別の税制ルールを定義したJSONファイルが格納されています。

## ファイル構成

### index.ts
ルールファイルの読み込みと継承処理を行うモジュールです。

**主要関数**:
- `getRule(year: number): RuleYear`: 指定年度のルールを取得（継承処理含む）
- `supportedYears: number[]`: 対応年度リスト

**継承処理**:
- `inherits_from`が指定されている場合、前年度のルールを継承
- 指定された年度のルールで上書き

### rules_YYYY.json
各年度の税制ルールを定義したJSONファイルです。

**対応年度**:
- `rules_2024.json`: 2024年度ルール
- `rules_2025.json`: 2025年度ルール
- `rules_2026.json`: 2026年度ルール
- `rules_2027.json`: 2027年度ルール

## ルールファイルの構造

各ルールファイルは以下の構造を持ちます：

```json
{
  "year": 2024,
  "inherits_from": null,
  "income_tax": {
    "rate_table": [...],
    "basic_deduction": {...},
    "salary_income_deduction": {...}
  },
  "pension": {...},
  "resident_tax": {...},
  "separate_tax": {...},
  "medical_deduction": {...},
  "life_insurance_deduction": {...},
  "earthquake_deduction": {...},
  "blue_deduction": {...},
  "defaults": {...}
}
```

## ルールの継承

新しい年度のルールを追加する場合：

1. 前年度を継承する場合:
   ```json
   {
     "year": 2028,
     "inherits_from": 2027,
     "income_tax": {
       "basic_deduction": {
         // 変更がある項目のみ記載
       }
     }
   }
   ```

2. 完全に新規作成する場合:
   ```json
   {
     "year": 2028,
     "inherits_from": null,
     // すべての項目を記載
   }
   ```

## ルールファイルの更新

税制改正があった場合、該当年度のルールファイルを更新してください。

**注意事項**:
- ルールファイルの変更は計算結果に直接影響します
- 変更前にテストを実施してください
- 変更内容をドキュメント化してください

## 参考資料

- 型定義: `../types.ts`
- 計算エンジン: `../engine.ts`
- 詳細設計書: `../../../design/DETAILED_DESIGN.md`

