// サーバー（Apps Script のウェブアプリ）のURL。新しいデプロイを作ってURLが変わったら、ここだけ書き換える
// （画面と Service Worker の両方で使うので window ではなく self に置く）
// （「デプロイを管理」→ 鉛筆 →「新バージョン」で更新すればURLは変わらない）
self.KINTORE_API = 'https://script.google.com/macros/s/AKfycbywpq4SeNDCm3OgHK_Rp2jVgMyBSgajbxzZO8bteztwS83NOnvS6NOqRJK74WWLuruS/exec';
