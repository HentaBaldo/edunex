/**
 * EduNex Notification Service
 *
 * Tum bildirim olusturma noktalari icin tek giris noktasi.
 * Cagiran controller'lar bu servisi await ile cagirir ancak HER ZAMAN try/catch
 * icinde olmalidir: bildirim hatasi asil isi (odeme, kurs olusturma vb.) bozmamali.
 *
 * Notification modelimizdeki kolonlar Turkce: baslik, icerik, hedef_url, tip, kaynak_id.
 * Dis API'da daha okunakli alanlar kullanildi (mesaj, baglanti_linki) ve burada map'lenir.
 *
 * Tip enum'u (Notification.js):
 *   'yeni_kurs' | 'canli_yayin' | 'sistem' | 'satis' | 'yorum' | 'takip'
 */

const { Notification } = require('../models');

// Modelimizdeki ENUM ile birebir tutarli olmalidir.
// Buraya yeni tip eklemeden once Notification.js'deki ENUM'i ve migrations/ altindaki
// ALTER TABLE komutunu (veya app.js boot backfill'ini) guncellemeyi unutmayin.
const ALLOWED_TIPS = new Set([
    'yeni_kurs',
    'canli_yayin',
    'sistem',
    'satis',
    'yorum',
    'takip',
]);

/**
 * Hatayi ayrintili logla. Sequelize hatalarinda original.code ve sql parcasini da yakaliyoruz
 * (ENUM ihlali, FK ihlali gibi tipik durumlar terminalden gorulebilsin diye).
 */
function logNotifyError(op, error, ctx = {}) {
    console.error(`BİLDİRİM KAYIT HATASI: [NOTIFY ERROR] ${op}`, {
        ...ctx,
        name: error?.name,
        message: error?.message,
        original_code: error?.original?.code,
        original_message: error?.original?.sqlMessage || error?.original?.message,
        sql: error?.sql?.slice?.(0, 300),
    });
}

/**
 * Tek kullaniciya bildirim olusturur.
 *
 * @param {Object} params
 * @param {string} params.kullanici_id    - Hedef kullanicinin UUID'si (zorunlu)
 * @param {string} params.baslik          - Bildirim basligi (zorunlu, max 255 char)
 * @param {string} [params.mesaj]         - Bildirim govdesi (Notification.icerik kolonuna yazilir)
 * @param {string} [params.tip]           - Bildirim tipi: ENUM disindaysa 'sistem'e dusulur
 * @param {string} [params.baglanti_linki]- Tiklayinca yonlenecek URL (Notification.hedef_url)
 * @param {string} [params.kaynak_id]     - Kaynak domain nesnenin UUID'si (LiveSession.id, Order.id vb.)
 * @returns {Promise<Notification|null>}  - Olusan kayit; hata olursa null (non-blocking icin)
 */
exports.sendNotification = async ({ kullanici_id, baslik, mesaj, tip, baglanti_linki, kaynak_id } = {}) => {
    try {
        if (!kullanici_id || !baslik) {
            console.warn('[NOTIFY] sendNotification: kullanici_id veya baslik eksik, atlandi.', {
                kullanici_id: !!kullanici_id, baslik: !!baslik,
            });
            return null;
        }

        if (tip && !ALLOWED_TIPS.has(tip)) {
            console.warn(`[NOTIFY] Bilinmeyen tip "${tip}" -> 'sistem'e dusuruldu. ENUM'u guncellemek isteyebilirsiniz.`);
        }
        const guvenliTip = ALLOWED_TIPS.has(tip) ? tip : 'sistem';

        return await Notification.create({
            kullanici_id,
            baslik: String(baslik).slice(0, 255),
            icerik: mesaj ? String(mesaj).slice(0, 1000) : null,
            tip: guvenliTip,
            hedef_url: baglanti_linki ? String(baglanti_linki).slice(0, 500) : null,
            kaynak_id: kaynak_id || null,
            okundu_mu: false,
        });
    } catch (error) {
        // Hatayi YUTMUYORUZ — terminalde tam detay basariz. Cagiran tarafa atmiyoruz
        // cunki bildirim NON-BLOCKING; asil isin (odeme/yorum/takip) durmasini istemiyoruz.
        logNotifyError('sendNotification', error, { kullanici_id, tip });
        return null;
    }
};

/**
 * Birden cok kullaniciya ayni payload ile bildirim atar (bulkCreate).
 *
 * - Listeyi tekillestirir.
 * - Bos liste durumunda no-op.
 * - bulkCreate hatasi cagriya yansimaz; sadece detayli loglanir.
 *
 * @param {string[]} kullaniciIdListesi - Hedef UUID listesi
 * @param {Object}   payload            - { baslik, mesaj?, tip?, baglanti_linki?, kaynak_id? }
 * @returns {Promise<{ created: number }>}
 */
exports.notifyMultipleUsers = async (kullaniciIdListesi = [], payload = {}) => {
    try {
        const liste = Array.isArray(kullaniciIdListesi) ? kullaniciIdListesi.filter(Boolean) : [];
        const unique = [...new Set(liste)];
        if (unique.length === 0 || !payload?.baslik) {
            return { created: 0 };
        }

        if (payload.tip && !ALLOWED_TIPS.has(payload.tip)) {
            console.warn(`[NOTIFY] notifyMultipleUsers: bilinmeyen tip "${payload.tip}" -> 'sistem'e dusuruldu.`);
        }
        const guvenliTip = ALLOWED_TIPS.has(payload.tip) ? payload.tip : 'sistem';

        const kayitlar = unique.map(uid => ({
            kullanici_id: uid,
            baslik: String(payload.baslik).slice(0, 255),
            icerik: payload.mesaj ? String(payload.mesaj).slice(0, 1000) : null,
            tip: guvenliTip,
            hedef_url: payload.baglanti_linki ? String(payload.baglanti_linki).slice(0, 500) : null,
            kaynak_id: payload.kaynak_id || null,
            okundu_mu: false,
        }));

        const created = await Notification.bulkCreate(kayitlar);
        console.log(`[NOTIFY] notifyMultipleUsers: ${created.length} bildirim olusturuldu (tip=${guvenliTip}).`);
        return { created: created.length };
    } catch (error) {
        logNotifyError('notifyMultipleUsers', error, {
            count: kullaniciIdListesi?.length || 0,
            tip: payload?.tip,
        });
        return { created: 0 };
    }
};
