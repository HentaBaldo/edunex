require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const app = express();
const { sequelize, Kurs, KursBolum, Ders } = require('./models');

// --- CONTROLLER VE MIDDLEWARE ICE AKTARIMLARI ---
const authController = require('./controllers/authController');
const categoryController = require('./controllers/categoryController');
const courseController = require('./controllers/courseController');
const userController = require('./controllers/userController'); 
const auth = require('./middleware/authMiddleware');

// --- TEMEL AYARLAR ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ==========================================
//    LOGLAMA (HATA AYIKLAMA VE IZLEME)
// ==========================================
app.use((req, res, next) => {
    console.log(`ISTEK: ${req.method} ${req.url}`);
    next();
});

// ==========================================
//           KULLANICI VE AUTH ROTALARI
// ==========================================
app.post('/api/kayit', authController.register);
app.post('/api/giris', authController.login);

app.get('/api/profil', auth.verifyToken, userController.getProfil);
app.put('/api/profil/guncelle', auth.verifyToken, userController.updateProfil);

// ==========================================
//           KATEGORI VE KURS ROTALARI
// ==========================================
app.get('/api/kategoriler', categoryController.getKategoriler);

app.post('/api/kurslar', auth.verifyToken, auth.isEgitmen, courseController.kursEkle);
app.get('/api/kurslarim', auth.verifyToken, courseController.getEgitmenKurslari);

app.get('/api/kurslar/hepsi', courseController.getAllKurslar);

// ==========================================
//      KURS YONETIMI (DETAYLI GUNCELLEME)
// ==========================================
app.put('/api/kurslar/:kursId/detay-guncelle', auth.verifyToken, auth.isEgitmen, async (req, res) => {
    const { kazanimlar, gereksinimler } = req.body;
    try {
        await Kurs.update(
            { kazanimlar, gereksinimler },
            { where: { id: req.params.kursId } }
        );
        res.json({ mesaj: 'Kurs detaylari basariyla guncellendi.' });
    } catch (err) {
        console.error("Detay Guncelleme Hatasi:", err);
        res.status(500).json({ hata: "Veritabani guncellenemedi." });
    }
});

// ==========================================
//       MUFREDAT (BOLUM VE DERS) ROTALARI
// ==========================================

// Kursun Bolumlerini Getir
app.get('/api/kurslar/:kursId/bolumler', auth.verifyToken, async (req, res) => {
    try {
        const bolumler = await KursBolum.findAll({
            where: { kurs_id: req.params.kursId },
            order: [['sira_numarasi', 'ASC']]
        });
        res.json(bolumler);
    } catch (err) { 
        console.error("Bolum Getirme Hatasi:", err.message);
        res.status(500).json({ hata: "Bolumler getirilemedi." }); 
    }
});

// Bolumun Derslerini Getir
app.get('/api/bolumler/:bolumId/dersler', auth.verifyToken, async (req, res) => {
    try {
        const dersler = await Ders.findAll({
            where: { bolum_id: req.params.bolumId },
            order: [['sira_numarasi', 'ASC']]
        });
        res.json(dersler);
    } catch (err) { 
        console.error("Ders Getirme Hatasi:", err.message);
        res.status(500).json({ hata: "Dersler getirilemedi." }); 
    }
});

// Yeni Bolum Ekle
app.post('/api/bolumler/ekle', auth.verifyToken, auth.isEgitmen, async (req, res) => {
    const { kurs_id, baslik } = req.body;
    const yeniId = uuidv4();

    try {
        const toplam = await KursBolum.count({ where: { kurs_id } });
        const yeniSira = toplam + 1;

        await KursBolum.create({
            id: yeniId,
            kurs_id,
            baslik,
            sira_numarasi: yeniSira
        });

        res.json({ ok: true, mesaj: 'Bolum sirasiyla eklendi!' });
    } catch (err) {
        console.error("Bolum Ekleme Hatasi:", err.message);
        res.status(500).json({ hata: err.message });
    }
});

// Yeni Ders (Video/Icerik) Ekle
app.post('/api/dersler/ekle', auth.verifyToken, auth.isEgitmen, async (req, res) => {
    const { bolum_id, baslik, aciklama, icerik_tipi, video_url, kaynak_url, onizleme_mi, sure } = req.body;
    const yeniId = uuidv4();

    try {
        const toplam = await Ders.count({ where: { bolum_id } });
        const yeniSira = toplam + 1;

        await Ders.create({
            id: yeniId,
            bolum_id,
            baslik,
            aciklama,
            icerik_tipi,
            kaynak_url,
            video_saglayici_id: video_url,
            sure_saniye: sure || 0,
            onizleme_mi: onizleme_mi ? true : false,
            sira_numarasi: yeniSira
        });

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ hata: err.message });
    }
});

// ==========================================
//      HATA YONETIMI VE SUNUCU BASLATMA
// ==========================================

app.use((req, res) => {
    console.log(`404: ${req.method} ${req.url}`);
    res.status(404).json({ hata: `Sunucuda '${req.url}' adresi bulunamadi.` });
});

const PORT = process.env.PORT || 3000;

// Sequelize sync: Tablolari olustur veya eksik sutunlari ekle
sequelize.sync({ alter: true })
    .then(() => {
        console.log('Veritabani senkronize edildi (tablolar olusturuldu/guncellendi).');
        app.listen(PORT, () => {
            console.log(`\n===================================`);
            console.log(`EduNex Backend Yayinda: http://localhost:${PORT}`);
            console.log(`Veritabani: Aktif (SQLite)`);
            console.log(`Guvenlik: JWT ve Rol Kontrolu Devrede`);
            console.log(`===================================\n`);
        });
    })
    .catch((err) => {
        console.error('Veritabani senkronizasyon hatasi:', err);
    });