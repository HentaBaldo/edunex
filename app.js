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

// CORS: izin verilen origin listesi env'den okunur. Bos birakilirsa ayni-origin
// kullanim varsayilir (canli ortamda public/ statik servis edildigi icin yeterli).
// Yerel gelistirme icin localhost / 127.0.0.1 (her port) her durumda serbesttir;
// boylece Live Server (5500), Vite (5173) ya da farkli portlardan calisan
// frontend dev sunuculari CORS_ORIGINS env'i ayarlanmadan da API'ye erisebilir.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',').map(o => o.trim()).filter(Boolean);

const isLoopbackOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

app.use(cors({
    origin: (origin, callback) => {
        // Same-origin / curl / Postman istekleri (origin = undefined) serbest
        if (!origin) return callback(null, true);
        // Loopback (localhost / 127.0.0.1) her zaman serbest — dev ortami kolaylasir
        if (isLoopbackOrigin(origin)) return callback(null, true);
        // Env hic ayarlanmadiysa (production'da yanlislikla bos kalirsa)
        // tamamen acmak yerine sadece loopback'e izin verdik, bu durumda diger origin'leri reddet
        if (allowedOrigins.length === 0) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS engellendi: ${origin}`));
    },
    credentials: true
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// JSON ve URL-encoded parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- 3. Static File Serving ---
app.use(express.static(path.join(__dirname, 'public')));
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
 * alter: true yapilandirmasi mevcut verileri koruyarak tablo yapisini gunceller.
 */
sequelize.sync({ alter: true })
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
        } catch (descErr) {
            console.error('[DB CHECK] profiller tablosu sema kontrolu yapilamadi:', descErr.message);
        }

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