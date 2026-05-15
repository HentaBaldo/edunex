/**
 * EduNex - Sipariş Dekontu (Receipt) Controller
 *
 * Endpoint: GET /api/receipts/download/:orderId
 *
 * Yetkilendirme matrisi (verifyToken sonrası req.user.rol kontrol edilir):
 *
 *   admin   -> Müşteri tipi 'Sipariş Dekontu' indirir (tüm kalemler).
 *   ogrenci -> Yalnızca kendi siparişinin müşteri dekontunu indirir.
 *   egitmen -> Pazaryeri 'Hak Ediş Dekontu' indirir; siparişte birden fazla
 *              eğitmenin kursu varsa SADECE kendi kalemleri PDF'e dahil edilir.
 *              Müşteri bilgisi KVKK gereği PDF içinde maskelenir.
 *
 * Mimari notlar
 *  - Müşteri ve eğitmen dekontu iki ayrı PDF şablonudur (services/pdfService.js).
 *    Aynı endpoint üzerinden ayrım, controller'da rol bazlı yapılır — frontend
 *    URL'leri değişmez, böylece ReceiptDownloader modülü tek bir bağlantı bilir.
 *  - Eğitmen akışında ek olarak InstructorEarning satırları join edilir; finansal
 *    döküm (brüt, platform kesintisi, net) buradan beslenir.
 */

const { Op } = require('sequelize');
const {
    Order,
    OrderItem,
    Course,
    Profile,
    PaymentTransaction,
    InstructorEarning,
    InstructorDetail,
} = require('../models');
const { streamOrderReceiptPdf, streamInstructorPayoutPdf } = require('../services/pdfService');

// ────────────────────────── Yardımcılar ──────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RFC 6266 uyumlu, ASCII-güvenli dosya adı. UTF-8 variant da eklenir.
 */
function _buildContentDisposition(orderId, kind) {
    const safeId = String(orderId || 'siparis').replace(/[^a-zA-Z0-9_-]/g, '');
    const prefix = kind === 'instructor-payout' ? 'EduNex_HakEdis' : 'EduNex_Dekont';
    const ascii = `${prefix}_${safeId}.pdf`;
    const utf8  = encodeURIComponent(`${prefix}_${safeId}.pdf`);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

function _loadOrderWithRelations(orderId) {
    return Order.findByPk(orderId, {
        include: [
            {
                model: Profile,
                attributes: ['id', 'ad', 'soyad', 'eposta'],
                required: false,
            },
            {
                model: OrderItem,
                include: [{
                    model: Course,
                    attributes: ['id', 'baslik', 'egitmen_id'],
                }],
            },
            {
                model: PaymentTransaction,
                separate: true,
                order: [['olusturulma_tarihi', 'ASC']],
            },
        ],
    });
}

// ────────────────────────── Müşteri (Ogrenci/Admin) Akışı ───────

/**
 * Müşteri dekontu için eğitmen-bağımsız ham kopya.
 * Şu an admin için bütün siparişi gönderiyoruz; öğrenci için zaten kendi siparişi.
 */
function _payloadForCustomer(order) {
    return order; // Sequelize instance — pdfService onu olduğu gibi okur
}

// ────────────────────────── Eğitmen Akışı ───────────────────────

/**
 * Eğitmenin yalnızca KENDİ kurs kalemleriyle filtrelenmiş sipariş kopyası.
 */
function _filterOrderForInstructor(order, instructorId) {
    const myItems = (order.OrderItems || []).filter(
        (it) => it.Course && it.Course.egitmen_id === instructorId
    );
    const filteredTotal = myItems.reduce(
        (sum, it) => sum + Number(it.odenen_fiyat || 0),
        0
    );
    return {
        id: order.id,
        kullanici_id: order.kullanici_id,
        olusturulma_tarihi: order.olusturulma_tarihi,
        durum: order.durum,
        saglayici: order.saglayici,
        para_birimi: order.para_birimi,
        islem_id: order.islem_id,
        conversation_id: order.conversation_id,
        toplam_tutar: filteredTotal,
        Profile: order.Profile,
        OrderItems: myItems,
        PaymentTransactions: order.PaymentTransactions,
    };
}

/**
 * Bu eğitmene ait sipariş kalemlerinin earning kayıtlarını çeker.
 * Hak ediş henüz oluşturulmamış olabilir (pending değil — hiç yok); o durumda
 * pdfService brut'a göre tahmini bir görsel çıkarır ve durum 'Hesaplanıyor' kalır.
 */
async function _fetchEarningsForItems(itemIds) {
    if (!itemIds || itemIds.length === 0) return [];
    return InstructorEarning.findAll({
        where: { siparis_kalemi_id: { [Op.in]: itemIds } },
        attributes: [
            'id', 'siparis_kalemi_id', 'brut_tutar', 'komisyon_orani',
            'platform_kesintisi', 'net_tutar', 'durum',
            'olusturulma_tarihi', 'odeme_tarihi',
        ],
        raw: true,
    });
}

async function _fetchInstructorIban(instructorId) {
    try {
        const detail = await InstructorDetail.findByPk(instructorId, {
            attributes: ['iban_no'],
            raw: true,
        });
        return detail?.iban_no || null;
    } catch (_) {
        return null;
    }
}

// ────────────────────────── Yetki Kapısı ────────────────────────

/**
 * @returns {{ ok:true, mode:'customer'|'instructor' } | { ok:false, status:number, message:string }}
 */
function _authorize(order, user) {
    if (!user) {
        return { ok: false, status: 401, message: 'Oturum bilgisi çözümlenemedi.' };
    }
    switch (user.rol) {
        case 'admin':
            return { ok: true, mode: 'customer' };

        case 'ogrenci':
            if (order.kullanici_id && order.kullanici_id === user.id) {
                return { ok: true, mode: 'customer' };
            }
            return { ok: false, status: 403, message: 'Bu dekonta erişim yetkiniz yok.' };

        case 'egitmen': {
            const hasOwn = (order.OrderItems || []).some(
                (it) => it.Course && it.Course.egitmen_id === user.id
            );
            if (!hasOwn) {
                return { ok: false, status: 403, message: 'Bu dekonta erişim yetkiniz yok.' };
            }
            return { ok: true, mode: 'instructor' };
        }
        default:
            return { ok: false, status: 403, message: 'Tanımsız rol için erişim reddedildi.' };
    }
}

// ────────────────────────── Endpoint ────────────────────────────

/**
 * GET /api/receipts/download/:orderId
 */
exports.downloadReceipt = async (req, res, next) => {
    try {
        const { orderId } = req.params;

        if (!UUID_RE.test(orderId || '')) {
            return res.status(400).json({ success: false, message: 'Geçersiz sipariş kimliği.' });
        }

        const order = await _loadOrderWithRelations(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Sipariş bulunamadı.' });
        }

        if (order.durum !== 'tamamlandi' && order.durum !== 'iade_edildi') {
            return res.status(409).json({
                success: false,
                message: 'Bu sipariş henüz tamamlanmadığı için dekont oluşturulamaz.',
            });
        }

        const auth = _authorize(order, req.user);
        if (!auth.ok) {
            return res.status(auth.status).json({ success: false, message: auth.message });
        }

        // Header'lar (stream başlamadan)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', _buildContentDisposition(
            order.id,
            auth.mode === 'instructor' ? 'instructor-payout' : 'customer'
        ));
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.on('error', (err) => console.warn('[RECEIPT] response stream hatası:', err.message));

        if (auth.mode === 'instructor') {
            const filtered = _filterOrderForInstructor(order, req.user.id);
            const [earnings, iban] = await Promise.all([
                _fetchEarningsForItems(filtered.OrderItems.map((i) => i.id)),
                _fetchInstructorIban(req.user.id),
            ]);

            // Eğitmen profil verisi — JWT'den gelen ad/soyad genelde yok; DB'den çek.
            // Maliyeti küçük: tek bir Profile.findByPk.
            const instructorProfile = await Profile.findByPk(req.user.id, {
                attributes: ['id', 'ad', 'soyad', 'eposta'],
                raw: true,
            });

            return streamInstructorPayoutPdf({
                order: filtered,
                instructorProfile,
                iban,
                earnings,
                output: res,
            });
        }

        // Müşteri/Admin
        return streamOrderReceiptPdf({ order: _payloadForCustomer(order), output: res });
    } catch (error) {
        if (!res.headersSent) {
            return next(error);
        }
        console.error('[RECEIPT] stream sırasında hata:', error.message);
        try { res.end(); } catch (_) { /* noop */ }
    }
};
