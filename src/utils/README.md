# ユーティリティフォルダ

このフォルダには、アプリケーション全体で使用するユーティリティ関数が格納されています。

## ファイル構成

### format.ts
値のフォーマット処理を行うモジュールです。

**主要関数**:
- `formatYen(n: number): string`: 金額を日本円形式でフォーマット
  - 例: `1234567` → `"￥1,234,567"`
  - 負数対応: `-1234567` → `"-￥1,234,567"`
  - 小数点以下は切り捨て

**使用例**:
```typescript
import { formatYen } from './utils/format';

const amount = 1234567;
const formatted = formatYen(amount); // "￥1,234,567"
```

### logger.ts
ログ記録とダウンロード機能を提供するモジュールです。

**主要機能**:
- エラーログの記録
- 実行ログの記録
- 警告ログの記録
- ログファイルのダウンロード

**主要関数**:
- `logger.error(message: string, data?: any, error?: Error): void`: エラーログを記録
- `logger.log(message: string, data?: any): void`: 実行ログを記録
- `logger.warn(message: string, data?: any): void`: 警告ログを記録
- `logger.downloadErrorLog(identifier?: string): void`: エラーログをダウンロード
- `logger.downloadExecutionLog(identifier?: string): void`: 実行ログをダウンロード
- `logger.clearAllLogs(): void`: すべてのログをクリア

**ログファイル名形式**:
- エラーログ: `errorLog_yyyyMMdd_hhmm_xx(識別子).log`
- 実行ログ: `log_yyyyMMdd_hhmm_xx(識別子).log`

**使用例**:
```typescript
import { logger } from './utils/logger';

// エラーログの記録
try {
  // 処理
} catch (e) {
  logger.error('処理に失敗しました', { data: someData }, e);
}

// 実行ログの記録
logger.log('計算を開始しました', { year: 2024 });

// ログのダウンロード
logger.downloadErrorLog();
```

**注意事項**:
- ログはメモリに保持されます（最大1000件）
- ページをリロードすると、メモリ内のログはクリアされます
- ログを永続化する場合は、定期的にダウンロードしてください

## ユーティリティ関数の追加

新しいユーティリティ関数を追加する場合：

1. 適切なファイルに追加するか、新しいファイルを作成
2. 関数は純粋関数として実装（可能な限り）
3. TypeScriptの型を適切に定義
4. 必要に応じてテストを追加

## 参考資料

- ログフォルダ: `../../../logs/README.md`
- UIデザイン仕様書: `../../../design/UI_DESIGN.md`

