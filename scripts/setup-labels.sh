#!/usr/bin/env bash
# リポジトリにジャンル・種類ラベルを作成する(push 後に一度だけ実行)
set -euo pipefail

# ジャンル
gh label create "frontend"        --color "1d76db" --description "React、CSS、ブラウザ、UI 関連" --force
gh label create "backend"         --color "0e8a16" --description "サーバーサイド、API 設計" --force
gh label create "infra"           --color "5319e7" --description "クラウド、コンテナ、ネットワーク" --force
gh label create "database"        --color "fbca04" --description "RDB、NoSQL、SQL チューニング" --force
gh label create "language"        --color "d93f0b" --description "プログラミング言語の仕様・文法" --force
gh label create "ai-ml"           --color "c2e0c6" --description "LLM、機械学習" --force
gh label create "security"        --color "b60205" --description "認証認可、脆弱性、暗号" --force
gh label create "devops"          --color "006b75" --description "CI/CD、監視、開発ツール" --force
gh label create "architecture"    --color "f9d0c4" --description "設計パターン、システム設計" --force
gh label create "cs-fundamentals" --color "bfdadc" --description "アルゴリズム、データ構造、OS、低レイヤ" --force

# 種類
gh label create "type:concept"         --color "c5def5" --description "概念・仕組みの解説" --force
gh label create "type:howto"           --color "bfd4f2" --description "手順・Tips" --force
gh label create "type:troubleshooting" --color "e99695" --description "エラー・問題解決" --force
gh label create "type:comparison"      --color "d4c5f9" --description "技術比較・選定" --force

echo "ラベルの作成が完了しました"
