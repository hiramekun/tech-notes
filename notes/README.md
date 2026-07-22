# Archived knowledge notes

クローズされた GitHub issue の本文とコメントを Claude Code Actions が再構成し、ジャンル別のディレクトリに Markdown として保存します。

- 保存先: `notes/<ジャンル>/<issue 番号>.md`
- ファイルは `.github/workflows/archive-closed-issue.yml` により自動生成されます
- 本文は Claude が「概要」「何が嬉しいのか」「詳細」「参考リンク」の順に整理します
- タイトル、Issue URL、ラベル、保存日時などのメタデータはスクリプトが決定します
- `README.md` は知識カードの対象外です

自動生成されたノートを手動で修正することもできます。ただし、同じ issue を reopen して再度 close すると、その issue のファイルはClaudeによる最新の再整理結果で上書きされます。

`notes/_demo/` はローカル確認用のダミーカードです。通常のノートが0件の場合にだけローカルで表示され、通常のノートが1件以上あれば自動的に除外されます。GitHub Actions上の本番ビルドでは常に除外されます。ローカルでもフォールバックを無効にしたい場合は `INCLUDE_DEMO_NOTES=false npm run dev` を使用します。
