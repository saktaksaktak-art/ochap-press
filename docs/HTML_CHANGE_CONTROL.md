# お茶P新聞 HTML変更管理（2026-11-10）

## 正本・復元基準
- 公開先: https://saktaksaktak-art.github.io/ochap-press/
- 既存HTMLの見た目・項目・説明・日付選択・場/R切替・記者タブ・結果速報・比較・舟券を維持する。
- 2026-11-09導入の公開表示削除フィルタ（`assets/reader-presentation.js`）は **表示系・生成系から切断**。過去の凍結予想・原本・JSON・結果は変更しない。
- 承認済みの復元基準は `index.html` blob `01aa158f4a8c34f702c3538fe58577b8c0c4a7d1`、`scripts/render_ochap_frozen.mjs` blob `a1241ffaf1617e396a4b8601f9544d4a1438056f`。
- `scripts/check_press_ui_lock.sh` と `.github/workflows/check_reporter_attribution.yml` が基準からの逸脱を検知する。

## 変更権限
- Gemi兄（Gemini）および自動処理は、取得/予想JSON/検証/追記/バックアップ/結果データの処理を行ってよいが、HTML/CSS/JSの見た目・構造・説明の削除/新設/書換えを **承認なく実施しない**。
- 「軽量化」「内部情報を隠す」「効率改善」も例外ではない。表示変更を伴う場合は **提案のみ** とし、差分・影響・旧版とのスクリーンショット比較・復旧案を提示して利用者の明示承認を受ける。
- 軽量化が必要なら、非破壊のデータ取得、転送、キャッシュ、圧縮を優先する。凍結済みM0、正式BC、出走表照合、欠測表示、コースデータ、スリット図、本線4点順位付け、ナビ3着流しを削らない。
- 必ず変更前のGit SHA / 入力SHAとバックアップを保存し、編集対象を限定する。承認外の変更は中止・報告する。

## 実施ゲート
1. 差分提案（変更理由・対象ファイル・画面比較・性能指標・リスク）を提出。
2. 利用者の明示承認がない限り、本番`main`・Drive正本HTML・公開HTMLに書き込まない。
3. 許可後は別ブランチ・PRに限定。予想値・データ・凍結原本・スクリプトの非対象箇所は不変更。
4. CIの`Check reporter attribution`内のHTMLロックを通す。承認済み変更の場合は基準SHAの更新と回帰テスト更新を同一PRに含める。
5. iPhone画面/PC画面、過去号、日付・場/R・記者切替、結果、独立予想、欠測、コース/ST、色付き買い目、本線4点順位、ナビ3着流しを確認。
6. 問題発生時は差分を戻し、発行原本とデータは維持。原因と検証を台帳に報告。

## GitHub側で必須の設定（CODEOWNERSだけでは強制されない）
Repository Settings → Rules → Rulesets または Branch protection で`main`を保護：
- Pull request必須・Code Owner review必須・CI `Check reporter attribution` 成功必須
- 管理者/自動化を含め例外なく、直接push禁止にする（自動公開は保護されたデータ専用の経路に分離）
- 公開自動同期は`data/issue-index.json`・`archives/`・`data/gemi/`などの所定データに限定し、HTML共通UI資産への変更を禁止する
- 現行GASは`main`への直接pushで日次自動公開しているので、保護を有効化する前に自動同期用の許可経路（PR経由または別のデータ用ブランチ）を整備し、正常な朝刊発行を止めないこと
