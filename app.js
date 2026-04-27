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

// --- 1. File System Initialization ---
// Multer transit klasoru (yukleme bitince temizlenir) + Bunny basarisiz olursa
// yedek olarak kullanilan kalici klasorler.
const uploadDirs = [
    path.join(__dirname, 'uploads/temp'),     // Multer transit
    path.join(__dirname, 'uploads/lessons'),  // Bunny fallback - ders belgeleri
    path.join(__dirname, 'uploads/avatars')   // Bunny fallback - profil fotograflari
];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[SYSTEM] Yukleme dizini olusturuldu: ${path.relative(__dirname, dir)}`);
    }
});

// --- 2. Security & Core Middleware ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));

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
const adminUserRoutes = require('./routes/adminUserRoutes');  // ✅ IMPORT
const recommendationRoutes = require('./routes/recommendationRoutes');
const cartRoutes = require('./routes/cartRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const liveSessionRoutes = require('./routes/liveSessionRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/enrollments', courseEnrollmentRoutes);
app.use('/api/admin/users', adminUserRoutes);  // ✅ REGISTER
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/live-sessions', liveSessionRoutes);

// --- 5. Root Redirection ---
app.get('/', (req, res) => {
    res.redirect('/main/index.html');
});
// --- 6. Database Synchronization & Seeding ---
/**
 * Veritabani semasini modellerle esitler ve baslangic verilerini yukler.
 * alter: true yapilandirmasi mevcut verileri koruyarak tablo yapisini gunceller.
 */
sequelize.sync()
    .then(async () => {
        console.log('[DATABASE] Veritabani semasi modellerle senkronize edildi.');
        
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

    console.error(`[ERROR] ${err.name}: ${err.message}`);
    
    if (environment === 'development') {
        console.error('[STACK]', err.stack);
    }

    return res.status(statusCode).json({
        success: false,
        message: err.message || 'Sunucu Ici Hata',
        ...(environment === 'development' && { stack: err.stack })
    });
});

module.exports = app;