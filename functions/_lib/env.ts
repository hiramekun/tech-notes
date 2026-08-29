/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** D1 バインディング。Terraform の deployment_configs.d1_databases で結線する */
  DB: D1Database;
  /** 例: example.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string;
  /** Access アプリケーションの AUD タグ。Terraform が自動で流し込む */
  ACCESS_AUD: string;
  /**
   * 正規のホスト名 (例: notes.example.com)。
   * これ以外のホストで来たリクエストは _middleware.ts が 301 で送り返す。
   * 未設定なら素通しするので、ローカル開発では省略してよい。
   */
  CANONICAL_HOST?: string;
  /**
   * ローカル開発でのみ使う抜け道。値が入っていると Access の JWT 検証を飛ばし、
   * このメールアドレスのユーザーとして扱う。
   *
   * 本番では絶対に設定しないこと。Terraform の env_vars には含めていないので、
   * ダッシュボードから手で足さないかぎり本番に現れることはない。
   */
  LOCAL_DEV_EMAIL?: string;
}
