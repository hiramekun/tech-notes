# Archived knowledge notes

クローズされた GitHub issue の最終回答が、ジャンル別のディレクトリに Markdown として保存されます。

- 保存先: `notes/<ジャンル>/<issue 番号>.md`
- ファイルは `.github/workflows/archive-closed-issue.yml` により自動生成されます
- `README.md` は知識カードの対象外です

自動生成されたノートを手動で修正することもできます。ただし、同じ issue を reopen して再度 close すると、その issue のファイルは最新のコメントをもとに再生成されます。

`notes/_demo/` はローカル確認用のダミーカードです。`npm run dev` では表示されますが、GitHub Actions上の本番ビルドからは自動的に除外されます。ローカルでも除外したい場合は `INCLUDE_DEMO_NOTES=false npm run dev` を使用します。
