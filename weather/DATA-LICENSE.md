# 全国のスキー場・リフト・コースのデータ

`resorts.json` と `facilities.json` は、OpenSkiData（2026-11-16ビルド）の日本の下り系施設・リフト・コースから抽出・名称整理・既存ID照合した加工データです。Open Database License 1.0（ODbL）で提供します。プログラムコードや個人のメモ・履歴はこのデータライセンスの対象ではありません。

Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who's On First, © Mapterhorn

- データ・利用条件：https://www.openskidata.org/
- ODbL：https://opendatacommons.org/licenses/odbl/1-0/
- OpenStreetMap：https://www.openstreetmap.org/copyright
- Skimap.org：https://skimap.org/
- Who's On First：https://whosonfirst.org/docs/licenses/
- Mapterhorn：https://mapterhorn.com/

加工データは本リポジトリの weather/resorts.json と weather/facilities.json、および同じパスの試作サイトから取得できます。再配布・改変はODbLの条件と出典表示を引き継いでください。

## 収録方針と限界

日本にあり、下り系（downhill）を含み、名称があり、元データで abandoned 扱いではない施設を採用。現在の営業確認ではありません。収録漏れ、施設の分割・重複、休止施設、未登録の名称やリフトが含まれる場合があります。全国で営業する全施設の完全な公式台帳ではありません。

既存24地点のID・緯度経度・公式サイト・標高は維持。対応を確認できた23地点へ元データを結び、対応のないヒラフは既存地点として保持しています。志賀高原のような総称と個別ゲレンデの併記があります。

コースは同じ名称をまとめています。名前のないコースは「区間数」として別表示し、公式のコース本数と同一視しません。リフトの記録状態は地図の属性であり、当日の運行・滑走可否ではありません。公式の直近状況は別の operations.json に出典と日時付きで表示します。

## 再生成

OpenSkiDataの自動ダウンロードは1日1回までという提供元の制限を守ってください。必要なソースは以下の4件です。ベクタータイルの直接使用は行っていません。

- https://tiles.openskimap.org/metadata.json
- https://tiles.openskimap.org/geojson/ski_areas.geojson
- https://tiles.openskimap.org/csv/lifts.csv
- https://tiles.openskimap.org/csv/runs.csv

`python -B scripts/import-ski-catalog.py --source-dir <保存先>` で生成できます。元ファイル3件とmetadata.jsonを同じフォルダへ保存してから実行します。生成スクリプト自体はネットワークへ接続せず、既存IDは weather/legacy-resorts.json を参照します。
