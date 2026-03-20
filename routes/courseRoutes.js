const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Modelleri ve Middleware'leri çağırıyoruz
const { Kurs, KursBolum, Ders } = require('../models');
const courseController = require('../controllers/courseController');
const auth = require('../middleware/authMiddleware');

// === KURS ROTALARI ===
router.post('/kurslar', auth.verifyToken, auth.isEgitmen, courseController.kursEkle);
router.get('/kurslarim', auth.verifyToken, courseController.getEgitmenKurslari);
router.get('/kurslar/hepsi', courseController.getAllKurslar);

// Arkadaşının server.js içine yazdığı detay güncelleme fonksiyonu
router.put('/kurslar/:kursId/detay-guncelle', auth.verifyToken, auth.isEgitmen, async (req, res) => {
    const { kazanimlar, gereksinimler } = req.body;
    try {
        await Kurs.update(
            { kazanimlar, gereksinimler },
            { where: { id: req.params.kursId } }
        );
        res.json({ mesaj: 'Kurs detayları başarıyla güncellendi.' });
    } catch (err) {
        console.error("Detay Güncelleme Hatası:", err);
        res.status(500).json({ hata: "Veritabanı güncellenemedi." });
    }
});

// === MÜFREDAT (BÖLÜM VE DERS) ROTALARI ===

// Bölümleri Getir
router.get('/kurslar/:kursId/bolumler', auth.verifyToken, async (req, res) => {
    try {
        const bolumler = await KursBolum.findAll({
            where: { kurs_id: req.params.kursId },
            order: [['sira_numarasi', 'ASC']]
        });
        res.json(bolumler);
    } catch (err) {
        res.status(500).json({ hata: "Bölümler getirilemedi." });
    }
});

// Yeni Bölüm Ekle
router.post('/bolumler/ekle', auth.verifyToken, auth.isEgitmen, async (req, res) => {
    const { kurs_id, baslik } = req.body;
    const yeniId = uuidv4();
    try {
        const toplam = await KursBolum.count({ where: { kurs_id } });
        const yeniSira = toplam + 1;
        await KursBolum.create({ id: yeniId, kurs_id, baslik, sira_numarasi: yeniSira });
        res.json({ ok: true, mesaj: 'Bölüm sırasıyla eklendi!' });
    } catch (err) {
        res.status(500).json({ hata: err.message });
    }
});

module.exports = router;