const { Kurs, Kategori, Profil } = require('../models');
const { v4: uuidv4 } = require('uuid');

// --- YENI KURS TASLAGI OLUSTUR ---
exports.kursEkle = async (req, res) => {
    try {
        const { baslik, alt_baslik, kategori_id, dil, seviye, fiyat } = req.body;
        const egitmen_id = req.user.id;

        // 1. Temel Dogrulama
        if (!baslik || !kategori_id) {
            return res.status(400).json({ hata: 'Kurs basligi ve kategori secimi zorunludur.' });
        }

        const id = uuidv4();
        const islenmisFiyat = fiyat ? parseFloat(fiyat) : 0;

        await Kurs.create({
            id,
            egitmen_id,
            kategori_id,
            baslik,
            alt_baslik: alt_baslik || '',
            dil: dil || 'Turkce',
            seviye: seviye || 'Baslangic',
            fiyat: islenmisFiyat,
            durum: 'taslak'
        });

        console.log(`Yeni Kurs Taslagi Olusturuldu: ${baslik}`);
        res.status(201).json({ mesaj: 'Kurs taslagi basariyla olusturuldu!', kursId: id });
        
    } catch (error) {
        console.error("KURS EKLEME DETAYLI HATA:", error.message);

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({ 
                hata: 'Once profilinizi guncellemeniz gerekiyor.',
                detay: 'Kurs acabilmek icin Profilim sekmesinden Egitmen bilgilerinizi (Unvan, IBAN vb.) kaydetmelisiniz.' 
            });
        }

        res.status(500).json({ hata: 'Kurs eklenirken bir hata olustu.', detay: error.message });
    }
};

// --- EGITMENIN KENDI KURSLARINI GETIR ---
exports.getEgitmenKurslari = async (req, res) => {
    try {
        const egitmen_id = req.user.id;

        const kurslar = await Kurs.findAll({
            where: { egitmen_id },
            include: [{ model: Kategori, as: 'kategori', attributes: ['ad'] }],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        const sonuc = kurslar.map(k => {
            const plain = k.get({ plain: true });
            return {
                id: plain.id,
                baslik: plain.baslik,
                fiyat: plain.fiyat,
                durum: plain.durum,
                olusturulma_tarihi: plain.olusturulma_tarihi,
                kategori_ad: plain.kategori ? plain.kategori.ad : null
            };
        });

        res.status(200).json(sonuc);
    } catch (error) {
        console.error("Kurs listeleme hatasi:", error);
        res.status(500).json({ hata: 'Kurslariniz yuklenirken bir sorun olustu.' });
    }
};

// Tum yayindaki kurslari listele (Ogrenci icin)
exports.getAllKurslar = async (req, res) => {
    try {
        const kurslar = await Kurs.findAll({
            where: { durum: 'yayinda' },
            include: [{ model: Profil, as: 'egitmen', attributes: ['ad', 'soyad'] }],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        const sonuc = kurslar.map(k => {
            const plain = k.get({ plain: true });
            return {
                ...plain,
                egitmen_ad: plain.egitmen ? plain.egitmen.ad : null,
                egitmen_soyad: plain.egitmen ? plain.egitmen.soyad : null,
                egitmen: undefined
            };
        });

        res.status(200).json(sonuc);
    } catch (error) {
        console.error("Kurslar cekilirken hata:", error.message);
        res.status(500).json({ hata: 'Kurslar cekilemedi.' });
    }
};