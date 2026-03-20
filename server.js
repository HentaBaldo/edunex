require('dotenv').config();
const express = require('express');
const app = express();
const { sequelize } = require('./models');

// === TEMEL AYARLAR VE MIDDLEWARE ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// İstekleri loglama (Arkadaşının yazdığı faydalı hata ayıklayıcı)
app.use((req, res, next) => {
    console.log(`İSTEK: ${req.method} ${req.url}`);
    next();
});

// === ROTALARI (ROUTES) İÇE AKTARMA ===
const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
// userController rotalarını da buraya ekleyebilirsiniz: const userRoutes = require('./routes/userRoutes');

// === ROTALARI SİSTEME TANITMA ===
app.use('/api/auth', authRoutes); // /api/auth/kayit ve /api/auth/giris buraya gider
app.use('/api', courseRoutes);    // /api/kurslar ve /api/bolumler buraya gider

// Hata Yönetimi (Bulunamayan Rotalar)
app.use((req, res) => {
    res.status(404).json({ hata: `Sunucuda '${req.url}' adresi bulunamadı.` });
});

// === SUNUCUYU BAŞLATMA ===
const PORT = process.env.PORT || 3000;

sequelize.sync()
    .then(() => {
        console.log('✅ Veritabanı senkronize edildi (Eksik tablolar oluşturuldu).');
        app.listen(PORT, () => {
            console.log(`🚀 EduNex Backend Yayında: http://localhost:${PORT}`);
            console.log(`🛡️ Güvenlik: JWT ve Rol Kontrolü Devrede\n======================================`);
        });
    })
    .catch((err) => {
        console.error('❌ Veritabanı senkronizasyon hatası:', err);
    });