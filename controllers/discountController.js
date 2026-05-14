/**
 * Discount Controller
 *
 * Yetki kurallari:
 *   - Egitmen: sadece KENDI kursuna 'egitmen' finansman tarafli indirim yapar.
 *   - Admin:   her kursa veya tum derslere (ders_id=NULL) 'platform' (veya 'egitmen')
 *              finansman tarafli indirim yapar.
 *
 * Validation:
 *   - yuzde_indirim VEYA sabit_indirim'den en az biri dolu olmali.
 *   - yuzde_indirim 1-99 araliginda olmali.
 *   - sabit_indirim > 0 olmali.
 *   - bitis > baslangic (ikisi de doluysa).
 *   - baslik 3-120 karakter.
 */

const { Op } = require('sequelize');
const { Discount, Course, InstructorDetail } = require('../models');
const discountService = require('../services/discountService');

const validatePayload = (body) => {
  const yuzde = body?.yuzde_indirim != null ? parseInt(body.yuzde_indirim, 10) : null;
  const sabit = body?.sabit_indirim != null ? parseFloat(body.sabit_indirim) : null;
  const baslik = String(body?.baslik || '').trim();

  if (!yuzde && !sabit) return 'Yuzde veya sabit indirim degerlerinden en az biri girilmelidir.';
  if (yuzde != null && (isNaN(yuzde) || yuzde < 1 || yuzde > 99)) return 'Yuzde indirim 1-99 araliginda olmalidir.';
  if (sabit != null && (isNaN(sabit) || sabit <= 0)) return 'Sabit indirim pozitif olmalidir.';
  if (baslik.length < 3 || baslik.length > 120) return 'Baslik 3-120 karakter olmalidir.';

  const baslangic = body?.baslangic ? new Date(body.baslangic) : null;
  const bitis = body?.bitis ? new Date(body.bitis) : null;
  if (baslangic && isNaN(baslangic.getTime())) return 'Baslangic tarihi gecersiz.';
  if (bitis && isNaN(bitis.getTime())) return 'Bitis tarihi gecersiz.';
  if (baslangic && bitis && bitis <= baslangic) return 'Bitis tarihi baslangictan sonra olmalidir.';

  return null;
};

const findInstructorIdByUser = async (userId) => {
  const inst = await InstructorDetail.findOne({ where: { kullanici_id: userId }, attributes: ['kullanici_id'] });
  return inst?.kullanici_id || null;
};

/**
 * POST /api/discounts
 * Body: { ders_id, yuzde_indirim?, sabit_indirim?, finansman_tarafi?, baslik, aciklama?, baslangic?, bitis?, aktif_mi? }
 */
exports.createDiscount = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;
    if (!userId) return res.status(401).json({ success: false, message: 'Oturum bulunamadi.' });

    const err = validatePayload(req.body);
    if (err) return res.status(400).json({ success: false, message: err });

    let dersId = req.body?.ders_id || null;
    let finansman = req.body?.finansman_tarafi || (userRole === 'admin' ? 'platform' : 'egitmen');

    // Yetki kontrolu
    if (userRole === 'egitmen') {
      // Egitmen: ders_id verilmeli + kendi kursu olmali + finansman='egitmen'
      if (!dersId) return res.status(400).json({ success: false, message: 'Ders secimi zorunludur.' });
      const course = await Course.findByPk(dersId, { attributes: ['id', 'egitmen_id'] });
      if (!course) return res.status(404).json({ success: false, message: 'Ders bulunamadi.' });

      const instId = await findInstructorIdByUser(userId);
      if (!instId || course.egitmen_id !== instId) {
        return res.status(403).json({ success: false, message: 'Bu derse indirim ekleme yetkiniz yok.' });
      }
      finansman = 'egitmen'; // egitmen 'platform' yapamaz
    } else if (userRole === 'admin') {
      // Admin: ders_id NULL olabilir (tum dersler)
      if (dersId) {
        const exists = await Course.findByPk(dersId, { attributes: ['id'] });
        if (!exists) return res.status(404).json({ success: false, message: 'Ders bulunamadi.' });
      }
      if (!['egitmen', 'platform'].includes(finansman)) finansman = 'platform';
    } else {
      return res.status(403).json({ success: false, message: 'Yetkisiz.' });
    }

    const created = await Discount.create({
      ders_id: dersId,
      yuzde_indirim: req.body?.yuzde_indirim || null,
      sabit_indirim: req.body?.sabit_indirim || null,
      finansman_tarafi: finansman,
      baslik: String(req.body.baslik).trim(),
      aciklama: req.body?.aciklama ? String(req.body.aciklama).trim() : null,
      baslangic: req.body?.baslangic || null,
      bitis: req.body?.bitis || null,
      aktif_mi: req.body?.aktif_mi !== false,
      olusturan_id: userId,
      olusturan_rol: userRole === 'admin' ? 'admin' : 'egitmen',
    });

    return res.status(201).json({ success: true, message: 'Indirim olusturuldu.', data: created });
  } catch (e) {
    console.error('[DISCOUNT] createDiscount hatasi:', e.message);
    next(e);
  }
};

/**
 * PATCH /api/discounts/:id
 * Sadece olusturan kullanici (egitmen kendi kaydini, admin her kaydi) duzenleyebilir.
 */
exports.updateDiscount = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;
    if (!userId) return res.status(401).json({ success: false, message: 'Oturum bulunamadi.' });

    const rec = await Discount.findByPk(req.params.id);
    if (!rec) return res.status(404).json({ success: false, message: 'Indirim bulunamadi.' });

    if (userRole !== 'admin' && rec.olusturan_id !== userId) {
      return res.status(403).json({ success: false, message: 'Bu indirimi duzenleme yetkiniz yok.' });
    }

    const err = validatePayload({ ...rec.toJSON(), ...req.body });
    if (err) return res.status(400).json({ success: false, message: err });

    // Egitmen finansman_tarafi'ni degistiremez
    const updates = {
      yuzde_indirim: req.body?.yuzde_indirim ?? rec.yuzde_indirim,
      sabit_indirim: req.body?.sabit_indirim ?? rec.sabit_indirim,
      baslik: req.body?.baslik != null ? String(req.body.baslik).trim() : rec.baslik,
      aciklama: req.body?.aciklama != null ? String(req.body.aciklama).trim() : rec.aciklama,
      baslangic: req.body?.baslangic !== undefined ? req.body.baslangic : rec.baslangic,
      bitis: req.body?.bitis !== undefined ? req.body.bitis : rec.bitis,
      aktif_mi: req.body?.aktif_mi !== undefined ? !!req.body.aktif_mi : rec.aktif_mi,
    };
    if (userRole === 'admin' && req.body?.finansman_tarafi) {
      if (['egitmen', 'platform'].includes(req.body.finansman_tarafi)) {
        updates.finansman_tarafi = req.body.finansman_tarafi;
      }
    }

    await rec.update(updates);
    return res.status(200).json({ success: true, message: 'Indirim guncellendi.', data: rec });
  } catch (e) {
    console.error('[DISCOUNT] updateDiscount hatasi:', e.message);
    next(e);
  }
};

/**
 * DELETE /api/discounts/:id
 */
exports.deleteDiscount = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;
    if (!userId) return res.status(401).json({ success: false, message: 'Oturum bulunamadi.' });

    const rec = await Discount.findByPk(req.params.id);
    if (!rec) return res.status(404).json({ success: false, message: 'Indirim bulunamadi.' });

    if (userRole !== 'admin' && rec.olusturan_id !== userId) {
      return res.status(403).json({ success: false, message: 'Bu indirimi silme yetkiniz yok.' });
    }

    await rec.destroy();
    return res.status(200).json({ success: true, message: 'Indirim silindi.' });
  } catch (e) {
    console.error('[DISCOUNT] deleteDiscount hatasi:', e.message);
    next(e);
  }
};

/**
 * GET /api/discounts/course/:dersId
 * Bir kurs icin AKTIF indirim ozeti (public — login gerekmez).
 */
exports.getDiscountForCourse = async (req, res, next) => {
  try {
    const dersId = req.params.dersId;
    const course = await Course.findByPk(dersId, { attributes: ['id', 'fiyat'] });
    if (!course) return res.status(404).json({ success: false, message: 'Ders bulunamadi.' });

    const pricing = await discountService.getCoursePricing(course);
    return res.status(200).json({ success: true, data: pricing });
  } catch (e) {
    console.error('[DISCOUNT] getDiscountForCourse hatasi:', e.message);
    next(e);
  }
};

/**
 * GET /api/discounts/my
 * Egitmen: kendi olusturdugu indirimler (kurs adlariyla)
 */
exports.getMyDiscounts = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;
    if (!userId) return res.status(401).json({ success: false, message: 'Oturum bulunamadi.' });

    const where = userRole === 'admin' ? {} : { olusturan_id: userId };

    const rows = await Discount.findAll({
      where,
      include: [{ model: Course, attributes: ['id', 'baslik', 'fiyat'], required: false }],
      order: [['olusturulma_tarihi', 'DESC']],
      limit: 200,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (e) {
    console.error('[DISCOUNT] getMyDiscounts hatasi:', e.message);
    next(e);
  }
};

/**
 * GET /api/discounts/instructor/:courseId
 * Egitmen edit-course panelinde kursa ait indirimleri gormek icin.
 */
exports.getDiscountsByCourse = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;
    if (!userId) return res.status(401).json({ success: false, message: 'Oturum bulunamadi.' });

    const dersId = req.params.courseId;
    const course = await Course.findByPk(dersId, { attributes: ['id', 'egitmen_id'] });
    if (!course) return res.status(404).json({ success: false, message: 'Ders bulunamadi.' });

    if (userRole !== 'admin') {
      const instId = await findInstructorIdByUser(userId);
      if (!instId || course.egitmen_id !== instId) {
        return res.status(403).json({ success: false, message: 'Yetkisiz.' });
      }
    }

    const rows = await Discount.findAll({
      where: {
        [Op.or]: [
          { ders_id: dersId },
          { ders_id: null }, // global kampanyalar da gozuksun
        ],
      },
      order: [['olusturulma_tarihi', 'DESC']],
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (e) {
    console.error('[DISCOUNT] getDiscountsByCourse hatasi:', e.message);
    next(e);
  }
};

/**
 * GET /api/discounts/admin/all
 * Admin: tum indirimler (filter destekli).
 */
exports.adminGetAll = async (req, res, next) => {
  try {
    const userRole = req.user?.rol;
    if (userRole !== 'admin') return res.status(403).json({ success: false, message: 'Yetkisiz.' });

    const where = {};
    if (req.query.finansman) where.finansman_tarafi = req.query.finansman;
    if (req.query.aktif) where.aktif_mi = req.query.aktif === 'true';
    if (req.query.global === 'true') where.ders_id = null;

    const rows = await Discount.findAll({
      where,
      include: [{ model: Course, attributes: ['id', 'baslik', 'fiyat'], required: false }],
      order: [['olusturulma_tarihi', 'DESC']],
      limit: 500,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (e) {
    console.error('[DISCOUNT] adminGetAll hatasi:', e.message);
    next(e);
  }
};
