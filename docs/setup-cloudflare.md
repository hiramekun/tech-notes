# Cloudflare へのセットアップ手順

暗記モード（`/study`）を動かすまでの手順。ダッシュボードでの操作が必要なところと、
コマンドで済むところを分けてある。所要はおおむね 45 分。

課金は発生しない構成だが、**支払い方法の登録は 1 回必要**になる。
Pages / Functions / D1 だけならカードなしで使えるものの、Zero Trust（Access）は
無料プランを選ぶ場合でも支払い方法を求められる。R2 を Terraform の state 置き場に使う場合も同様
（state を HCP Terraform の無料枠に置けば、カードが要るのは Zero Trust の 1 箇所だけになる）。

## 1. Cloudflare アカウントと Zero Trust（ダッシュボード）

1. アカウントを作り、**Account ID** を控える。
2. Zero Trust を有効化し、**チームドメイン**（`<team>.cloudflareaccess.com`）を決める。
   Terraform では作れず、後から変えるのも面倒なので名前は慎重に。
3. 無料プランを選び、支払い方法を登録する。
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
