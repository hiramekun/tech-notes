output "d1_database_id" {
  description = "wrangler.d1.jsonc の database_id に貼る値"
  value       = cloudflare_d1_database.main.id
}

output "access_aud" {
  description = "Access アプリケーションの AUD タグ。Pages の環境変数へは Terraform が直接流し込む"
  value       = cloudflare_zero_trust_access_application.study.aud
}

output "site_url" {
  description = "公開 URL (カスタムドメインの接続はダッシュボードで行う)"
  value       = "https://${var.app_hostname}"
}
