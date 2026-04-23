このプロジェクトでは、クラウド型カルテのｍ３の薬剤選択において、
院内採用薬のマスタを作成し、表示形式を調整することで、
採用薬と非採用薬を分かりやすく区別し、診療を迅速に行うことです。

TampermonkeyでJSを動作させている。
仕様はJSファイルを参照すること。

GoogleSpreadSheetで医薬品マスタを保持
院内採用のFlagをA列におき、１は採用
シート２に採用薬のみのマスタを保持。（=QUERY(MedicationMasterR8_4!A:F, "SELECT F WHERE A = 1", 1)）

スプレッドシートのGASはGas.txtを参照すること

現在の課題
・採用登録のタイムラグがあること
・

GIT https://github.com/ohnishi-med/m3degikar_modifier

アカウント　coin.or.hot.dish@gmail.com
