variable "account_id" {
  type        = string
  description = "Cloudflare のアカウント ID"
}

variable "project_name" {
  type        = string
  description = "Pages プロジェクト名。<project_name>.pages.dev がそのまま公開 URL になる"
  default     = "tech-notes"
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
