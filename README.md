# Mert Hidrolik Sipariş Yönetim Sistemi (PWA)

Mert Hidrolik için geliştirilmiş, mobil uyumlu ve çevrimdışı çalışabilen (Progressive Web App) sipariş yönetim ve takip otomasyonudur. Bu sistem, hidrolik ünite siparişlerinin alınması, Excel ve CAD (DXF/STEP) dosyalarının işlenmesi, üretim aşamalarının takip edilmesi ve şube bazlı filtrelemelerin yapılması amacıyla tasarlanmıştır.

## Özellikler

- **Dashboard (Ana Sayfa):**
  - Siparişlerin şube bazlı (Dudullu, İkitelli, İzmir, Ankara, Bursa, Adana) ve aşama bazlı (Tasarım, Kaynak, Boya, Montaj) filtrelenebilmesi.
  - Aktif ve tamamlanan siparişlerin dinamik olarak listelenmesi.
  - Hızlı arama özelliği (Sipariş No / PCD No'ya göre).

- **Yeni Sipariş Girişi (Sipariş Detay):**
  - **Sürükle-Bırak Dosya Yükleme:** Excel, DXF, STEP formatlarındaki ve resim dosyalarının sisteme sürükle-bırak yöntemiyle eklenebilmesi.
  - **Excel Entegrasyonu:** Yüklenen `.xlsx` veya `.xls` dosyalarından müşteri adı, proje adı ve PCD kodu gibi bilgilerin otomatik olarak forma çekilmesi.
  - **CAD Görüntüleyici:** Yüklenen DXF boyutlu çizimlerin 2D olarak ve STEP dosyalarının Three.js destekli 3D render ile tarayıcı üzerinden incelenebilir olması.
  - **Malzeme Listesi:** DXF/CAD dosyalarından veya manuel girişlerle malzeme listelerinin (Poz, Adet, Malzeme Adı) oluşturulması. Eksik materyal uyarı sistemi.
  - Üretim sürelerinin (Tasarım, Kaynak, Boya, Montaj) planlanması.

- **PWA (Progressive Web App) Desteği:**
  - `manifest.json` ve `sw.js` (Service Worker) ile çevrimdışı erişim ve mobil cihazlara "Uygulama olarak yükle" seçeneği.

## Kullanılan Teknolojiler

- **HTML5 & CSS3:** Modern, karanlık tema destekli (dark mode), tamamen duyarlı (responsive) UI/UX tasarımı.
- **Vanilla JavaScript:** Framework bağımsız, yüksek performanslı DOM manipülasyonu ve state yönetimi.
- **Three.js & occt-import-js:** 3D CAD dosyalarının (STEP) tarayıcı içinde görüntülenmesi.
- **Dxf-parser:** 2D (DXF) dosyalarının parse edilmesi ve analiz edilmesi.
- **SheetJS (xlsx):** Excel tablolarının frontend tarafında okunması.
- **FontAwesome:** İkonografi.

## Kurulum ve Çalıştırma

Proje statik dosyalardan oluştuğu için herhangi bir derleme (build) işlemine gerek yoktur. Ancak Modül (import/export) yapıları veya Service Worker'ın doğru çalışabilmesi için projeyi bir lokal sunucuda çalıştırmanız gerekir.

Lokal sunucu başlatmak için çeşitli yöntemler kullanabilirsiniz:

**Python ile (Tavsiye Edilen):**
```bash
python3 -m http.server 8080
```
Ardından tarayıcıdan `http://localhost:8080` adresine gidin.

**Node.js (http-server) ile:**
```bash
npx http-server -p 8080
```

## GitHub'a Yükleme Adımları

Bu projeyi kendi GitHub hesabınıza yüklemek için terminali açın ve projenin kök dizininde şu adımları izleyin:

```bash
git init
git add .
git commit -m "İlk commit: Mert Hidrolik Sipariş Yönetim Sistemi"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADINIZ/merthgu.git
git push -u origin main
```
*(Not: KULLANICI_ADINIZ ve repo URL'sini kendi GitHub bilgilerinize göre değiştirmelisiniz.)*
