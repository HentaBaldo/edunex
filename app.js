/**
 * EduNex Application Configuration (app.js)
 * Express.js uygulamasinin temel middleware (ara katman), guvenlik, 
 * statik dosya sunumu ve ana rota (routing) baglantilarini yonetir.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// --- 1. File System Initialization ---
// Multer vb. dosya isleme modullerinin calisabilmesi icin gerekli dizinlerin kontrolu
const uploadDir = path.join(__dirname, 'uploads/temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('[APP CONFIG] Gecici yukleme dizini (uploads/temp) basariyla olusturuldu/dogrulandi.');
}

// --- 2. Security & Core Middleware ---
// Kapsamli guvenlik basliklari (Gelistirme asamasinda CSP esnekligi saglanmistir)
app.use(helmet({ contentSecurityPolicy: false }));

// Cross-Origin Resource Sharing
app.use(cors());

// HTTP istek loglama (Endustri standardi 'combined' formatinda)
app.use(morgan('combined'));

// Body Parser yapilandirmasi (JSON ve URL Encoded veriler icin)
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
const adminUserRoutes = require('./routes/adminUserRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');

// Rota Baglamalari (Parametre ezilmelerini onlemek icin ozel rotalar ustte tanimlanabilir)
app.use('/api/instructor', instructorRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/enrollments', enrollmentRoutes);

// --- 5. Root Redirection ---
// Kok dizine gelen istekleri varsayilan ana sayfaya yonlendirir
app.get('/', (req, res) => {
    res.redirect('/main/index.html');
});

// --- 6. 404 Not Found Handler (API) ---
// Tanimsiz bir API uc noktasina (endpoint) istek atildiginda standart hata objesi doner
app.all(/\/api\/.*/, (req, res) => {
    return res.status(404).json({
        success: false,
        code: 404,
        message: 'Talep edilen API uc noktasi bulunamadi.'
    });
});

// --- 7. Global Error Handler ---
// Uygulama genelinde firlatilan (throw) veya yakalanamayan hatalari merkezi olarak yonetir
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