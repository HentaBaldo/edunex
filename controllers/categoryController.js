const { Category, Course, Profile, Review, CourseEnrollment, sequelize } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { uploadFileToBunnyStorage, deleteFileFromBunnyStorage } = require('../services/bunnyService');
const discountService = require('../services/discountService');

// === SLUG HELPERS ===
const slugify = (text) => {
    if (!text) return '';
    const trMap = {
        'ç': 'c', 'ğ': 'g', 'ş': 's', 'ü': 'u', 'ı': 'i', 'ö': 'o',
        'Ç': 'C', 'Ğ': 'G', 'Ş': 'S', 'Ü': 'U', 'İ': 'I', 'Ö': 'O'
    };
    let s = String(text);
    for (const k in trMap) s = s.replace(new RegExp(k, 'g'), trMap[k]);
    return s
        .toLowerCase()
        .replace(/[^-a-zA-Z0-9\s]+/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

/**
 * Kategori kapak görselini önce BunnyCDN'e yüklemeyi dener;
 * başarısız olursa /uploads/categories/ altına lokal fallback uygular.
 *
 * @param {object} file - multer file objesi
 * @returns {Promise<string>} CDN public URL veya /uploads/... yolu
 */
const persistCoverFile = async (file) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const remoteName = `categories/${safeName}`;

    const bunnyResult = await uploadFileToBunnyStorage(file.path, remoteName);

    if (bunnyResult.success) {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (e) { /* yutuluyor */ }
        return bunnyResult.publicUrl;
    }

    // FALLBACK — Bunny erişilemezse lokal diske düş
    const targetDir = path.join(__dirname, '..', 'uploads', 'categories');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const finalPath = path.join(targetDir, safeName);
    fs.renameSync(file.path, finalPath);
    console.warn(`[CATEGORY COVER] Bunny erişilemedi (${bunnyResult.reason}), lokal fallback: ${finalPath}`);
    return `/uploads/categories/${safeName}`;
};

/**
 * Eski kapak görselini Bunny veya lokal diskten kaldırır. Hata atmaz.
 */
const removeCoverFile = async (url) => {
    if (!url) return;
    try {
        if (/^https?:\/\//i.test(url)) {
            await deleteFileFromBunnyStorage(url);
        } else if (url.startsWith('/uploads/categories/')) {
            const absOld = path.join(__dirname, '..', url.replace(/^\//, ''));
            if (fs.existsSync(absOld)) fs.unlinkSync(absOld);
        }
    } catch (e) {
        console.warn(`[CATEGORY COVER CLEANUP] ${e.message}`);
    }
};

// Multer'ın temp dosyasını sessizce siler
const cleanupTempFile = (file) => {
    try { if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (e) { /* yutuluyor */ }
};

// === PUBLIC: Front-end için kategori listesi ===
// Kapak fotoğrafı (CDN URL), açıklama ve kursların ortalama yıldızı dahil.
exports.getAllCategories = async (req, res, next) => {
    try {
        const categories = await Category.findAll({
            attributes: [
                'id', 'ad', 'slug', 'ust_kategori_id', 'kapak_fotografi', 'aciklama', 'yildiz',
                [
                    literal(`(
                        SELECT COUNT(*) FROM kurslar AS k
                        WHERE k.kategori_id = Category.id AND k.silindi_mi = false AND k.durum = 'yayinda'
                    )`),
                    'kurs_sayisi'
                ],
                [
                    literal(`(
                        SELECT COALESCE(ROUND(AVG(y.puan), 2), 0.00)
                        FROM yorumlar AS y
                        INNER JOIN kurslar AS k ON y.kurs_id = k.id
                        WHERE k.kategori_id = Category.id AND k.silindi_mi = false AND k.durum = 'yayinda'
                    )`),
                    'yildiz_ortalamasi'
                ]
            ],
            order: [['ad', 'ASC']]
        });

        const data = categories.map(k => {
            const plain = k.get({ plain: true });
            return {
                ...plain,
                kurs_sayisi: parseInt(plain.kurs_sayisi || 0, 10),
                yildiz_ortalamasi: parseFloat(plain.yildiz_ortalamasi || 0)
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Kategoriler başarıyla getirildi.',
            data
        });

    } catch (error) {
        next(error);
    }
};

// === PUBLIC: Kategori + alt kategori + kurslar ===
exports.getCategoryWithCourses = async (req, res, next) => {
    try {
        const { categoryId } = req.params;

        const kategori = await Category.findByPk(categoryId, {
            attributes: [
                'id', 'ad', 'slug', 'ust_kategori_id', 'kapak_fotografi', 'aciklama', 'yildiz',
                [
                    literal(`(
                        SELECT COALESCE(ROUND(AVG(y.puan), 2), 0.00)
                        FROM yorumlar AS y
                        INNER JOIN kurslar AS k ON y.kurs_id = k.id
                        WHERE k.kategori_id = Category.id AND k.silindi_mi = false AND k.durum = 'yayinda'
                    )`),
                    'yildiz_ortalamasi'
                ],
                [
                    literal(`(
                        SELECT COUNT(*) FROM kurslar AS k
                        WHERE k.kategori_id = Category.id AND k.silindi_mi = false AND k.durum = 'yayinda'
                    )`),
                    'kurs_sayisi'
                ],
                [
                    literal(`(
                        SELECT COUNT(*) FROM kurs_kayitlari AS ke
                        INNER JOIN kurslar AS k ON ke.kurs_id = k.id
                        WHERE k.kategori_id = Category.id AND k.silindi_mi = false AND k.durum = 'yayinda'
                    )`),
                    'toplam_ogrenci'
                ]
            ]
        });

        if (!kategori) {
            return res.status(404).json({ success: false, message: 'Kategori bulunamadı.' });
        }

        const altKategoriler = await Category.findAll({
            where: { ust_kategori_id: categoryId },
            attributes: ['id', 'ad', 'slug'],
            order: [['ad', 'ASC']]
        });

        const altKategoriIdleri = altKategoriler.map(k => k.id);
        const hedefIdler        = [categoryId, ...altKategoriIdleri];

        const kurslar = await Course.findAll({
            where: {
                kategori_id:  { [Op.in]: hedefIdler },
                durum:        'yayinda',
                silindi_mi:   false
            },
            attributes: ['id', 'baslik', 'aciklama', 'fiyat', 'kategori_id', 'olusturulma_tarihi'],
            include: [
                {
                    // INNER JOIN + WHERE: gizlilik tercihi kapali egitmenlerin
                    // kurslari kategori listelerinden tamamen cikarilir.
                    model:      Profile,
                    as:         'Egitmen',
                    attributes: ['id', 'ad', 'soyad'],
                    required:   true,
                    where: {
                        profil_herkese_acik_mi: true,
                        alinan_kurslari_goster: true,
                    },
                },
                {
                    model:    Category,
                    attributes: ['id', 'ad'],
                    required: false
                },
                {
                    model:    Review,
                    attributes: ['puan'],
                    required: false
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        // İndirim bilgisini tek sorguda iliştir
        await discountService.attachPricingToCourses(kurslar);

        const kurslarHesapli = kurslar.map(k => {
            const yorumlar    = k.Reviews || [];
            const toplamYorum = yorumlar.length;
            const ortalama    = toplamYorum > 0
                ? parseFloat((yorumlar.reduce((t, r) => t + r.puan, 0) / toplamYorum).toFixed(1))
                : 0;

            const plain = k.get({ plain: true });
            delete plain.Reviews;
            return { ...plain, istatistikler: { ortalama_puan: ortalama, toplam_yorum: toplamYorum } };
        });

        return res.json({
            success: true,
            data: {
                kategori:      kategori.get({ plain: true }),
                altKategoriler: altKategoriler.map(k => k.get({ plain: true })),
                kurslar:       kurslarHesapli,
                toplam_kurs:   kurslarHesapli.length
            }
        });

    } catch (error) {
        next(error);
    }
};

// === ADMIN: Tüm kategorileri istatistiklerle getir ===
exports.getAllCategoriesAdmin = async (req, res, next) => {
    try {
        const kategoriler = await Category.findAll({
            attributes: [
                'id', 'ad', 'slug', 'ust_kategori_id', 'kapak_fotografi', 'aciklama', 'yildiz',
                [
                    literal(`(
                        SELECT COUNT(*) FROM kurslar AS k
                        WHERE k.kategori_id = Category.id AND k.silindi_mi = false
                    )`),
                    'kurs_sayisi'
                ],
                [
                    literal(`(
                        SELECT COUNT(*) FROM kurs_kayitlari AS ke
                        INNER JOIN kurslar AS k ON ke.kurs_id = k.id
                        WHERE k.kategori_id = Category.id AND k.silindi_mi = false
                    )`),
                    'toplam_ogrenci'
                ],
                [
                    literal(`(
                        SELECT COALESCE(ROUND(AVG(y.puan), 2), 0.00)
                        FROM yorumlar AS y
                        INNER JOIN kurslar AS k ON y.kurs_id = k.id
                        WHERE k.kategori_id = Category.id AND k.silindi_mi = false
                    )`),
                    'yildiz_ortalamasi'
                ]
            ],
            order: [['ad', 'ASC']]
        });

        const data = kategoriler.map(k => {
            const plain = k.get({ plain: true });
            return {
                ...plain,
                kurs_sayisi: parseInt(plain.kurs_sayisi || 0, 10),
                toplam_ogrenci: parseInt(plain.toplam_ogrenci || 0, 10),
                yildiz_ortalamasi: parseFloat(plain.yildiz_ortalamasi || 0).toFixed(2)
            };
        });

        return res.status(200).json({
            success: true,
            message: 'Kategori listesi başarıyla getirildi.',
            data
        });
    } catch (error) {
        next(error);
    }
};

// === ADMIN: Kategori oluştur ===
exports.createCategory = async (req, res, next) => {
    try {
        const { ad, aciklama, ust_kategori_id } = req.body;

        if (!ad || ad.trim().length < 2) {
            cleanupTempFile(req.file);
            return res.status(400).json({ success: false, message: 'Kategori adı en az 2 karakter olmalıdır.' });
        }

        const baseSlug = slugify(ad);
        if (!baseSlug) {
            cleanupTempFile(req.file);
            return res.status(400).json({ success: false, message: 'Kategori adından geçerli bir slug üretilemedi.' });
        }

        // Slug çakışması kontrolü (gerekirse -1, -2 ekle)
        let slug = baseSlug;
        let counter = 1;
        while (await Category.findOne({ where: { slug } })) {
            slug = `${baseSlug}-${counter++}`;
            if (counter > 50) break;
        }

        let kapak_fotografi = null;
        if (req.file) {
            kapak_fotografi = await persistCoverFile(req.file);
        }

        const yeni = await Category.create({
            ad: ad.trim(),
            slug,
            aciklama: aciklama ? aciklama.trim() : null,
            ust_kategori_id: ust_kategori_id || null,
            kapak_fotografi,
            yildiz: 0.00
        });

        return res.status(201).json({
            success: true,
            message: 'Kategori başarıyla oluşturuldu.',
            data: yeni
        });
    } catch (error) {
        cleanupTempFile(req.file);
        next(error);
    }
};

// === ADMIN: Kategori güncelle ===
exports.updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { ad, aciklama, ust_kategori_id } = req.body;

        const kategori = await Category.findByPk(id);
        if (!kategori) {
            cleanupTempFile(req.file);
            return res.status(404).json({ success: false, message: 'Kategori bulunamadı.' });
        }

        const updates = {};

        if (ad && ad.trim().length >= 2 && ad.trim() !== kategori.ad) {
            updates.ad = ad.trim();
            // Ad değişince slug'ı yeniden üret
            const baseSlug = slugify(ad);
            let slug = baseSlug;
            let counter = 1;
            while (await Category.findOne({ where: { slug, id: { [Op.ne]: id } } })) {
                slug = `${baseSlug}-${counter++}`;
                if (counter > 50) break;
            }
            updates.slug = slug;
        }

        if (typeof aciklama !== 'undefined') {
            updates.aciklama = aciklama ? String(aciklama).trim() : null;
        }

        if (typeof ust_kategori_id !== 'undefined') {
            // Kendi kendinin üst kategorisi olmasını engelle
            if (ust_kategori_id && ust_kategori_id === id) {
                cleanupTempFile(req.file);
                return res.status(400).json({ success: false, message: 'Bir kategori kendi üst kategorisi olamaz.' });
            }
            updates.ust_kategori_id = ust_kategori_id || null;
        }

        let oldCover = null;
        if (req.file) {
            oldCover = kategori.kapak_fotografi;
            updates.kapak_fotografi = await persistCoverFile(req.file);
        }

        await kategori.update(updates);

        // Eski kapağı CDN'den veya yerel diskten arka planda sil
        if (oldCover) {
            removeCoverFile(oldCover);
        }

        return res.status(200).json({
            success: true,
            message: 'Kategori başarıyla güncellendi.',
            data: kategori
        });
    } catch (error) {
        cleanupTempFile(req.file);
        next(error);
    }
};

// === ADMIN: Kategori sil ===
exports.deleteCategory = async (req, res, next) => {
    try {
        const { id } = req.params;

        const kategori = await Category.findByPk(id);
        if (!kategori) {
            return res.status(404).json({ success: false, message: 'Kategori bulunamadı.' });
        }

        // Aktif kurs var mı?
        const kursSayisi = await Course.count({
            where: { kategori_id: id, silindi_mi: false }
        });

        if (kursSayisi > 0) {
            return res.status(400).json({
                success: false,
                message: `Bu kategoriye bağlı ${kursSayisi} kurs var, önce onları taşıyın.`
            });
        }

        // Alt kategori varsa engelle
        const altSayisi = await Category.count({ where: { ust_kategori_id: id } });
        if (altSayisi > 0) {
            return res.status(400).json({
                success: false,
                message: `Bu kategorinin ${altSayisi} alt kategorisi var, önce onları taşıyın veya silin.`
            });
        }

        const oldCover = kategori.kapak_fotografi;

        await kategori.destroy();

        if (oldCover) {
            removeCoverFile(oldCover);
        }

        return res.status(200).json({
            success: true,
            message: 'Kategori başarıyla silindi.'
        });
    } catch (error) {
        next(error);
    }
};
