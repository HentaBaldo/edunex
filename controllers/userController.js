const { Profil, EgitmenDetay, OgrenciDetay, OgrenciIlgiAlani, sequelize } = require('../models');

// --- PROFİL BİLGİLERİNİ GETİR ---
exports.getProfil = async (req, res) => {
    try {
        const userId = req.user.id;
        const rol = req.user.rol;

        // 1. Temel Profil Bilgileri
        const profil = await Profil.findByPk(userId, {
            attributes: ['ad', 'soyad', 'eposta', 'sehir', 'profil_fotografi']
        });

        if (!profil) {
            return res.status(404).json({ hata: 'Kullanıcı kaydı bulunamadı.' });
        }

        let detaylar = {};
        let ilgiAlanlari = [];

        // 2. Role Göre Detay Bilgileri
        if (rol === 'egitmen') {
            const egitmenDetay = await EgitmenDetay.findOne({
                where: { kullanici_id: userId },
                attributes: ['baslik', 'biyografi', 'unvan', 'deneyim_yili', 'iban_no']
            });
            detaylar = egitmenDetay ? egitmenDetay.get({ plain: true }) : {};
        } else {
            const ogrenciDetay = await OgrenciDetay.findOne({
                where: { kullanici_id: userId },
                attributes: ['baslik', 'biyografi', 'egitim_seviyesi']
            });
            detaylar = ogrenciDetay ? ogrenciDetay.get({ plain: true }) : {};

            const ilgiler = await OgrenciIlgiAlani.findAll({
                where: { ogrenci_id: userId },
                attributes: ['kategori_id']
            });
            ilgiAlanlari = ilgiler.map(i => i.kategori_id);
        }

        // 3. Verileri Birleştir ve Gönder
        res.status(200).json({ 
            ...profil.get({ plain: true }), 
            ...detaylar, 
            ilgiAlanlari,
            rol: rol 
        });

    } catch (error) {
        console.error("Profil Getirme Hatası:", error.message);
        res.status(500).json({ hata: 'Profil yüklenirken bir sorun oluştu.' });
    }
};

// --- PROFİLİ GÜNCELLE ---
exports.updateProfil = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user.id;
        const rol = req.user.rol;
        const data = req.body;

        // 1. Ortak Bilgiler
        await Profil.update(
            { ad: data.ad || '', soyad: data.soyad || '', sehir: data.sehir || null },
            { where: { id: userId }, transaction: t }
        );

        // 2. Rol Bazlı Detay Güncellemesi
        if (rol === 'egitmen') {
            const [detay, created] = await EgitmenDetay.findOrCreate({
                where: { kullanici_id: userId },
                defaults: {
                    kullanici_id: userId,
                    baslik: data.baslik || null,
                    biyografi: data.biyografi || null,
                    unvan: data.unvan || null,
                    deneyim_yili: data.deneyim_yili || 0,
                    iban_no: data.iban_no || null
                },
                transaction: t
            });
            if (!created) {
                await detay.update({
                    baslik: data.baslik || null,
                    biyografi: data.biyografi || null,
                    unvan: data.unvan || null,
                    deneyim_yili: data.deneyim_yili || 0,
                    iban_no: data.iban_no || null
                }, { transaction: t });
            }
        } else {
            const [detay, created] = await OgrenciDetay.findOrCreate({
                where: { kullanici_id: userId },
                defaults: {
                    kullanici_id: userId,
                    baslik: data.baslik || null,
                    biyografi: data.biyografi || null,
                    egitim_seviyesi: data.egitim_seviyesi || null
                },
                transaction: t
            });
            if (!created) {
                await detay.update({
                    baslik: data.baslik || null,
                    biyografi: data.biyografi || null,
                    egitim_seviyesi: data.egitim_seviyesi || null
                }, { transaction: t });
            }

            // Öğrenci ilgi alanları (Önce eskileri sil, sonra yenileri ekle)
            if (Array.isArray(data.ilgiAlanlari)) {
                await OgrenciIlgiAlani.destroy({ where: { ogrenci_id: userId }, transaction: t });
                for (const katId of data.ilgiAlanlari) {
                    await OgrenciIlgiAlani.create(
                        { ogrenci_id: userId, kategori_id: katId },
                        { transaction: t }
                    );
                }
            }
        }

        await t.commit();
        res.status(200).json({ mesaj: 'Profil başarıyla güncellendi!' });
        
    } catch (error) {
        await t.rollback();
        console.error("Profil Güncelleme Hatası:", error.message);
        res.status(500).json({ hata: 'Güncelleme yapılamadı. ' + error.message });
    }
};