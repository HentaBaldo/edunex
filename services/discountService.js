/**
 * Discount Service
 * --------------------------------------------------------------
 * Bir kurs icin aktif indirimleri toplayip net fiyati hesaplar.
 *
 * KURALLAR:
 * - Hem 'egitmen' hem 'platform' indirimi varsa ikisi additive (toplanarak)
 *   uygulanir. Ornek: egitmen %20 + platform %15 -> ogrenci %35 indirimli gorur.
 * - Yuzde ve sabit_indirim ayni anda olabilir: once sabit dusulur, sonra yuzde.
 * - Cap: maksimum toplam indirim %95 (fiyat 0'a inmesin).
 * - Min fiyat: orijinal fiyatin %5'i (cok dussuk fiyatlari engelle).
 * - "Aktif" demek: aktif_mi=true VE simdiki zaman baslangic-bitis araliginda.
 */

const { Op } = require('sequelize');
const { Discount } = require('../models');

const MIN_PRICE_RATIO = 0.05; // orijinal fiyatin en az %5'i
const MAX_TOTAL_DISCOUNT_PCT = 95;

/**
 * Su an aktif olan indirimleri doner.
 * - ders_id = kursun id'si OLAN (kursa ozel)
 * - VEYA ders_id = NULL (tum dersler icin global)
 *
 * @param {string} dersId - kurs UUID'si
 * @returns {Promise<Discount[]>}
 */
const getActiveDiscountsForCourse = async (dersId) => {
  if (!dersId) return [];
  const now = new Date();

  const rows = await Discount.findAll({
    where: {
      aktif_mi: true,
      [Op.or]: [
        { ders_id: dersId },
        { ders_id: null },
      ],
      [Op.and]: [
        { [Op.or]: [{ baslangic: null }, { baslangic: { [Op.lte]: now } }] },
        { [Op.or]: [{ bitis: null }, { bitis: { [Op.gte]: now } }] },
      ],
    },
    order: [['olusturulma_tarihi', 'DESC']],
  });

  return rows;
};

/**
 * Bir kursa uygulanacak indirimleri yan yana toplar:
 *   - Eğitmen tarafi: butun 'egitmen' indirimlerinin toplami
 *   - Platform tarafi: butun 'platform' indirimlerinin toplami
 * (Pratikte her kurs icin tek bir aktif indirim olur; ama coklu kayit destekli.)
 *
 * @param {Discount[]} discounts
 * @returns {{ egitmenYuzde:number, egitmenSabit:number, platformYuzde:number, platformSabit:number }}
 */
const aggregateDiscounts = (discounts) => {
  const agg = { egitmenYuzde: 0, egitmenSabit: 0, platformYuzde: 0, platformSabit: 0 };
  for (const d of discounts) {
    const yuzde = parseInt(d.yuzde_indirim || 0, 10) || 0;
    const sabit = parseFloat(d.sabit_indirim || 0) || 0;
    if (d.finansman_tarafi === 'platform') {
      agg.platformYuzde += yuzde;
      agg.platformSabit += sabit;
    } else {
      agg.egitmenYuzde += yuzde;
      agg.egitmenSabit += sabit;
    }
  }
  return agg;
};

/**
 * Toplam yuzde indirimini doner (cap %95).
 */
const totalPercent = (agg) => Math.min(agg.egitmenYuzde + agg.platformYuzde, MAX_TOTAL_DISCOUNT_PCT);

/**
 * Toplam sabit indirimi doner.
 */
const totalFixed = (agg) => agg.egitmenSabit + agg.platformSabit;

/**
 * Indirim listesinden net fiyati hesaplar.
 * Sira: once sabit indirim dusulur, sonra yuzde uygulanir, sonra min cap.
 *
 * @param {number} originalPrice
 * @param {Discount[]} discounts
 * @returns {number} net fiyat (2 ondalik)
 */
const calculateNetPrice = (originalPrice, discounts) => {
  const price = parseFloat(originalPrice) || 0;
  if (price <= 0 || !discounts || discounts.length === 0) {
    return Math.round(price * 100) / 100;
  }

  const agg = aggregateDiscounts(discounts);
  const fixed = totalFixed(agg);
  const pct = totalPercent(agg);

  let net = price - fixed;
  if (net < 0) net = 0;
  net = net * (1 - pct / 100);

  const minPrice = price * MIN_PRICE_RATIO;
  if (net < minPrice) net = minPrice;

  return Math.round(net * 100) / 100;
};

/**
 * Bir kurs icin ozetlenmis indirim/fiyat bilgisini doner.
 * Frontend bunu doğrudan render edebilir.
 *
 * @param {{ id:string, fiyat:number }} course
 * @returns {Promise<{
 *   originalFiyat:number,
 *   netFiyat:number,
 *   indirimVar:boolean,
 *   toplamYuzde:number,
 *   egitmenYuzde:number,
 *   platformYuzde:number,
 *   etiketler:string[],
 *   discounts:Discount[]
 * }>}
 */
const getCoursePricing = async (course) => {
  if (!course || !course.id) {
    return {
      originalFiyat: 0, netFiyat: 0, indirimVar: false,
      toplamYuzde: 0, egitmenYuzde: 0, platformYuzde: 0,
      etiketler: [], discounts: [],
    };
  }

  const original = parseFloat(course.fiyat) || 0;
  const discounts = await getActiveDiscountsForCourse(course.id);
  const net = calculateNetPrice(original, discounts);
  const agg = aggregateDiscounts(discounts);
  const tPct = totalPercent(agg);

  // Pretty etiketler (UI rozetleri icin)
  const etiketler = [];
  if (agg.egitmenYuzde > 0) etiketler.push(`%${agg.egitmenYuzde} Eğitmen İndirimi`);
  if (agg.platformYuzde > 0) etiketler.push(`%${agg.platformYuzde} EduNex Kampanyası`);
  if (agg.egitmenSabit > 0) etiketler.push(`₺${agg.egitmenSabit} Eğitmen İndirimi`);
  if (agg.platformSabit > 0) etiketler.push(`₺${agg.platformSabit} EduNex Kampanyası`);

  return {
    originalFiyat: Math.round(original * 100) / 100,
    netFiyat: net,
    indirimVar: discounts.length > 0 && net < original,
    toplamYuzde: tPct,
    egitmenYuzde: agg.egitmenYuzde,
    platformYuzde: agg.platformYuzde,
    etiketler,
    discounts,
  };
};

/**
 * Iyzico'ya gonderilecek net fiyati doner (kurs.fiyat yerine kullanilir).
 * Bu fonksiyon paymentController icinde tek satirlik degisikligi temsil eder.
 */
const getEffectivePrice = async (course) => {
  const pricing = await getCoursePricing(course);
  return pricing.netFiyat;
};

module.exports = {
  getActiveDiscountsForCourse,
  calculateNetPrice,
  getCoursePricing,
  getEffectivePrice,
};
