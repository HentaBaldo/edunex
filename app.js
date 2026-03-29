const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// --- 1. GÜVENLİK VE YAPILANDIRMA ---
app.use(helmet({
    contentSecurityPolicy: false, // Geliştirme aşamasında statik dosyalar için esneklik sağlar
}));

app.use(cors());

// HTTP isteklerini standart Apache log formatında kaydeder
app.use(morgan('combined'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 2. STATİK DOSYALAR ---
app.use(express.static(path.join(__dirname, 'public')));

// --- 3. API ROTALARI ---
const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const curriculumRoutes = require('./routes/curriculumRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/curriculum', curriculumRoutes);

// --- 4. ANA YÖNLENDİRME ---
app.get('/', (req, res) => {
    res.redirect('/main/index.html');
});

// --- 5. 404 API YÖNETİMİ ---
// Node v24 ve modern Express sürümleri için Regex tabanlı 404 yakalayıcı
app.all(/\/api\/.*/, (req, res) => {
    res.status(404).json({
        status: 'error',
        code: 404,
        message: 'Talep edilen API uç noktası bulunamadı.'
    });
});

// --- 6. GLOBAL HATA YÖNETİMİ (MERKEZİ) ---
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const environment = process.env.NODE_ENV || 'development';

    // Standart log formatı: [SEVIYE] [ZAMAN] MESAJ
    console.error(`[HATA] [${new Date().toISOString()}] ${err.name}: ${err.message}`);
    
    if (environment === 'development') {
        console.error(err.stack);
    }

    res.status(statusCode).json({
        status: 'error',
        message: err.message || 'Sunucu İçi Hata',
        // Geliştirme modunda hata detayını (stack trace) gönderir
        ...(environment === 'development' && { stack: err.stack })
    });
});

// Uygulamayı dışa aktar (Dinleme işlemi burada yapılmaz)
module.exports = app;