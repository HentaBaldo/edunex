/**
 * EduNex Application Configuration (app.js)
 * Express.js uygulamasının temel middleware, güvenlik, 
 * statik dosya sunumu, veritabanı senkronizasyonu ve rota yönetimini sağlar.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');

// Veritabanı ve Seeder Bileşenleri
const { sequelize } = require('./models');
const seedCategories = require('./seeders/categorySeeder');
const seedProfiles = require('./seeders/profileSeeder');

const app = express();

// --- 1. File System Initialization ---
const uploadDir = path.join(__dirname, 'uploads/temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('[SYSTEM] Gecici yukleme dizini (uploads/temp) dogrulandi.');
}

// --- 2. Security & Core Middleware ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. Static File Serving ---
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. API Routes Registration ---
const authRoutes = require('./routes/authRoutes');
const instructorRoutes = require('./routes/instructorRoutes');
const courseRoutes = require('./routes/courseRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const curriculumRoutes = require('./routes/curriculumRoutes');
const adminRoutes = require('./routes/adminRoutes');
const profileRoutes = require('./routes/profileRoutes');

app.use('/api/instructor', instructorRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);

// --- 5. Root Redirection ---
app.get('/', (req, res) => {
    res.redirect('/main/index.html');
});
// --- 6. Database Synchronization & Seeding ---
/**
 * Veritabani semasini modellerle esitler ve baslangic verilerini yukler.
 * alter: true yapilandirmasi mevcut verileri koruyarak tablo yapisini gunceller.
 */
sequelize.sync({ alter: false })
    .then(async () => {
        console.log('[DATABASE] Veritabani semasi modellerle senkronize edildi (Alter Mode).');
        
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
        console.error('[DATABASE ERROR] Veritabani baglantisi veya senkronizasyon hatasi:', err.message);
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

    console.error(`[GLOBAL ERROR] ${err.name}: ${err.message}`);
    
    if (environment === 'development') {
        console.error(err.stack);
    }

    return res.status(statusCode).json({
        success: false,
        message: err.message || 'Sunucu Ici Hata (Internal Server Error)',
        ...(environment === 'development' && { stack: err.stack })
    });
});

module.exports = app;