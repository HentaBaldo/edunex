/**
 * EduNex Application Configuration
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');

const { sequelize } = require('./models');
const seedCategories = require('./seeders/categorySeeder');
const seedProfiles = require('./seeders/profileSeeder');
const { apiLimiter } = require('./middleware/rateLimitMiddleware');

const app = express();

// Render gibi reverse-proxy arkasinda calisirken X-Forwarded-* header'larina guvenmek
// (HTTPS algilama, gercek client IP, rate-limit dogrulugu icin sart).
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// --- 1. File System Initialization ---
// Multer transit klasoru (yukleme bitince temizlenir) + Bunny basarisiz olursa
// yedek olarak kullanilan kalici klasorler.
const uploadDirs = [
    path.join(__dirname, 'uploads/temp'),       // Multer transit
    path.join(__dirname, 'uploads/lessons'),    // Bunny fallback - ders belgeleri
    path.join(__dirname, 'uploads/avatars'),    // Bunny fallback - profil fotograflari
    path.join(__dirname, 'uploads/recordings')  // Canli ders kaydi (Bunny'e yuklenmeden once gecici)
];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[SYSTEM] Yukleme dizini olusturuldu: ${path.relative(__dirname, dir)}`);
    }
});

// --- 2. Security & Core Middleware ---
// CSP: Bunny iframe, YouTube, Vimeo, Jitsi ve sayfada satir-ici script kullanildigindan
// gevsetilmis bir politika ile aciliyoruz; tamamen kapatmak yerine guvenlik katmaninin
// onemli kismini koruyoruz.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS: izin verilen origin listesi env'den okunur.
// GUVENLIK: CORS_ORIGINS bos veya parse edilemez ise API'yi tum dunyaya
// acmak yerine guvenli bir fallback'e dusuyoruz (sadece localhost:3000).
// Production'da CORS_ORIGINS env'inin DOGRU set edildigi varsayilir; aksi
// halde bu fallback uretim trafigini bloklar — istenen davranis.
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

let allowedOrigins;
try {
    const parsed = (process.env.CORS_ORIGINS || '')
        .split(',').map(o => o.trim()).filter(Boolean);
    allowedOrigins = parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_ORIGINS];
} catch (_e) {
    allowedOrigins = [...DEFAULT_ALLOWED_ORIGINS];
}

// FRONTEND_URL (frontend'in calistigi origin) varsa allowedOrigins'e eklenir.
// Sebep: CORS_ORIGINS production'da sadece prod domain'ini icerebilir; bu
// durumda lokalde FRONTEND_URL=http://localhost:3000 ile dev origin'i de
// guvenli sekilde kabul edilir. Wildcard fallback YOK — origin daima
// explicit olarak env'de tanimli olmali.
if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
    allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
    origin: (origin, callback) => {
        // Same-origin / curl / Postman istekleri (origin = undefined) serbest
        if (!origin) return callback(null, true);

        // --- IYZICO BYPASS ---
        // İyzico'nun sandbox ve canlı domainlerinden gelen isteklere her zaman izin ver
        if (origin.includes('iyzipay.com') || origin.includes('iyzico.com')) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) return callback(null, true);
        // statusCode set ediyoruz ki global error handler bunu 500 (Internal Server Error)
        // olarak degil, 403 (Forbidden) olarak dondursun ve gercek sebep maskelenmesin.
        const corsErr = new Error('CORS Error');
        corsErr.statusCode = 403;
        return callback(corsErr);
    },
    credentials: true
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// JSON ve URL-encoded parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- 3. Static File Serving ---
app.use(express.static(path.join(__dirname, 'public')));

// GUVENLIK: Canli ders kayitlari (uploads/recordings) hassas icerik —
// Bunny.net'e yuklenmeden once gecici olarak burada tutuluyor. Public static
// servisin DISINDA tutuyoruz; ihtiyac halinde authorize edilmis bir route ile
// (egitmen + kursa kayitli ogrenci) sunulmali. Asagidaki guard, express.static
// devreye girmeden once /uploads/recordings/* isteklerini 403 ile keser.
app.use('/uploads/recordings', (_req, res) => {
    return res.status(403).json({
        success: false,
        message: 'Canli ders kayitlarina dogrudan erisim yasaktir.'
    });
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- 4. API Routes Registration ---
// --- 4. API Routes Registration ---
const authRoutes = require('./routes/authRoutes');
const instructorRoutes = require('./routes/instructorRoutes');
const courseRoutes = require('./routes/courseRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const curriculumRoutes = require('./routes/curriculumRoutes');
const adminRoutes = require('./routes/adminRoutes');
const profileRoutes = require('./routes/profileRoutes');
const courseEnrollmentRoutes = require('./routes/courseEnrollmentRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const cartRoutes = require('./routes/cartRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const liveSessionRoutes = require('./routes/liveSessionRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const quizRoutes = require('./routes/quizRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const followRoutes = require('./routes/followRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const supportRoutes = require('./routes/supportRoutes');
const discountRoutes = require('./routes/discountRoutes');
const receiptRoutes = require('./routes/receiptRoutes');

// === GLOBAL API DDoS KORUMASI ===
// Tum /api/* rotalarinin onunde calisir. Login/upload gibi spesifik limiter'lar
// ilgili route'lara ayrica baglandigi icin sira: once global apiLimiter (kaba
// kalkan), sonra route-bazli limiter (ince ayar).
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/enrollments', courseEnrollmentRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/live-sessions', liveSessionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/receipts', receiptRoutes);

// --- 5. Root Redirection ---
app.get('/', (req, res) => {
    res.redirect('/main/index.html');
});

// Canlı ders odası (Jitsi iframe wrapper). :oda_adi sadece statik HTML servis edilir,
// JS tarafı URL'den oda adını çekip Jitsi'yi başlatır (oturum doğrulaması iframe içinde).
app.get('/canli-ders/:oda_adi', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main', 'live-room.html'));
});
// --- 6. Database Synchronization & Seeding ---
/**
 * Veritabani semasini modellerle esitler ve baslangic verilerini yukler.
 *
 * KRITIK GUVENLIK KURALI:
 *   - PRODUCTION'da `alter: true` ASLA calismaz. Sequelize'in alter mekanizmasi
 *     MySQL'de tekrarlanan UNIQUE/INDEX olusturup 64-indeks sinirini patlattigi
 *     icin (eposta_2..eposta_62 vb. kopyalar) production'da yasaklandi.
 *     Production'da sema degisikligi sadece elle yazilmis migrations/*.sql ile
 *     yapilir. (Bkz: cleanup-indexes ile yapilan acil temizlik 2026-05-14.)
 *   - Geliştirme/test ortamlarinda `alter: true` ile model-DB senkronizasyonu acik.
 *   - `force: true` HIC BIR ortamda otomatik calismaz (veri silici).
 */
const isProd = process.env.NODE_ENV === 'production';
const syncOptions = isProd ? {} : { alter: true };
if (isProd) {
    console.log('[DATABASE] PRODUCTION modu: sequelize.sync alter/force devre disi. Sema degisikleri icin migrations/ kullanin.');
} else {
    console.log(`[DATABASE] ${process.env.NODE_ENV || 'development'} modu: sequelize.sync({ alter: true }) aktif.`);
}

sequelize.sync(syncOptions)
    .then(async () => {
        console.log('[DATABASE] Veritabani semasi modellerle senkronize edildi.');

        // Odeme akisi icin gerekli kolonlarin fiziksel varligini dogrula.
        // sequelize.sync() (alter parametresiz) mevcut tabloya kolon eklemez,
        // bu yuzden production DB'de phone/identity_number eksik kalmis olabilir.
        try {
            const desc = await sequelize.getQueryInterface().describeTable('profiller');
            const missing = ['phone', 'identity_number'].filter(c => !desc[c]);
            if (missing.length > 0) {
                console.error(`[DB CHECK] profiller tablosunda eksik kolonlar: ${missing.join(', ')}. Odeme akisi calismayacak. Manuel ALTER TABLE calistirin.`);
            } else {
                console.log('[DB CHECK] profiller.phone & profiller.identity_number mevcut.');
            }

            // --- Sifre Sifirlama Migration (Faz: 2026-05-15) ---
            // production'da sync({alter:true}) kapali oldugu icin yeni eklenen
            // resetPasswordToken / resetPasswordExpires kolonlari DB'ye duzmuyor.
            // Sequelize Profile.findOne calistirdiginda model attribute'larini SELECT
            // clause'a koydugu icin "Unknown column" hatasi atip register/login akisini
            // patlatiyor. Idempotent ALTER ile garanti altina aliyoruz.
            if (!desc.resetPasswordToken || !desc.resetPasswordExpires) {
                const colsToAdd = [];
                if (!desc.resetPasswordToken)   colsToAdd.push('ADD COLUMN resetPasswordToken VARCHAR(64) NULL DEFAULT NULL');
                if (!desc.resetPasswordExpires) colsToAdd.push('ADD COLUMN resetPasswordExpires DATETIME NULL DEFAULT NULL');
                await sequelize.query(`ALTER TABLE profiller ${colsToAdd.join(', ')}`);
                console.log(`[PASSWORD RESET MIGRATION] profiller tablosuna eklendi: ${colsToAdd.length} kolon.`);
            } else {
                console.log('[PASSWORD RESET MIGRATION] resetPasswordToken & resetPasswordExpires zaten mevcut.');
            }
        } catch (descErr) {
            console.error('[DB CHECK] profiller tablosu sema kontrolu yapilamadi:', descErr.message);
        }

        // --- Payout/Hakedis: T+14 Backfill ---
        // sequelize.sync({alter:true}) yeni 'durum' kolonunu ENUM olarak ekledi.
        // Mevcut kayitlarin durumu NULL (default uygulanmadi) veya MySQL bagli olarak
        // bos string olabilir. Idempotent backfill: NULL/empty olanlari tarihe gore set et.
        try {
            const earningsDesc = await sequelize.getQueryInterface().describeTable('egitmen_hakedisleri');
            if (earningsDesc.durum) {
                const [, availMeta] = await sequelize.query(`
                    UPDATE egitmen_hakedisleri
                       SET durum = 'available'
                     WHERE (durum IS NULL OR durum = '')
                       AND olusturulma_tarihi < (NOW() - INTERVAL 14 DAY)
                `);
                const [, pendingMeta] = await sequelize.query(`
                    UPDATE egitmen_hakedisleri
                       SET durum = 'pending'
                     WHERE (durum IS NULL OR durum = '')
                `);
                const availCount = availMeta?.affectedRows ?? 0;
                const pendingCount = pendingMeta?.affectedRows ?? 0;
                if (availCount > 0 || pendingCount > 0) {
                    console.log(`[PAYOUT BACKFILL] T+14 backfill: ${availCount} kayit -> available, ${pendingCount} kayit -> pending.`);
                } else {
                    console.log('[PAYOUT BACKFILL] Tum kayitlarin durumu zaten set, backfill atlandi.');
                }
            } else {
                console.warn('[PAYOUT BACKFILL] egitmen_hakedisleri.durum kolonu bulunamadi, backfill yapilamadi.');
            }
        } catch (payoutErr) {
            console.error('[PAYOUT BACKFILL] Hata:', payoutErr.message);
        }

        // --- Notification ENUM Backfill ---
        // sequelize.sync({alter:true}) MySQL ENUM degisikliklerinde her zaman
        // dogru ALTER uretmez (ozellikle ENUM'a deger eklemede). Burada idempotent
        // bir MODIFY COLUMN ile bildirimler.tip enum'unu ve kaynak_id sutununu
        // garanti altina aliyoruz. Migration dosyasi: migrations/2026-05-14-*.sql
        try {
            const bildirimDesc = await sequelize.getQueryInterface().describeTable('bildirimler');
            if (bildirimDesc.tip) {
                await sequelize.query(`
                    ALTER TABLE bildirimler
                      MODIFY COLUMN tip ENUM(
                        'yeni_kurs','canli_yayin','sistem','satis','yorum','takip','destek'
                      ) NOT NULL DEFAULT 'sistem'
                `);
                if (!bildirimDesc.kaynak_id) {
                    await sequelize.query(`
                        ALTER TABLE bildirimler
                          ADD COLUMN kaynak_id CHAR(36) NULL AFTER hedef_url
                    `);
                    console.log('[NOTIFICATION MIGRATION] kaynak_id sutunu eklendi.');
                }
                if (!bildirimDesc.guncelleme_tarihi) {
                    await sequelize.query(`
                        ALTER TABLE bildirimler
                          ADD COLUMN guncelleme_tarihi DATETIME NOT NULL
                          DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    `);
                    console.log('[NOTIFICATION MIGRATION] guncelleme_tarihi sutunu eklendi.');
                }
                console.log('[NOTIFICATION MIGRATION] bildirimler.tip ENUM senkronize edildi (satis/yorum/takip dahil).');
            } else {
                console.warn('[NOTIFICATION MIGRATION] bildirimler tablosu bulunamadi; sync sonrasi yeniden olusturulmus olabilir.');
            }
        } catch (notifMigErr) {
            // KRITIK: Burayi yutmuyoruz; bildirim modulu bu olmadan sessizce coker.
            console.error('[NOTIFICATION MIGRATION ERROR]', notifMigErr.message);
        }

        // --- Destek Modulu Migration (Faz 1+2) ---
        // sequelize.sync({alter:true}) MySQL'de mevcut tabloya YENI KOLON eklemiyor
        // (ENUM degisikligi gibi); destek_talepleri/destek_mesajlari ilk seferde
        // CREATE TABLE ile dogru olusur, ancak kurslar.red_sebebi mevcut tabloya
        // dusmez. Idempotent ALTER ile garanti altina aliyoruz.
        try {
            const kurslarDesc = await sequelize.getQueryInterface().describeTable('kurslar');
            if (!kurslarDesc.red_sebebi) {
                await sequelize.query(`
                    ALTER TABLE kurslar
                      ADD COLUMN red_sebebi TEXT NULL
                `);
                console.log('[SUPPORT MIGRATION] kurslar.red_sebebi sutunu eklendi.');
            }
        } catch (supMigErr) {
            console.error('[SUPPORT MIGRATION ERROR] kurslar.red_sebebi:', supMigErr.message);
        }

        // sertifikalar.pdf_yolu → sertifikalar.sertifika_url migration (idempotent)
        try {
            const certDesc = await sequelize.getQueryInterface().describeTable('sertifikalar');
            if (certDesc.pdf_yolu && !certDesc.sertifika_url) {
                await sequelize.query(`ALTER TABLE sertifikalar CHANGE COLUMN pdf_yolu sertifika_url VARCHAR(512) NULL`);
                console.log('[CERT MIGRATION] sertifikalar.pdf_yolu → sertifika_url yeniden adlandırıldı.');
            } else if (!certDesc.sertifika_url) {
                await sequelize.query(`ALTER TABLE sertifikalar ADD COLUMN sertifika_url VARCHAR(512) NULL`);
                console.log('[CERT MIGRATION] sertifikalar.sertifika_url kolonu eklendi.');
            }
        } catch (certMigErr) {
            console.error('[CERT MIGRATION ERROR]', certMigErr.message);
        }

        // Sertifika fontlarını arka planda ön-ısıt (ilk PDF isteğinde gecikme olmasın)
        require('./services/certificateService').getFontsReady().catch(err => {
            console.warn('[CERT FONTS] Ön-ısıtma başarısız:', err.message);
        });

        try {
            console.log('[SEEDER] Kategori hiyerarsisi kontrol ediliyor...');
            await seedCategories();

            console.log('[SEEDER] Temel kullanıcı profilleri kontrol ediliyor...');
            await seedProfiles();

            console.log('[SYSTEM] Baslangic verileri senkronizasyonu basariyla tamamlandi.');
        } catch (seederError) {
            console.error('[SEEDER ERROR] Veri yukleme sirasinda hata olustu:', seederError.message);
        }
    })
    .catch(err => {
        console.error('[DATABASE ERROR] Veritabani baglantisi hatasi:', err.message);
    });

// --- 7. 404 Not Found Handler (API) ---
app.all(/\/api\/.*/, (req, res) => {
    return res.status(404).json({
        success: false,
        code: 404,
        message: 'Talep edilen API uc noktasi bulunamadi.'
    });
});

// --- 8. Global Error Handler ---
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const environment = process.env.NODE_ENV || 'development';
    const isProduction = environment === 'production';

    // Sunucu loguna her zaman tum detay yazilir (Render dashboard'undan izlenir).
    console.error(`[ERROR] ${err.name || 'Error'}: ${err.message}`);
    if (!isProduction) {
        console.error('[STACK]', err.stack);
    }

    // 5xx hatalarinda istemciye teknik detay sizdirma (sadece development'ta stack).
    const safeMessage = isProduction && statusCode >= 500
        ? 'Sunucu tarafinda bir hata olustu. Lutfen daha sonra tekrar deneyin.'
        : (err.message || 'Sunucu Ici Hata');

    return res.status(statusCode).json({
        success: false,
        message: safeMessage,
        ...(!isProduction && { stack: err.stack })
    });
});

module.exports = app;