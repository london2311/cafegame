# 全国ランキングのサーバー（Cloudflare）

ゲームの「🏆 全国ランキング」で使うサーバーです。Cloudflare Workers（プログラム）と D1（データベース）を使います。どちらも無料枠で動きます。

## 1. データベースを作る（D1）
1. https://dash.cloudflare.com にログインします。
2. 左のメニューで **ストレージとデータベース（Storage & Databases）→ D1 SQL Database** を開きます。
3. **データベースを作成（Create Database）** を押し、名前を `cafe-ranking` にして作成します。
   - 表（テーブル）はサーバーが最初のアクセス時に自動で作るので、SQL を打つ必要はありません。

## 2. サーバーを作る（Workers）
1. 左のメニューで **Workers & Pages** を開き、**作成（Create）** を押します。
2. **Worker** の「Hello World」から始めます。名前は `cafe-ranking` にして **デプロイ（Deploy）** を押します。
3. **コードを編集（Edit code）** を押し、中身をすべて消して、このフォルダの `worker.js` の中身を貼り付けます。
4. 右上の **デプロイ（Deploy）** を押します。

## 3. サーバーとデータベースをつなぐ
1. 作った Worker の **設定（Settings）→ バインディング（Bindings）** を開き、**追加（Add）** を押します。
2. **D1 データベース** を選びます。
3. **変数名（Variable name）** に `DB`（大文字）と入れ、データベースに `cafe-ranking` を選んで保存（デプロイ）します。

## 4. 動作確認
Worker のURL（`https://cafe-ranking.〇〇.workers.dev` のような形）の最後に `/scores` を付けてブラウザで開きます。

```
{"top":[]}
```

と表示されれば成功です。`{"error":"db_not_bound"}` と出る場合は、手順3の変数名が `DB` になっているか確認してください。

## 5. ゲームにURLを設定する
`index.html` の次の行に、Worker のURL（`/scores` は付けない）を入れます。

```html
window.CAFE_RANKING_API = window.CAFE_RANKING_API || "https://cafe-ranking.〇〇.workers.dev";
```

## 仕組みとルール
- 登録されるのは「名前」と「その回に出た6項目」だけです。点数はサーバー側で計算し直すので、点数だけを書き換えた登録はできません。
- 同じ名前で何度登録しても、その名前の最高点だけが残ります。
- 名前は12文字まで。見えない文字や `<` `>` は取り除きます。
- 同じ端末から5秒以内の連続登録は受け付けません（端末の判別にはIPアドレスを変換した値を使い、IPアドレスそのものは保存しません）。
- 登録を受け付けるのは `https://london2311.github.io` で公開しているゲームからだけです。別の場所で公開する場合は、`worker.js` 先頭の `ALLOWED_ORIGINS` にそのアドレスを追加してください。

## 困ったとき
- ランキングを消したいとき：D1 の画面で `cafe-ranking` を開き、コンソールで `DELETE FROM scores;` を実行します。
- 特定の名前を消したいとき：`DELETE FROM scores WHERE name = '名前';`
