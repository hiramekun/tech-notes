# tech-notes

技術ノートのまとめ場所。issue が 1 トピックのノートに対応し、`@claude` メンションで Claude が調査・整理したコメントを残してくれる。

## 使い方

1. 知りたい技術トピックで issue を作成する
2. 本文に `@claude` を含めて質問を書く(例: `React の useEffect のクリーンアップについてまとめて @claude`)
3. Claude が既存のノートから重複・関連トピックを確認する
4. Claude がコメントで解説を残し、ジャンル・種類のラベルを付与する
5. 関連ノートがある場合は、回答末尾と既存 issue 側に相互リンクが追加される
6. 完全な重複候補は自動でクローズせず、既存ノートへのリンクを提示する
7. 追加で聞きたいことがあれば、コメント欄で再度 `@claude` にメンションする

ノートの検索はラベルと issue 検索を使う。

## Knowledge Cards

クローズ済み issue の最終回答を、カード形式でランダムに閲覧できる GitHub Pages を提供する。

- issue をクローズすると、最新の包括的な AI 回答が `notes/<ジャンル>/<issue 番号>.md` に保存される
- その回答より後に追加回答がある場合は、同じ Markdown の「追加の議論」に追記される
- AI 回答がない issue は、クローズ時点の issue 本文をフォールバックとして保存する
- GitHub Pages ではカードを左右へスワイプするか、左右の矢印キーで次のノートへ進める
- 全カードを一巡するまでは同じカードを再表示せず、一巡後に再シャッフルする

ローカルで確認する場合:

```bash
npm install
npm run dev
```

### GitHub Pages の初期設定

1. リポジトリの **Settings → Pages** を開く
2. **Build and deployment → Source** で **GitHub Actions** を選ぶ
3. `Deploy GitHub Pages` workflow を手動実行するか、サイト関連ファイルを `main` にマージする

通常の push では `.github/workflows/pages.yml` がサイトをデプロイする。issue のクローズ時は `.github/workflows/archive-closed-issue.yml` が Markdown の保存、コミット、サイトの再ビルド、デプロイまでを行う。

## ラベル

- **ジャンル**: `frontend` / `backend` / `infra` / `database` / `language` / `ai-ml` / `security` / `devops` / `architecture` / `cs-fundamentals`
- **種類**: `type:concept` / `type:howto` / `type:troubleshooting` / `type:comparison`

## セットアップ手順(初回のみ)

1. GitHub にリポジトリを作成して push
2. [Claude GitHub App](https://github.com/apps/claude) をこのリポジトリにインストール
3. ローカルで `claude setup-token` を実行し、出力されたトークンをリポジトリの Secret `CLAUDE_CODE_OAUTH_TOKEN` に登録(Pro/Max サブスクリプションの利用枠で動作する)
4. ラベルを作成: `./scripts/setup-labels.sh`

### トークンが失効したら

Claude Code からログアウトした場合などにトークンが無効になることがある。`claude setup-token` で再発行し、Secret を更新する。
