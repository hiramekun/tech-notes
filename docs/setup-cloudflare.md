# Cloudflare へのセットアップ手順

暗記モード（`/study`）を動かすまでの手順。ダッシュボードでの操作が必要なところと、
コマンドで済むところを分けてある。所要はおおむね 45 分。

## 費用について

**独自ドメインが必須**で、年 $10 前後かかる。Cloudflare Access の self-hosted アプリケーションは
自分のアカウントのゾーンに属するホスト名にしか掛けられず、`*.pages.dev` は Cloudflare 共有の
ドメインでゾーンではないため対象にできない（プレビューデプロイ向けの Access 連携は
`*.pages.dev` でも使えるが、本番の `<project>.pages.dev` は保護できない）。

ドメイン代を除けば、Pages / Functions / D1 / Access はすべて無料枠に収まる。
Cloudflare Registrar は原価販売で、取得するとゾーンが自動で作られるのでネームサーバの設定も要らない。

あわせて**支払い方法の登録が必要**になる。Pages / Functions / D1 だけならカードなしで使えるが、
Zero Trust（Access）は無料プランを選ぶ場合でも支払い方法を求められる。
R2 を Terraform の state 置き場に使う場合も同様
（state を HCP Terraform の無料枠に置けば、カードが要るのは Zero Trust の 1 箇所だけになる）。

## 1. Cloudflare アカウントと Zero Trust（ダッシュボード）

1. アカウントを作り、**Account ID** を控える。
2. Zero Trust を有効化し、**チームドメイン**（`<team>.cloudflareaccess.com`）を決める。
   Terraform では作れず、後から変えるのも面倒なので名前は慎重に。
3. 無料プランを選び、支払い方法を登録する。
4. **ドメインを用意する。** Domain Registration → Register Domains で取得すると、
   ゾーンが自動で作られる。すでに持っているドメインを使う場合は Websites → Add a site で
   ゾーンとして追加し、ネームサーバを Cloudflare に向ける。
   `infra/terraform.tfvars` の `app_hostname` にサブドメイン（例: `notes.example.com`）を書く。
4. ログイン方法を決める。
   - **One-time PIN**（メールに届くコードで認証）—— 追加設定なしで使える。ひとりで使うならこれが最小。
   - **Google** —— Google Cloud 側で OAuth クライアントを作り、client ID / secret を
     Access の Identity provider に登録する。同意画面まわりは Terraform で完結しないので手作業が残る。

## 2. Terraform 用の API トークン（ダッシュボード）

Account 単位で次の権限を持つトークンを発行する。

- D1 : Edit
- Cloudflare Pages : Edit
- Access: Apps and Policies : Edit

発行した値は環境変数 `CLOUDFLARE_API_TOKEN` として渡す。tf ファイルには書かない。

## 3. Terraform の state 置き場（どちらか）

- **R2** —— バケットを作り、R2 用のアクセスキーを発行する。`infra/backend.hcl.example` を
  `backend.hcl` にコピーして bucket と endpoint を埋め、アクセスキーは
  `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` で渡す。
- **HCP Terraform の無料枠** —— カード登録が不要。`infra/main.tf` の `backend "s3"` ブロックを
  `cloud {}` に差し替える。

## 4. GitHub 側（ダッシュボード + リポジトリ設定）

1. Cloudflare の GitHub App をこのリポジトリにインストールする（Pages の Git 連携）。
2. リポジトリの Secrets に登録する。
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

## 認証情報の渡し方（mise）

Terraform には 2 系統の認証情報が要る。state 置き場（R2 = S3 互換）とリソース作成
（Cloudflare API）でクライアントが別だからで、前者は AWS SDK の作法に従うため変数名が `AWS_*` になる。

| | 何をする | 環境変数 |
|---|---|---|
| backend | R2 に state を読み書き | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |
| provider | D1 / Pages / Access を作る | `CLOUDFLARE_API_TOKEN` |

毎回 `export` しなくて済むように、プロジェクト直下の `mise.local.toml` に置く。
このファイルは gitignore 済みで、コミットされない。

```toml
[env]
AWS_ACCESS_KEY_ID = "..."
AWS_SECRET_ACCESS_KEY = "..."
CLOUDFLARE_API_TOKEN = "..."
```

値を埋めたら一度だけ `mise trust` を実行する（mise は未信頼の設定ファイルを読まない）。

## 5. インフラを作る（手元で 1 回）

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # account_id / allowed_email / team_domain を埋める
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

`apply` が通ったら、出力された D1 のデータベース ID を `wrangler.d1.jsonc` の
`database_id` に貼ってコミットする（秘密の値ではない）。

```bash
terraform output d1_database_id
```

Access の AUD タグは Terraform が Pages の環境変数へ直接流し込むので、手で控える必要はない。

なお `terraform apply` の時点ではまだサイトは存在しない。Pages は `main` からビルドし、
プレビューデプロイは無効にしてあるので、最初のデプロイが走るのは `main` にマージした後になる。

## 6. スキーマとノートを流し込む

以降は `.github/workflows/sync-d1.yml` が自動で行うが、初回は手元から流してもよい。

```bash
npx wrangler d1 migrations apply tech-notes --remote -c wrangler.d1.jsonc
node scripts/build-notes-index.mjs
node scripts/sync-notes-to-d1.mjs --out /tmp/sync.sql
npx wrangler d1 execute tech-notes --remote -c wrangler.d1.jsonc --yes --file=/tmp/sync.sql
```

## ローカルでの動かし方

Functions と D1 を含めて動かすには `wrangler pages dev` を使う。`next dev` では
API が存在しないため、`/study` はエラー表示になる。

```bash
npm run build
npx wrangler d1 migrations apply tech-notes --local -c wrangler.d1.jsonc
node scripts/sync-notes-to-d1.mjs --out /tmp/sync.sql
npx wrangler d1 execute tech-notes --local -c wrangler.d1.jsonc --yes --file=/tmp/sync.sql
npx wrangler pages dev out \
  --d1 DB=<wrangler.d1.jsonc の database_id> \
  --binding LOCAL_DEV_EMAIL=you@example.com \
  --compatibility-date 2026-01-01
```

`LOCAL_DEV_EMAIL` は Access の JWT 検証を飛ばすローカル専用の抜け道。
**本番では絶対に設定しないこと。** Terraform の `env_vars` には含めていないので、
ダッシュボードから手で足さないかぎり本番に現れることはない。

## 運用してから調整するもの

- 1 日の枚数と目標保持率 —— `PATCH /api/settings` で変えられる（`user_settings` の値）。
  最初の 2 週間は数字をいじりながら体に合わせる前提。
- Access のセッション期間 —— `infra/variables.tf` の `session_duration`。
  短いと通勤中の学習で再認証がたびたび挟まる。

## Terraform で踏んだ落とし穴

v5 プロバイダは OpenAPI から自動生成されており、「省略した属性を更新時に null で送ってしまう」
系の不具合をいくつか持つ。作成は通るのに更新で 400 になるのが典型で、回避策は
**その属性を明示的に書く**こと。実際に踏んだのは次の 3 つで、いずれも対処済み。

| 症状 | 原因 | 対処 |
|---|---|---|
| `domain does not belong to zone` | Access は自ゾーンのホスト名しか受け付けない | `*.pages.dev` をやめて独自ドメインにした |
| `read_replication => Expected object, received null` | 省略した属性を更新時に null で送る | `read_replication = { mode = "disabled" }` を明示 |
| `fail_open` を production と preview で揃えろ | production しか定義していなかった | 設定を `locals` に切り出して両方へ渡す |
