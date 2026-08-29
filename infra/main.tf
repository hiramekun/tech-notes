terraform {
  required_version = "~> 1.9"

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # v5 は OpenAPI から自動生成された全面書き換えで、v4 とは互換性がない。
      # 世に出回っているサンプルの多くは v4 なので必ず固定する。
      version = "~> 5.13"
    }
  }

  # state は R2(S3 互換)に置く。terraform init -backend-config=backend.hcl で
  # bucket と endpoint を渡す。HCP Terraform の無料枠を使う場合はこのブロックごと
  # cloud {} に差し替える。
  backend "s3" {
    key    = "prod/terraform.tfstate"
    region = "auto"

    # R2 は S3 の一部の検証に応答しないので、まとめて無効化する
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

# 認証は環境変数 CLOUDFLARE_API_TOKEN で渡す。tf ファイルには書かない
provider "cloudflare" {}

locals {
  # Access を掛けられるのは自分のゾーンのホスト名だけ。
  # <project>.pages.dev は使えないので、カスタムドメインを正とする。
  host = var.app_hostname

  # Pages の API は production と preview で fail_open を揃えることを要求する
  # ("You must set the `fail_open` property value equally...")。
  # 片方だけ書くと 400 になるので、同じ設定を両方に渡す。
  deployment_config = {
    compatibility_date = var.compatibility_date

    # Function が落ちたときに静的アセットへフォールスルーさせない。
    # /api/* に該当する静的ファイルはないので実害はないが、挙動を決めておく
    fail_open = false

    d1_databases = {
      DB = { id = cloudflare_d1_database.main.id }
    }

    env_vars = {
      ACCESS_TEAM_DOMAIN = {
        type  = "plain_text"
        value = var.team_domain
      }
      # aud は Access アプリケーションの read-only 属性。
      # ダッシュボードから手で控えて貼る作業がここで消える
      ACCESS_AUD = {
        type  = "plain_text"
        value = cloudflare_zero_trust_access_application.study.aud
      }
    }
  }
}

# --- データベース ------------------------------------------------------------
# ここで作るのは器だけ。テーブルは wrangler d1 migrations の領分で、
# Terraform には持たせない(スキーマ変更の履歴はマイグレーションが持つべきなので)
resource "cloudflare_d1_database" "main" {
  account_id = var.account_id
  name       = var.project_name

  # 明示しないと、更新時にプロバイダが null を送って API に 400 で弾かれる
  # ("Invalid property: read_replication => Expected object, received null")。
  # 単独利用でレプリカは要らないので disabled。
  read_replication = {
    mode = "disabled"
  }
}

# --- アクセス制御 ------------------------------------------------------------
resource "cloudflare_zero_trust_access_policy" "only_me" {
  account_id = var.account_id
  name       = "${var.project_name}-only-me"
  decision   = "allow"

  # 「事前登録」の実体はこの 1 行。アプリ側にメールアドレスは持たせない
  include = [{ email = { email = var.allowed_email } }]
}

resource "cloudflare_zero_trust_access_application" "study" {
  account_id = var.account_id
  name       = "${var.project_name} study"
  type       = "self_hosted"
  domain     = "${local.host}/api"

  # 1 つのアプリケーションで複数のパスを守れるので、AUD も 1 つで済む。
  # ここに挙げていないパス(カード閲覧などの公開ページ)は Access の外側に残る
  destinations = [
    { type = "public", uri = "${local.host}/api" },
    { type = "public", uri = "${local.host}/study" },
  ]

  session_duration          = var.session_duration
  auto_redirect_to_identity = true

  policies = [{
    id         = cloudflare_zero_trust_access_policy.only_me.id
    precedence = 1
  }]
}

# --- サイトと結線 ------------------------------------------------------------
resource "cloudflare_pages_project" "site" {
  account_id        = var.account_id
  name              = var.project_name
  production_branch = var.production_branch

  build_config = {
    build_command   = "npm run build"
    destination_dir = "out"
  }

  deployment_configs = {
    production = local.deployment_config
    # プレビューは無効化しているが、fail_open を揃えるために定義自体は要る
    preview = local.deployment_config
  }

  source = {
    type = "github"
    config = {
      owner                          = var.github_owner
      owner_id                       = var.github_owner_id
      repo_name                      = var.github_repo
      repo_id                        = var.github_repo_id
      production_branch              = var.production_branch
      production_deployments_enabled = true

      # プレビューデプロイは作らない。<hash>.tech-notes.pages.dev のような URL は
      # Access アプリケーションの対象パスに含まれず、保護の外側に出てしまうため。
      # (Functions 側の JWT 検証があるので 401 で止まるが、そもそも作らないほうが単純)
      preview_deployment_setting = "none"
    }
  }
}

# Pages プロジェクトにカスタムドメインを繋ぐ。
# これで <app_hostname> が Pages を指し、Access の対象にもなる。
resource "cloudflare_pages_domain" "site" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.site.name
  name         = var.app_hostname
}
