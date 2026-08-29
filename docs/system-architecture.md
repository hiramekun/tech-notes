# システム構成

![tech-notes のシステム構成図](./system-architecture.svg)

## 図の読み方

1. Owner が GitHub Issue で `@claude` に質問すると、GitHub Actions 上の Claude Code Action が既存ノートを確認し、Issue へ解説、タイトル、ラベルを反映します。
2. Issue を閉じると会話全体を 1 本の技術ノートへ再構成し、`notes/<category>/<issue>.md` へコミットします。`notes/` がノート本文の正本です。日次 workflow は、重複と確信できるノートだけを統合します。
3. `main` への push は Cloudflare Pages の Git 連携により Next.js の静的エクスポートをビルド・配信します。公開範囲の `/`、`/reports`、`/data/notes.json` はログイン不要です。
4. `/study` と `/api` は Cloudflare Access が保護します。Pages Functions も Access JWT の署名、issuer、audience を検証し、D1 binding 経由で学習状態を読み書きします。
5. D1 の `notes` と `cards` は `notes/*.md` から作る学習用ミラーです。ユーザー設定、FSRS-6 のカード状態、レビュー履歴も D1 に保存します。
6. PWA は静的データを Cache Storage に保持し、オフライン中のレビューイベントを IndexedDB の outbox に溜めます。オンライン復帰後、冪等キー付きで API へ再送します。
7. Terraform は Cloudflare DNS、Pages、Access、D1、Pages の binding と環境変数を管理し、state は R2 の S3 互換 API に保存します。

## 線の意味

- 実線: ブラウザからの実行時リクエスト、API、D1 アクセス
- 破線: GitHub Actions、ビルド、デプロイ、D1 同期
- 点線: Terraform と R2 による管理経路

## アイコンの出典

- Cloudflare Pages / Workers / D1 / Access / DNS / R2 / Terraform: [Cloudflare 公式ドキュメントの product icons](https://github.com/cloudflare/cloudflare-docs/tree/production/src/icons)
- GitHub: [GitHub Brand Toolkit](https://brand.github.com/foundations/logo)
- Claude: [Claude 公式サイトの SVG favicon](https://claude.ai/favicon.svg)
- Next.js: [Vercel の Next.js Brand Assets](https://vercel.com/geist/brands#next.js)

各製品名・ロゴは各権利者に帰属し、この図は本プロジェクトが各社から承認・推奨されていることを示すものではありません。
