# bemstat 初期実装計画

## 目的

`github.com/bem130` と `github.com/neknaj` の公開 repository 全件を対象に、コード規模と構成を横断的に集計し、GitHub Pages で閲覧できる dashboard と機械処理可能な統計データを生成する。

特に自作言語を多く含む repository 群であるため、単純な拡張子別行数集計ではなく、言語ごとの分類処理を実装し、source、document、doc comment、data、test などの種類別統計を出せる構成にする。

## 対象範囲

- 対象 owner は `bem130` と `neknaj`。
- 対象 repository は公開 repository のみ。
- fork も集計対象に含める。
- private repository は対象外。
- 実装は `gh` CLI に依存せず、GitHub REST API と `git` を使う。
- 生成・編集するテキストファイルは UTF-8 とする。

## 出力物

出力先は GitHub Pages で公開しやすいように `docs/` 配下へ統一する。

- `docs/stat/repo_stat.json`
  - dashboard と外部処理向けの構造化データ。
- `docs/stat/repo_stat.csv`
  - 表計算や追加分析向けのフラットな CSV。
- `docs/index.html`
  - NEPLg2 の dashboard と同系統の静的 dashboard。
- `docs/stat/images/*.svg`
  - 主要グラフの light/dark 静的 SVG。
- `docs/stat/images/*.png`
  - 主要グラフの light/dark 静的 PNG。

JSON には少なくとも以下を含める。

- `generatedAt`
- `owners`
- `repositories`
- `totals`
- `byOwner`
- `byRepository`
- `byExtension`
- `byLanguage`
- `byArea`
- `byContentKind`
- `skipped`
- `errors`
- `unknownExtensions`

CSV は以下の列を基本形にする。

```text
section,owner,repository,name,language,files,lines,chars,bytes,blank,source,doc_comment,document,data,test,comment,other,test_cases
```

## 集計方針

各 repository は `work/repos/<owner>/<repo>` に clone または fetch し、Git 管理対象ファイルを解析する。

テキストファイルは UTF-8 として読み取る。バイナリファイル、読み取り不能ファイル、サイズ上限を超えるファイルは集計処理を止めずに `skipped` へ記録する。

拡張子集計では `.n.md` のような複合拡張子を保持する。通常の最後の拡張子だけでなく、ファイル名中の最初の `.` 以降を suffix として扱う `all suffix` 方式を既定にする。

content kind は以下を基本分類にする。

- `blank`
- `source`
- `doc_comment`
- `document`
- `data`
- `test`
- `comment`
- `other`

area は最低限以下へ分類する。

- `source_tree`
- `top_level_docs_tests`
- `other`

## 言語別処理の構成

言語ごとの処理は設定ファイルではなくソースコードとして実装する。ただし、単一ファイルへ直書きせず、`languages/` 配下に適切に分割し、import、抽象化、interface 統一を行って管理する。

想定する構成は以下。

- `repo_stat.ts`
  - CLI entrypoint。
  - GitHub repository 一覧取得、clone/fetch、全体集計、JSON/CSV/HTML/画像出力を担当する。
- `languages/types.ts`
  - `LanguageClassifier`、`LineKind`、`FileStats`、`TextLine` などの共通型と補助関数。
- `languages/registry.ts`
  - 拡張子やファイル名から classifier を選ぶ registry。
- `languages/nepl.ts`
  - `.nepl` 用 classifier。
- `languages/nepl_markdown.ts`
  - `.n.md` と Markdown doctest 用 classifier。
- `languages/rust.ts`
  - Rust 用 classifier。
- `languages/generic.ts`
  - 汎用 source、document、data、other 用 classifier。

`LanguageClassifier` は少なくとも以下の責務を持つ。

- classifier の `id` と表示用 `name` を持つ。
- 対応拡張子または `matches(path)` を持つ。
- `classify(relPath, lines)` で `FileStats` を返す。

自作言語を追加する場合は、`languages/<language>.ts` を追加し、`languages/registry.ts` に登録する。

## 初期対応する言語ルール

### NEPL

`.nepl` を NEPL 系自作言語として扱う。

- `//:` で始まる行は `doc_comment`。
- `//:` doc comment 内の `neplg2:test` と対応する fenced block は `test`。
- `//:` doc comment 内の fenced block には NEPL コードが書かれるため、`//:` を取り除いた doc text 上で doctest state を管理し、metadata、fence、fence 内コード、closing fence を一連の `test` として分類する。
- `tests/` 配下の `.nepl` は `test` を優先する。
- 通常のコード行は `source`。
- 通常コメントは `comment`。

### NEPL Markdown

`.n.md` と通常の `.md` の doctest を扱う。

- 通常行は `document`。
- `neplg2:test` と対応する fenced block は `test`。
- doctest metadata 行も `test`。

### Rust

`.rs` を Rust として扱う。

- `///` と `//!` は `doc_comment`。
- `//` は `comment`。
- `#[test]`、`#[cfg(test)]`、`tokio::test`、`wasm_bindgen_test` は `test`。
- test module または test function 内の行も `test`。

### Generic

既知の一般的な source 拡張子は `source` として扱う。

対象例:

- C/C++/C#
- CSS/HTML
- JavaScript/TypeScript
- Python/Ruby/Rust/Shell/SQL
- WAT

JSON、XML、CSV、YAML、TOML、STL、IPYNB、lock file、resource file、project manifest など、ソースコードとして読むべきでない構造化データやアセット系拡張子は `data` として扱う。

Markdown 系は `document` として扱う。`tests/` 配下でも JSON、XML、STL などの data 拡張子は `data` を優先し、ソース系の test file のみ `test` とする。未知拡張子は `other` として集計し、`unknownExtensions` に出す。

## 静的画像と dashboard

主要グラフは静的ファイルとして事前生成し、GitHub Pages へデプロイする。

生成する静的画像は SVG/PNG の両方とし、light theme は従来の `<chart-id>.svg` / `<chart-id>.png`、dark theme は `<chart-id>-dark.svg` / `<chart-id>-dark.png` として出力する。

- `owners-by-source-lines`
- `top-repositories-by-source-lines`
- `top-extensions-by-source-lines`
- `top-languages-by-source-lines`
- `content-kind-lines`

owner、repository、extension、language の主要ランキングは source 行数を基準にし、document や data の量で順位が上がらないようにする。
また、`unknown`、`(no_ext)`、`unknown:*` はグラフや表の並び替えで常に末尾へ置き、1位にならないようにする。

一方で、フィルタ、並べ替え、表示対象切り替えなどのインタラクティブなグラフは dashboard 側で `repo_stat.json` を読み込んでブラウザ上で生成する。

dashboard には以下を含める。

- 全体 summary
- owner 比較
- repository ranking
- extension 別詳細表
- language 別詳細表
- content kind 別詳細表
- skipped、errors、unknownExtensions の一覧
- owner、repository、extension、language、content kind のフィルタ
- files、lines、bytes、source、data、test、document などの並べ替え
- 静的画像の閲覧セクション
- 静的画像 SVG/PNG の URL、Markdown-compatible HTML 埋め込み、HTML 埋め込みのコピー操作
- 埋め込み用画像サイズ `small`、`middle`、`large` の選択
- dashboard 表示と Markdown-compatible HTML / HTML 埋め込みは `prefers-color-scheme` により light/dark 画像を切り替える
- GitHub Pages では PNG、SVG、JSON ごとの cache header を直接設定できないため、dashboard 内の JSON 読み込み、data file リンク、静的画像表示には version query を付けて cache-busting する
- profile や README へコピーする URL、Markdown-compatible HTML、HTML は version query を付けない canonical URL にし、同じ URL のまま次回 deploy 後の画像更新を追えるようにする

## GitHub Pages デプロイ

公開先は `bem130/bemstat` の GitHub Pages とする。

`.github/workflows/pages.yml` を追加し、`main` push、`workflow_dispatch`、および GitHub Actions の cron による UTC 0:00 / 12:00 の12時間おき実行で起動できるようにする。

workflow では以下を行う。

- Node をセットアップする。
- 依存関係を install する。
- stat 生成処理を実行する。
- 静的画像を生成する。
- `docs/` を Pages artifact として upload する。
- GitHub Pages に deploy する。

GitHub repository settings 側では GitHub Actions による Pages 公開を使う前提とする。

## 検証方針

まず小規模実行で、JSON、CSV、HTML、SVG、PNG が揃うことを確認する。

検証対象には NEPLg2 を含め、`.nepl` と `.n.md` の分類が意図通りになっているか確認する。

最低限確認する観点は以下。

- `languages/registry.ts` が `.nepl`、`.n.md`、`.rs`、未知拡張子を正しい classifier に振り分ける。
- `NEPLg2` 単体で `doc_comment`、`test`、`document`、`source` が出る。
- 未知拡張子が `unknownExtensions` と dashboard に表示される。
- binary、巨大ファイル、clone 失敗が全体処理を止めず `skipped` または `errors` に記録される。
- `docs/index.html` をローカルで開き、静的画像とインタラクティブチャートの両方が表示される。
- GitHub Actions の `workflow_dispatch` で Pages artifact が生成される。

## 初期実装の優先順位

1. 言語 classifier の共通 interface と registry を作る。
2. `.nepl`、`.n.md`、`.rs`、generic classifier を実装する。
3. 複数 repository の clone/fetch と集計処理を実装する。
4. JSON/CSV 出力を実装する。
5. 静的 SVG/PNG 生成を実装する。
6. dashboard を実装する。
7. GitHub Pages workflow を追加する。
8. 小規模実行と NEPLg2 含む検証を行う。
