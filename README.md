# bemstat

`bemstat` は `github.com/bem130` と `github.com/neknaj` の公開 repository を横断して集計し、コード規模、拡張子、言語、content kind、repository ranking を GitHub Pages で公開するための stat generator です。

この README には、fork して別の GitHub user、organization、repository 群を対象にした dashboard を GitHub Pages へ deploy する手順も記載しています。詳細は [fork して別 target を deploy する](#fork-して別-target-を-deploy-する) を参照してください。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://bem130.github.io/bemstat/stat/images/top-languages-by-source-lines-dark.svg">
  <img src="https://bem130.github.io/bemstat/stat/images/top-languages-by-source-lines.svg" alt="Top languages by source lines" width="1080">
</picture>

## リンク

- Dashboard: <https://bem130.github.io/bemstat/>
- JSON: <https://bem130.github.io/bemstat/stat/repo_stat.json>
- CSV: <https://bem130.github.io/bemstat/stat/repo_stat.csv>

## 主な機能

- `bem130` / `neknaj` の公開 repository を GitHub REST API と `git` で取得
- repository、owner、拡張子、言語、area、content kind ごとの集計
- `source`、`document`、`doc_comment`、`data`、`test`、`comment`、`other` の分類
- `.nepl`、`.n.md`、Rust test/doc comment、自作言語系拡張子を意識した classifier
- JSON / CSV 出力
- light / dark 対応の静的 SVG / PNG グラフ生成
- dashboard 上の interactive chart、table、filter、sort
- GitHub Actions による GitHub Pages deploy

## ランキング方針

repository、extension、language などの主要ランキングは `source` 行数を基準にします。

`.stl`、`.json`、`.xml`、`.csv`、lock file、project manifest などは `data` として扱い、source ranking には入れません。`unknown`、`(no_ext)`、`unknown:*` は sort で常に末尾に置きます。

## 出力

生成物は GitHub Pages に deploy しやすいように `docs/` 配下へ出力します。

```text
docs/index.html
docs/stat/repo_stat.json
docs/stat/repo_stat.csv
docs/stat/images/*.svg
docs/stat/images/*.png
```

静的グラフ画像は light / dark の両方を生成します。

```text
docs/stat/images/top-languages-by-source-lines.svg
docs/stat/images/top-languages-by-source-lines-dark.svg
docs/stat/images/top-languages-by-source-lines.png
docs/stat/images/top-languages-by-source-lines-dark.png
```

## 使い方

必要なもの:

- Node.js 24 以降
- `git`

依存関係を install します。

```sh
npm ci
```

全体の stat を生成します。

```sh
npm run generate
```

NEPLg2 だけを対象に小さく生成します。

```sh
npm run generate:small
```

言語 classifier の regression test を実行します。

```sh
npm run test:languages
```

別の対象をローカルで指定する例:

```sh
node --experimental-strip-types repo_stat.ts --owners your-user,your-org
node --experimental-strip-types repo_stat.ts --repo owner/repository
```

大きな対象を扱う場合は、Actions runner の時間・ディスク使用量を抑えるために上限を調整できます。`0` を指定するとその上限を無効化します。

```sh
node --experimental-strip-types repo_stat.ts --owners your-user --max-repo-size-kb 500000 --max-tracked-files 200000 --max-scanned-bytes 1000000000
```

## 静的グラフの埋め込み

dashboard から SVG / PNG グラフの canonical URL、Markdown-compatible HTML、HTML をコピーできます。コピーされる埋め込み URL には cache-busting query を付けないため、README や profile に貼ったあとも同じ URL のまま次回 Pages deploy 後の画像更新を追えます。

例:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://bem130.github.io/bemstat/stat/images/top-repositories-by-source-lines-dark.svg">
  <img src="https://bem130.github.io/bemstat/stat/images/top-repositories-by-source-lines.svg" alt="Top repositories by source lines" width="1080">
</picture>
```

## GitHub Pages

Pages workflow は `.github/workflows/pages.yml` にあります。

実行タイミング:

- `main` への push
- 手動の `workflow_dispatch`
- UTC `0 0,12 * * *` の定期実行

workflow は依存関係を install し、`npm run generate` を実行し、`docs/` を Pages artifact として upload して GitHub Pages に deploy します。

## fork して別 target を deploy する

別の GitHub user、organization、repository 群を対象にした dashboard を公開する手順です。

1. この repository を fork します。
2. `package.json` の `generate` script を、自分の対象を指定する形に変更します。

owner 単位で集計する例:

```json
{
  "scripts": {
    "generate": "node --experimental-strip-types repo_stat.ts --owners your-user,your-org"
  }
}
```

repository を個別に指定する例:

```json
{
  "scripts": {
    "generate": "node --experimental-strip-types repo_stat.ts --repo owner/repo --repo another-owner/another-repo"
  }
}
```

3. 変更を commit して `main` に push します。
4. fork した repository の `Settings` -> `Pages` を開き、Pages の source に `GitHub Actions` を使う設定にします。
5. `Deploy stat dashboard` workflow を手動実行するか、push / schedule による実行を待ちます。
6. `https://<your-github-user>.github.io/<fork-repository>/` を開きます。

グラフ内の対象表示は `repo_stat.json` の内容から生成されるため、fork 後は自分の owner や repository 名が自動的に表示されます。

fork の README や profile に静的グラフを埋め込む場合は、URL prefix を置き換えてください。

```text
https://bem130.github.io/bemstat/
```

を以下の形へ変更します。

```text
https://<your-github-user>.github.io/<fork-repository>/
```

deploy 後の dashboard でコピーした埋め込み snippet は、その fork の Pages URL を基準に生成されます。そのため、通常は fork 先 dashboard からコピーし直すのが安全です。

## 構成

```text
repo_stat.ts          CLI entrypoint と repository/stat 集計
languages/           language classifier と共通分類型
rendering/charts.ts  静的 SVG/PNG グラフ生成
docs/index.html      GitHub Pages dashboard
tests/               classifier regression test
doc/initialplan.md   初期実装計画
```
