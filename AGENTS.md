# AGENTS.md — m3-master（m3マスタープロジェクト）

## プロジェクト概要

m3関連のWebアプリ・スクリプト開発プロジェクトです。
リポジトリ `m3degikar_modifier` として Git 管理されています。
Google Apps Script (GAS) と JavaScript を中心とした開発を行います。

---

## 重要なルール

- Gitで管理されているため、**変更前にブランチ状態を確認する**
- GASのデプロイは必ず手動で確認してから実施
- `master/` フォルダ内のデータは本番に直結する可能性あり

---

## 技術スタック

- **GAS (Google Apps Script)**: `gas/` フォルダ
- **JavaScript**: `js/` フォルダ（ブラウザ向け）
- **Markdown**: `doc/` フォルダ（ドキュメント）
- **Git**: バージョン管理（`.git/` あり）

---

## ディレクトリ構成

```
m3-master/
├── .git/               バージョン管理
├── README.md           プロジェクト概要
├── purpose.md          目的・背景説明
├── install_scripts.bat インストールスクリプト（Windows）
├── gas/                Google Apps Script
├── js/                 JavaScript
├── doc/                ドキュメント
└── master/             マスターデータ
```

---

## 作業の進め方

1. `purpose.md` と `README.md` でプロジェクトの目的を確認する
2. コード変更前に `git status` で現在の状態を確認
3. GASの変更は ローカル → GASエディタへのコピー → テスト → デプロイ の順で行う
4. `install_scripts.bat` は初回セットアップ時のみ使用

---

## 注意事項

- `master/` フォルダ内のデータ形式を変更する場合は影響範囲を確認する
- GASの実行権限・トリガーの設定を変更する際は慎重に

---

*最終更新: 2026-04-16*
