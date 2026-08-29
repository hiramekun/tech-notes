variable "account_id" {
  type        = string
  description = "Cloudflare のアカウント ID"
}

variable "project_name" {
  type        = string
  description = "Pages プロジェクト名。<project_name>.pages.dev がそのまま公開 URL になる"
  default     = "tech-notes"
}

# Cloudflare Access の self-hosted アプリケーションは、自分のアカウントの
# ゾーンに属するホスト名にしか掛けられない。*.pages.dev は Cloudflare 共有の
# ドメインでゾーンではないため対象にできず、独自ドメインが必須になる。
variable "app_hostname" {
  type        = string
  description = "アプリを公開するホスト名 (例: notes.example.com)。Cloudflare のゾーンに属している必要がある"
}

variable "zone_id" {
  type        = string
  description = "app_hostname のドメインが属する Cloudflare ゾーンの ID"
}

variable "allowed_email" {
  type        = string
  description = "Access を通す Google アカウントのメールアドレス。これがアローリストの実体"
}

variable "team_domain" {
  type        = string
  description = "Zero Trust のチームドメイン (例: example.cloudflareaccess.com)"
}

variable "github_owner" {
  type        = string
  description = "Pages が参照する GitHub のオーナー名"
}

variable "github_repo" {
  type        = string
  description = "Pages が参照するリポジトリ名"
  default     = "tech-notes"
}

# 数値 ID は秘密ではない。gh api repos/<owner>/<repo> --jq '.id, .owner.id' で取れる。
# owner / repo_name だけでは Pages がリポジトリを解決できないことがあるため明示しておく。
variable "github_owner_id" {
  type        = string
  description = "GitHub のオーナー ID"
  default     = "20180425"
}

variable "github_repo_id" {
  type        = string
  description = "GitHub のリポジトリ ID"
  default     = "1304750720"
}

variable "production_branch" {
  type        = string
  description = "本番デプロイの対象ブランチ"
  default     = "main"
}

variable "compatibility_date" {
  type        = string
  description = "Workers ランタイムの互換性日付"
  default     = "2026-01-01"
}

variable "session_duration" {
  type        = string
  description = "Access のセッション有効期間。毎日使う PWA なので長めに取る"
  default     = "720h"
}
