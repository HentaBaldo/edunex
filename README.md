<div align="center">

# 🎓 EduNex

### Türkiye'nin Yeni Nesil Video Eğitim Platformu

**Eğitmenler için marketplace, öğrenciler için Udemy benzeri öğrenme deneyimi, adminler için tam kontrol paneli.**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-Aiven-4479A1?style=flat&logo=mysql&logoColor=white)](https://aiven.io/)
[![Sequelize](https://img.shields.io/badge/Sequelize-6.x-52B0E7?style=flat&logo=sequelize&logoColor=white)](https://sequelize.org/)
[![iyzico](https://img.shields.io/badge/Payment-iyzico-1ABC9C?style=flat)](https://www.iyzico.com/)
[![Bunny.net](https://img.shields.io/badge/CDN-Bunny.net-FF8C00?style=flat)](https://bunny.net/)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat&logo=render&logoColor=white)](https://render.com/)

</div>

---

## 📖 İçindekiler

- [Vizyon](#-vizyon)
- [Öne Çıkan Özellikler](#-öne-çıkan-özellikler)
- [Teknoloji Yığını](#-teknoloji-yığını)
- [Mimari](#-mimari)
- [Veritabanı Şeması](#-veritabanı-şeması)
- [Kullanıcı Rolleri](#-kullanıcı-rolleri)
- [Güvenlik](#-güvenlik)
- [Kurulum](#-kurulum)
- [Ortam Değişkenleri](#-ortam-değişkenleri)
- [API Yapısı](#-api-yapısı)
- [Üretim Yayını](#-üretim-yayını)
- [Yol Haritası](#-yol-haritası)

---

## 🎯 Vizyon

EduNex, Türkiye pazarına özel tasarlanmış bir **çift taraflı eğitim marketplace**'idir.

**Çözdüğümüz sorunlar:**
- Eğitmenler için: video yönetimi, ödeme entegrasyonu, kursu pazarlama altyapısının sıfırdan kurulması gerekiyor.
- Öğrenciler için: video ilerleme takibi, sertifika, canlı ders, soru-cevap dağınık platformlara bölünmüş.
- Yöneticiler için: kurs onay süreci, ödeme yönetimi, kullanıcı denetimi tek bir yerde yok.

**EduNex tek bir platformda:**
- ✅ Profesyonel video oynatıcı (HLS streaming, hız kontrolü, kaldığı yerden devam)
- ✅ iyzico marketplace ile **çift taraflı (split) ödeme** — komisyon ve eğitmen payı otomatik bölüşülür
- ✅ Bunny.net CDN ile **küresel video dağıtımı**
- ✅ Otomatik **PDF sertifika** üretimi
- ✅ **Canlı ders** desteği (Jitsi entegrasyonu)
- ✅ **Quiz** sistemi (bölüm geçişi, otomatik puanlama)
- ✅ **Esnek indirim sistemi** (eğitmen + platform finanslı, süre kısıtlı kampanyalar)
- ✅ **Destek talebi sistemi** (admin–kullanıcı mesajlaşma)

---

## ✨ Öne Çıkan Özellikler

### 🎥 Profesyonel Video Deneyimi

- **HLS Streaming** (Bunny.net CDN üzerinden), her cihaza adaptif kalite
- **Plyr** modern UI: gradient seekbar, hız seçici (0.5x–2x), klavye kısayolları, PIP, tam ekran
- **Kaldığı yerden devam** — her 3 saniyede pozisyon localStorage'a kaydedilir
- **İleri sarma engeli** — eğitim bütünlüğü için izlenmemiş kısma atlanamaz
- **%95 otomatik tamamlama** — video sona yaklaştığında ders otomatik tamamlandı işaretlenir
- **Kanıt-tabanlı progress** — sadece izlenen saniyeler `maxWatchedSeconds`'a sayılır, atlama tespit edilir

### 💳 iyzico Marketplace Ödeme

- **SubMerchant** yapısıyla çift taraflı ödeme: kullanıcı öder → iyzico parayı **eğitmene** + **platforma** otomatik bölüştürür
- Tahsilat, **conversation_id + paymentTransactionId** ile audit izi
- Otomatik **payout (hakediş)** onayı — eğitmen kazancı `InstructorEarning` tablosunda
- **İade (refund)** akışı — kalem bazlı kısmi iade desteği
- Tüm akışlar **transaction'la atomik** + idempotent (duplicate callback'lere dayanıklı)

### 🏷️ Esnek İndirim Sistemi

Hem **eğitmen indirimi** hem **platform (EduNex) kampanyaları** birlikte çalışır.

| Özellik | Açıklama |
|---------|----------|
| Yüzde veya sabit ₺ indirim | İki seçenekten biri uygulanır |
| Zaman kısıtı | Başlangıç + bitiş tarihi opsiyonel |
| Hedefleme | Belirli kurs veya tüm dersler (global, sadece admin) |
| Finansman tarafı | `egitmen` = eğitmen kendi gelirinden kısar; `platform` = EduNex kazancından sübvanse eder |
| Additive | Eğitmen %20 + Platform %15 → Öğrenci %35 indirim görür |
| Otomatik gösterim | Kart önizleme, detay sayfası, sepet, eğitmen panelinin tümünde |

### 🎓 Sertifika Üretimi

- Öğrenci ilerleme yüzdesi **%100**'e ulaşınca otomatik PDF sertifika
- **PDFKit** ile dinamik üretim, **Montserrat** font ailesi
- Benzersiz UUID + indirilebilir link
- Eğitmen ve admin yönetim panellerinden takip

### 📚 Quiz Sistemi

- Bölüm sonlarına eklenebilir
- Çoktan seçmeli sorular, otomatik puanlama
- Geçme puanı + süre kısıtı eğitmen tarafından belirlenir
- **Sonraki bölüm kilidi** — quiz geçilmeden kilit açılmaz
- Her deneme `QuizAttempt` tablosunda tutulur, en yüksek puan kayıt

### 🔴 Canlı Dersler

- **Jitsi Meet** entegrasyonu
- Eğitmen oturum planlar, öğrenciler katılır
- Kayıt opsiyonu — Bunny CDN'e otomatik yükleme
- Genel webinar / kursa-özel olarak filtrelenebilir
- Katılım takibi (`LiveSessionAttendance`)

### 🛠️ Admin Komuta Merkezi

- **Kurs Onayları** — eğitmen taslakları yayına almadan önce admin onayı
- **Hakediş & Ödemeler** — eğitmen payout durumları, manuel onay
- **Sipariş Yönetimi** — iade, audit izi, filtreleme
- **Kullanıcı Yönetimi** — rol değiştirme, askıya alma
- **İndirim Kampanyaları** — toplu/platform indirimleri başlatma
- **Destek Talepleri** — kullanıcılarla 2 yönlü mesajlaşma, ticket kapatma
- **Kategori Yönetimi** — hiyerarşik kategoriler + kapak fotoğrafları
- **Yorum Moderasyonu**

---

## 🧰 Teknoloji Yığını

### Backend

| Katman | Teknoloji |
|--------|-----------|
| Runtime | Node.js 22+ |
| Framework | Express 5 |
| ORM | Sequelize 6 |
| Veritabanı | MySQL (Aiven Cloud) |
| Auth | JWT (jsonwebtoken) |
| Şifreleme | bcrypt |
| Validasyon | Custom + Sequelize hooks |
| Rate Limiting | express-rate-limit (user.id + IPv6 fallback) |
| Güvenlik | Helmet, CORS allowlist |
| Dosya Yükleme | Multer (MIME + extension AND, path traversal koruması) |
| Cron Görevleri | node-cron (doğrulanmamış hesap temizleme) |
| Logging | Morgan |

### Ödeme & Medya

| Servis | Kullanım |
|--------|----------|
| **iyzico** | Marketplace ödeme + subMerchant + iade |
| **Bunny Stream** | Video hosting + HLS transcoding |
| **Bunny Storage** | Belge/PDF/küçük dosyalar |
| **Bunny CDN** | Küresel dağıtım |
| **Nodemailer** | E-posta (Gmail SMTP) |

### Frontend

| Teknoloji | Kullanım |
|-----------|----------|
| HTML5 + Vanilla JS | Üç ayrı SPA (öğrenci, eğitmen, admin) |
| **HLS.js** | Video streaming |
| **Plyr.js** | Modern video oynatıcı UI |
| **Quill** | Zengin metin editörü (kurs açıklaması) |
| **Chart.js** | Admin dashboard grafikleri |
| **Canvas-confetti** | Kurs tamamlama kutlaması |
| Font Awesome 6 | İkon seti |
| Inter / Segoe UI | Tipografi |

### Altyapı

| Katman | Servis |
|--------|--------|
| Hosting | **Render** (Auto-deploy from GitHub) |
| DB | **Aiven** (MySQL) |
| CI/CD | GitHub → Render webhook |
| SSL | Render otomatik |
| Versiyon Kontrol | Git + GitHub PR akışı |

---

## 🏛️ Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                       İSTEMCİLER                            │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Öğrenci  │  │ Eğitmen    │  │ Admin    │  │  Anasayfa│ │
│  │  Paneli  │  │  Paneli    │  │  Paneli  │  │  (Public)│ │
│  └────┬─────┘  └─────┬──────┘  └────┬─────┘  └────┬─────┘ │
└───────┼──────────────┼───────────────┼─────────────┼───────┘
        │              │               │             │
        └──────────────┴───────┬───────┴─────────────┘
                               ↓
                ┌────────────────────────────┐
                │   Express App (app.js)     │
                │   Helmet · CORS · Logger   │
                └─────────────┬──────────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │              MIDDLEWARE                  │
        │  · authMiddleware (JWT verify, role)    │
        │  · rateLimitMiddleware (per user/IP)    │
        │  · uploadMiddleware (Multer + MIME)     │
        │  · concurrencyMiddleware                │
        └─────────────────────┬───────────────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │            ROUTES (24 dosya)             │
        │  /auth · /courses · /payments · /admin   │
        │  /quiz · /discounts · /support · …       │
        └─────────────────────┬───────────────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │         CONTROLLERS (24 dosya)           │
        │  İş mantığı, validasyon, response       │
        └─────────────────────┬───────────────────┘
                              ↓
        ┌─────────────────────────────────────────┐
        │            SERVICES (8 dosya)            │
        │  iyzico · bunny · email · progress      │
        │  certificate · discount · notification   │
        │  payoutApproval                         │
        └─────────┬──────────────┬────────────────┘
                  ↓              ↓
        ┌──────────────┐  ┌─────────────────┐
        │   MODELS     │  │  3rd PARTY       │
        │  (Sequelize) │  │  iyzico · Bunny  │
        │  29+ tablo   │  │  Gmail SMTP      │
        └──────┬───────┘  └──────────────────┘
               ↓
        ┌──────────────┐
        │ MySQL Aiven  │
        └──────────────┘
```

---

## 🗄️ Veritabanı Şeması

### Çekirdek Tablolar

| Tablo | Açıklama |
|-------|----------|
| `profiller` | Tüm kullanıcılar (öğrenci/eğitmen/admin) |
| `egitmen_detaylari` | Eğitmen bilgileri, IBAN, submerchant_key |
| `ogrenci_detaylari` | Öğrenci ek bilgileri |
| `kategoriler` | Hiyerarşik kategoriler (ust_kategori_id ile) |
| `kurslar` | Kurs ana tablosu — durum: taslak/onay_bekliyor/yayinda/arsiv |
| `bolumler` | Kurs müfredat bölümleri |
| `dersler` | Video, belge, quiz dersleri |
| `kurs_kayitlari` | Öğrenci enrollment (ilerleme yüzdesi) |
| `ders_ilerlemesi` | Ders bazlı tamamlama durumu |

### Ticaret

| Tablo | Açıklama |
|-------|----------|
| `sepetler` + `sepet_kalemleri` | Sepet (UNIQUE constraint atomic add) |
| `siparisler` | iyzico siparişleri (conversation_id, token) |
| `siparis_kalemleri` | Item bazlı; iyzico_item_transaction_id ile iade desteği |
| `odeme_islemleri` | Tüm iyzico API çağrıları audit log |
| `egitmen_hakedisleri` | Komisyon sonrası net tutar |
| `indirimler` | Esnek indirim sistemi |

### Etkileşim

| Tablo | Açıklama |
|-------|----------|
| `yorumlar` | Kurs puanı + yazılı yorum |
| `bildirimler` | Sistem bildirimleri |
| `egitmen_takipleri` | Takip ilişkisi |
| `sertifikalar` | PDF sertifika kayıtları |
| `canli_oturumlar` | Jitsi oturumları |
| `quiz_*` (5 tablo) | Quiz, soru, seçenek, deneme, cevap |
| `destek_talepleri` + `destek_mesajlari` | Ticket sistemi |

**Toplam: 29 tablo, UUID birincil anahtar standardı, soft delete (`silindi_mi`).**

---

## 👥 Kullanıcı Rolleri

### 🎓 Öğrenci

| Sayfa | Özellik |
|-------|---------|
| Anasayfa | Kategoriler, popüler kurslar, yorumlar |
| Tüm Kurslar | Filtre, arama, indirim göstergeleri |
| Kurs Detay | Açıklama, müfredat, önizleme dersleri, sepete ekle |
| Sepet | Toplam tutar (indirimli), iyzico checkout |
| Öğrenim Ekranı | Plyr video, müfredat, ilerleme, quiz |
| Sertifikalarım | Kazanılan PDF sertifikalar |
| Profilim | Hesap, ödeme geçmişi, takip listesi |

### 👨‍🏫 Eğitmen

| Sayfa | Özellik |
|-------|---------|
| Dashboard | KPI (öğrenci, gelir, kurs sayısı), satış grafiği |
| Kurslarım | Listeleme + indirim göstergeleri |
| Kurs Düzenle | 6 sekme: Temel Bilgiler, Medya & Fiyat, Müfredat, Yorumlar, Canlı Dersler, **İndirim** |
| Canlı Dersler | Jitsi oturumu planla, kayıt al |
| Hakediş | Onaylanan ödemeler, gelecek payout |
| Profil | Genel profil + Bio + IBAN + iyzico submerchant |

### 🛡️ Admin

| Sayfa | Özellik |
|-------|---------|
| Komuta Merkezi | Sistem KPI, son aktiviteler feed'i |
| Kurs Onayları | Bekleyen kurslar, içerik incelemesi |
| Kurs Takibi | Yayındaki kurslar, gizle/sil |
| Kullanıcı Yönetimi | Rol değişimi, askıya alma |
| Siparişler | Tüm satışlar, iade işlemleri |
| Hakediş & Ödemeler | iyzico payout durumları |
| Kategoriler | CRUD + kapak fotoğrafı |
| **İndirim Kampanyaları** | Global/kursa-özel, platform finanslı kampanyalar |
| Yorumlar | Moderasyon |
| Destek Talepleri | Ticket yanıtla, kapat |

---

## 🛡️ Güvenlik

### Uygulanan Önlemler

| Saldırı Türü | Önlem |
|--------------|-------|
| **SQL Injection** | Sequelize parametrized queries, raw query'lerde replacements |
| **XSS** | `escapeHtml`, `plainText` helper'ları; inline event handler yerine event delegation |
| **CSRF** | JWT-based auth (cookie değil), CORS allowlist |
| **Brute Force (Login)** | email + IP hybrid rate limit (5 deneme / 15 dk) |
| **Account Takeover (Reset)** | Token-based reset, SHA-256 hash, single-use, 1 saat geçerlilik |
| **Race Condition** | Sequelize transactions + row locks + UNIQUE constraints |
| **Path Traversal (Upload)** | `path.basename` + ASCII whitelist |
| **MIME Spoofing** | MIME **AND** extension her ikisi de zorunlu |
| **IDOR (Payment)** | iyzico'ya geri sorma + token-only erişim yok |
| **Error Info Leak** | Production'da generic mesaj, stack sadece dev'de |
| **Helmet Headers** | XSS-Protection, X-Frame-Options, CSP otomatik |
| **Secret Management** | `.env` git'te değil, secret rotation yapıldı |

### Rate Limit Tablosu

| Limit | Window | Max |
|-------|--------|-----|
| Genel API | 15 dk | 1000/user |
| Login (brute force) | 15 dk | 5 (email+IP) |
| Şifre sıfırlama | 15 dk | 5 (IP) |
| Video yükleme | 1 saat | 10 (eğitmen) |
| Kurs oluşturma | 24 saat | 50 |
| Bölüm oluşturma | 1 saat | 20 |

---

## 🚀 Kurulum

### Önkoşullar

- Node.js 22+
- MySQL 8 (veya Aiven Cloud hesabı)
- iyzico marketplace hesabı (test anahtarları)
- Bunny Stream library + Storage zone
- Gmail App Password (e-posta için)

### Adımlar

```bash
# 1. Repo klonla
git clone https://github.com/HentaBaldo/edunex.git
cd edunex

# 2. Bağımlılıkları yükle
npm install

# 3. Ortam değişkenlerini kur
cp .env.example .env
# .env dosyasını aç ve doldur (aşağıdaki tabloya bak)

# 4. Veritabanı tablolarını oluştur
# (manuel SQL scripts/ veya migration'la — Sequelize sync devre dışı)

# 5. Sunucuyu başlat
npm run dev    # geliştirme (nodemon)
npm start      # üretim
```

Sunucu varsayılan olarak **port 3000**'de çalışır.

---

## 🔐 Ortam Değişkenleri

`.env` dosyasında olması gereken değişkenler:

### Genel

```env
NODE_ENV=production
APP_BASE_URL=https://edunex.onrender.com
FRONTEND_URL=https://edunex.onrender.com
CORS_ORIGINS=https://edunex.onrender.com
```

### Veritabanı (Aiven MySQL)

```env
DB_HOST=...
DB_USER=avnadmin
DB_PASSWORD=...
DB_NAME=defaultdb
DB_PORT=23456
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
MYSQL_ATTR_SSL_CA=/path/to/ca.pem
```

### JWT & Session

```env
JWT_SECRET=<64-byte random hex>
JWT_EXPIRES_IN=7d
SESSION_SECRET=<32-byte random hex>
SESSION_TIMEOUT=3600
```

### iyzico (Marketplace)

```env
IYZICO_API_KEY=sandbox-...
IYZICO_SECRET_KEY=sandbox-...
IYZICO_URI=https://sandbox-api.iyzipay.com   # canlı: https://api.iyzipay.com
```

### Bunny.net

```env
BUNNY_LIBRARY_ID=657543
BUNNY_CDN_HOSTNAME=vz-xxxxxxxx.b-cdn.net
BUNNY_ACCESS_KEY=...
BUNNY_API_TIMEOUT=30000
BUNNY_STORAGE_ZONE_NAME=...
BUNNY_STORAGE_ACCESS_KEY=...
BUNNY_STORAGE_PULL_ZONE=https://....b-cdn.net
```

### E-posta (Gmail)

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=...@gmail.com
EMAIL_PASS=<gmail-app-password>
EMAIL_FROM=EduNex <noreply@edunex.com>
```

### Rate Limit Ayarları

```env
LOGIN_RATE_LIMIT=5
UPLOAD_RATE_LIMIT=10
COURSE_RATE_LIMIT=50
```

### Yükleme

```env
UPLOAD_DIR=./uploads
MAX_VIDEO_SIZE=4294967296   # 4 GB
MULTER_MAX_FILE_SIZE=4294967296
VIDEO_PROCESSING_TIMEOUT=300000
```

> ⚠️ **Güvenlik notu:** `.env` dosyası **asla** git'e commit edilmemeli. `.gitignore`'da zaten ekli.

---

## 🛣️ API Yapısı

### Kimlik Doğrulama
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
POST   /api/auth/verify-email
```

### Kurslar (Public)
```
GET    /api/courses/published          # Yayındaki kurslar (indirimli fiyatlarla)
GET    /api/courses/:id                # Kurs detayı
GET    /api/courses/public             # Anasayfa için (popüler + öne çıkan)
GET    /api/categories                 # Kategoriler
GET    /api/categories/:id/details     # Kategori + kurslar
```

### Öğrenci
```
GET    /api/courses/:id/learning       # Öğrenim ekranı verisi
PUT    /api/courses/:id/lessons/:lid/complete
POST   /api/cart/items                 # Sepete ekle
DELETE /api/cart/items/:kursId
POST   /api/payments/initiate          # iyzico checkout başlat
POST   /api/payments/callback          # iyzico return
GET    /api/certificates/me            # Sertifikalarım
```

### Eğitmen
```
GET    /api/courses/my-courses
POST   /api/courses                    # Kurs oluştur
PUT    /api/courses/:id                # Kurs güncelle
POST   /api/instructor/upload          # Video yükle (Bunny'e)
POST   /api/discounts                  # İndirim oluştur (kendi kursuna)
GET    /api/live-sessions/my-sessions
```

### Admin
```
GET    /api/admin/users
PUT    /api/admin/users/:id/role
GET    /api/admin/courses              # Onay bekleyen + tümü
POST   /api/admin/courses/:id/approve
GET    /api/admin/support/tickets
PATCH  /api/admin/support/tickets/:id/status
GET    /api/discounts/admin/all        # Tüm kampanyalar
POST   /api/discounts                  # Platform indirimi (NULL ders_id)
```

> Tam liste için `routes/` dizinine bakın.

---

## 🌐 Üretim Yayını

### Render Otomatik Deploy

1. GitHub repo → Render dashboard'a bağlı
2. `main` branch'e merge → otomatik deploy tetiklenir
3. Build: `npm install`
4. Start: `npm start`
5. Sağlık kontrolü: `GET /api/health`

### Önemli Üretim Notları

- **Aiven MySQL SSL zorunlu** — `DB_SSL=true`, `MYSQL_ATTR_SSL_CA` set edilmeli
- **Render disk ephemeral** — `uploads/` kalıcı değil, Bunny Storage kullanılır
- **iyzico canlı modu** — `IYZICO_URI=https://api.iyzipay.com`
- **JWT secret 64-byte** — `crypto.randomBytes(64).toString('hex')` ile üret
- **CORS_ORIGINS** sadece prod domain — wildcard kullanma

---

## 🗺️ Yol Haritası

### ✅ Tamamlandı (v1.0)

- [x] Kullanıcı yönetimi (3 rol)
- [x] Kurs onay süreci
- [x] iyzico marketplace entegrasyonu
- [x] Bunny HLS streaming + Plyr oynatıcı
- [x] İlerleme takibi + sertifika
- [x] Quiz sistemi + bölüm kilidi
- [x] Canlı ders (Jitsi)
- [x] Esnek indirim sistemi (eğitmen + platform)
- [x] Destek talebi sistemi
- [x] Şifre sıfırlama + e-posta doğrulama
- [x] Güvenlik denetimi + kritik açıkların kapatılması

### 🚧 Planlanan (v2.0)

- [ ] **Türkiye haritası analizi** — şehir bazlı satış görselleştirme
- [ ] **Eğitmen tavsiye motoru** — "şu kategori büyüyor" içgörüleri
- [ ] **Şehir hedeflemeli kampanyalar** — bölgesel pazarlama
- [ ] **Magic byte file validation** (`file-type` paketi)
- [ ] **Granular admin permission** (root admin → izin matrisi)
- [ ] **Sertifika ownership check** + signed URL
- [ ] **İlerleme yüzdesi history** (snapshot tablosu)
- [ ] **Mobile native app** (React Native)
- [ ] **Çok dilli destek** (i18n)

---

## 📊 Performans

- Tek sorguda toplu indirim hesaplama (`attachPricingToCourses` — N+1 yok)
- Sequelize eager loading + selektif `attributes`
- Helmet ile statik içerik cache header'ları
- Bunny CDN ile global edge dağıtımı
- HLS adaptive bitrate — her ağa uygun kalite

---

## 🤝 Geliştirme Akışı

```
feature-branch → PR → review → main → Render auto-deploy
```

- Tüm değişiklikler PR ile birleşir
- `main` branch protected (force push devre dışı)
- Commit mesajları **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`

---

## 📜 Lisans

Bu proje akademik bir proje çalışmasıdır. Tüm hakları geliştirici ekibe aittir.

---

<div align="center">

**🎓 EduNex — Bilgi senin, gelecek hepimizin.**

[Canlı Demo](https://edunex-m252.onrender.com) · [Sorun Bildir](https://github.com/HentaBaldo/edunex/issues) · [Katkı Sağla](https://github.com/HentaBaldo/edunex/pulls)

</div>
