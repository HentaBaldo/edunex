const { Profil } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// --- KAYIT OLMA ---
exports.register = async (req, res) => {
    try {
        const { ad, soyad, eposta, sifre, rol } = req.body;

        // 1. Gelen veri kontrolu (Undefined hatasini engellemek icin)
        if (!ad || !soyad || !eposta || !sifre || !rol) {
            return res.status(400).json({ hata: 'Lutfen tum zorunlu alanlari doldurun.' });
        }

        // 2. Kullanici zaten var mi?
        const existing = await Profil.findOne({ where: { eposta } });
        if (existing) {
            return res.status(400).json({ hata: 'Bu e-posta adresi zaten kayitli.' });
        }

        // 3. Sifreyi Hashle
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(sifre, salt);
        const userId = uuidv4();

        // 4. Veritabanina Ekle
        await Profil.create({
            id: userId,
            ad,
            soyad,
            eposta,
            sifre: hashedPassword,
            rol,
            sehir: ''
        });

        console.log(`Yeni kullanici kaydedildi: ${eposta}`);
        res.status(201).json({ mesaj: 'Kayit basariyla tamamlandi!' });

    } catch (error) {
        console.error("Kayit Hatasi:", error);
        res.status(500).json({ hata: 'Sunucu hatasi: ' + error.message });
    }
};

// --- GIRIS YAPMA ---
exports.login = async (req, res) => {
    try {
        const { eposta, sifre } = req.body;

        // 1. Kullaniciyi getir
        const user = await Profil.findOne({ where: { eposta } });

        if (!user) {
            console.log(`Kullanici bulunamadi: ${eposta}`);
            return res.status(401).json({ hata: 'E-posta veya sifre hatali.' });
        }

        // 2. Sifreyi Karsilastir
        const match = await bcrypt.compare(sifre, user.sifre);

        if (!match) {
            console.log(`Sifre eslesmedi: ${eposta}`);
            return res.status(401).json({ hata: 'E-posta veya sifre hatali.' });
        }

        // 3. Token Olustur
        const token = jwt.sign(
            { id: user.id, rol: user.rol },
            process.env.JWT_SECRET || 'gizli_anahtar_buraya',
            { expiresIn: '24h' }
        );

        console.log(`Giris Basarili: ${user.ad} ${user.soyad} (${user.rol})`);

        // 4. Yanit Gonder
        res.status(200).json({
            token,
            kullaniciAdSoyad: `${user.ad} ${user.soyad}`,
            rol: user.rol,
            mesaj: 'Hos geldiniz!'
        });

    } catch (error) {
        console.error("Giris Hatasi:", error);
        res.status(500).json({ hata: 'Giris yapilirken bir hata olustu.' });
    }
};