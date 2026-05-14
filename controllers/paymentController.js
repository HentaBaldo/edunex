/**
 * EduNex Ödeme (Payment) Controller
 * Sepet -> Sipariş -> iyzico Checkout -> Callback -> Enrollment akışını yönetir.
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const {
    sequelize,
    Cart,
    CartItem,
    Course,
    Profile,
    InstructorDetail,
    Order,
    OrderItem,
    CourseEnrollment,
    InstructorEarning,
    PaymentTransaction,
    Category,
} = require('../models');
const iyzicoService = require('../services/iyzicoService');
const { sendNotification } = require('../services/notificationService');

// Platform komisyon orani: %30 (env ile override edilebilir)
const PLATFORM_KOMISYON_ORANI = Number(process.env.PLATFORM_KOMISYON_ORANI || 30);
// Kurus bazli aritmetik: floating point sapmasini onler.
const toKurus = (v) => Math.round(Number(v) * 100);
const fromKurus = (k) => (k / 100).toFixed(2);

/**
 * Sepetten ödeme başlat.
 * @route POST /api/payments/checkout
 * @returns { paymentPageUrl, siparis_id, conversation_id, token }
 */
exports.checkout = async (req, res, next) => {
    const kullanici_id = req.user.id;

    try {
        const cart = await Cart.findOne({ where: { kullanici_id } });
        if (!cart) {
            const err = new Error('Sepet bulunamadi.');
            err.statusCode = 400;
            throw err;
        }

        const cartItems = await CartItem.findAll({
            where: { sepet_id: cart.id },
            include: [{
                model: Course,
                attributes: ['id', 'baslik', 'fiyat', 'durum', 'kategori_id', 'egitmen_id'],
                include: [
                    { model: Category, attributes: ['ad'] },
                    // Marketplace icin egitmenin SubMerchant anahtari sart.
                    { model: InstructorDetail, attributes: ['kullanici_id', 'submerchant_key'] },
                ],
                required: true,
            }],
        });

        if (cartItems.length === 0) {
            const err = new Error('Sepetiniz bos.');
            err.statusCode = 400;
            throw err;
        }

        // Durum kontrolu + zaten kayitli mi?
        const courseIds = cartItems.map(ci => ci.kurs_id);
        const existingEnrollments = await CourseEnrollment.findAll({
            where: { ogrenci_id: kullanici_id, kurs_id: courseIds },
            attributes: ['kurs_id'],
        });
        if (existingEnrollments.length > 0) {
            const err = new Error('Sepetteki bir veya daha fazla kursa zaten kayitlisiniz.');
            err.statusCode = 400;
            throw err;
        }

        for (const ci of cartItems) {
            if (!ci.Course || ci.Course.durum !== 'yayinda') {
                const err = new Error(`"${ci.Course?.baslik || 'Kurs'}" artik satin alinamaz.`);
                err.statusCode = 400;
                throw err;
            }
            // Marketplace zorunlulugu (KOSULSUZ): iyzico, sepetteki TUM kalemlerde
            // subMerchantKey gormezse "butun sepet kirilimlarinda subMerchantKey
            // gonderilmelidir" diyerek tum cagriyi reddeder. Bu yuzden hic bir item
            // bos olamaz; bu kontrolu env flag arkasinda gizlemiyoruz.
            const submerchantKey = ci.Course.InstructorDetail?.submerchant_key;
            if (!submerchantKey || !String(submerchantKey).trim()) {
                const err = new Error(`Sepetinizdeki "${ci.Course.baslik}" adlı kursun eğitmeni henüz ödeme altyapısını kurmadığı için bu işlem gerçekleştirilemiyor.`);
                err.statusCode = 400;
                throw err;
            }
        }

        // Toplami DB fiyatlarindan KURUS bazli hesapla (floating-point sapmasi yok)
        const toplamKurus = cartItems.reduce((s, ci) => s + toKurus(ci.Course.fiyat || 0), 0);
        if (toplamKurus <= 0) {
            const err = new Error('Odeme tutari sifir veya gecersiz.');
            err.statusCode = 400;
            throw err;
        }

        const user = await Profile.findByPk(kullanici_id, {
            attributes: ['id', 'ad', 'soyad', 'eposta', 'sehir', 'phone', 'identity_number'],
        });
        if (!user) {
            const err = new Error('Kullanici bulunamadi.');
            err.statusCode = 404;
            throw err;
        }

        // SANITY CHECK: Kolonlar DB'de mevcut mu? undefined => kolon eksik (migration gerekli)
        if (user.phone === undefined || user.identity_number === undefined) {
            console.error('[PAYMENT SANITY] profiller tablosunda phone/identity_number kolonu eksik. ALTER TABLE gerekli.');
            const err = new Error('Profil semasi guncel degil: phone/identity_number kolonu eksik. Yoneticinin migration calistirmasi gerekli.');
            err.statusCode = 500;
            throw err;
        }
        if (!user.phone || !user.identity_number) {
            console.warn('[PAYMENT] Kullanici PII bos, fallback kullanilacak:', {
                kullanici_id, hasPhone: !!user.phone, hasIdentity: !!user.identity_number,
            });
        }

        // Siparis + kalemler transaction ile
        const conversationId = uuidv4();
        const { order, orderItems } = await sequelize.transaction(async (t) => {
            const ord = await Order.create({
                kullanici_id,
                toplam_tutar: fromKurus(toplamKurus),
                para_birimi: 'TRY',
                durum: 'beklemede',
                saglayici: 'iyzico',
                conversation_id: conversationId,
            }, { transaction: t });

            const oItems = [];
            for (const ci of cartItems) {
                const oi = await OrderItem.create({
                    siparis_id: ord.id,
                    kurs_id: ci.kurs_id,
                    odenen_fiyat: fromKurus(toKurus(ci.Course.fiyat)),
                    hakedis_durumu: 'beklemede',
                }, { transaction: t });
                oItems.push({ orderItem: oi, course: ci.Course });
            }
            return { order: ord, orderItems: oItems };
        });

        const callbackUrl = iyzicoService.buildAbsoluteUrl('/api/payments/callback');

        // iyzico Checkout Form baslat
        let initResult;
        try {
            initResult = await iyzicoService.initializeCheckoutForm({
                order,
                user: {
                    id: user.id,
                    ad: user.ad,
                    soyad: user.soyad,
                    email: user.eposta,
                    sehir: user.sehir,
                    phone: user.phone,
                    identity_number: user.identity_number,
                    ip: req.ip,
                },
                items: orderItems.map(({ orderItem, course }) => ({
                    id: orderItem.id, // callback'te itemTransactions ile eslestirilecek
                    baslik: course.baslik,
                    kategori: course.Category?.ad || 'Egitim',
                    fiyat: course.fiyat,
                    // Marketplace: her item kendi egitmeninin SubMerchant'ina yonlendirilir.
                    // Eski (key'i olmayan) kayitlarda klasik tahsilata duser.
                    subMerchantKey: course.InstructorDetail?.submerchant_key || null,
                })),
                callbackUrl,
            });
        } catch (iyzErr) {
            console.error('[IYZICO HATA]', iyzErr.iyzicoResult?.errorMessage || iyzErr.message);
            // Siparisi basarisiz isaretle, log tut
            await order.update({
                durum: 'basarisiz',
                gateway_response: iyzErr.iyzicoResult || { message: iyzErr.message },
            });
            await PaymentTransaction.create({
                siparis_id: order.id,
                saglayici: 'iyzico',
                islem_tipi: 'initialize',
                conversation_id: conversationId,
                durum: 'failure',
                hata_kodu: iyzErr.iyzicoResult?.errorCode || null,
                hata_mesaji: iyzErr.message?.slice(0, 500) || null,
                ham_yanit: iyzErr.iyzicoResult || null,
            });
            const err = new Error('Odeme baslatilamadi: ' + (iyzErr.message || 'iyzico hatasi'));
            err.statusCode = 502;
            throw err;
        }

        await order.update({
            odeme_token: initResult.token,
            gateway_response: initResult.raw,
        });
        await PaymentTransaction.create({
            siparis_id: order.id,
            saglayici: 'iyzico',
            islem_tipi: 'initialize',
            conversation_id: conversationId,
            odeme_token: initResult.token,
            durum: 'success',
            ham_yanit: initResult.raw,
        });

        console.log('[PAYMENT OK]', {
            order_id: order.id,
            token_present: !!initResult.token,
            paymentPageUrl_present: !!initResult.paymentPageUrl,
            checkoutFormContent_present: !!initResult.checkoutFormContent,
            checkoutFormContent_len: initResult.checkoutFormContent?.length || 0,
        });

        return res.status(200).json({
            status: 'success',
            data: {
                siparis_id: order.id,
                conversation_id: conversationId,
                token: initResult.token,
                paymentPageUrl: initResult.paymentPageUrl,
                checkoutFormContent: initResult.checkoutFormContent,
            },
        });
    } catch (error) {
        console.error('[PAYMENT FATAL]', {
            name: error.name,
            message: error.message,
            statusCode: error.statusCode,
            iyzicoResult: error.iyzicoResult || null,
            stack: error.stack,
        });
        next(error);
    }
};

/**
 * iyzico callback'i. Basarili/basarisiz HTML sayfasina yonlendirir.
 * iyzico token'i POST (x-www-form-urlencoded) olarak gonderir.
 * @route POST /api/payments/callback
 */
exports.callback = async (req, res) => {
    console.log('[CALLBACK INIT] iyzico post datasi geldi:', {
        body: req.body,
        query: req.query,
        contentType: req.headers['content-type'],
    });

    const token = req.body?.token || req.query?.token;
    const successUrl = '/student/dashboard.html?payment=success';
    const failureUrl = '/student/payment-failure.html';
    const failWith = (reason) => res.redirect(`${failureUrl}?reason=${encodeURIComponent(reason)}`);

    if (!token) {
        console.error('[CALLBACK ERROR] Token eksik. body:', req.body);
        return failWith('Odeme dogrulama bilgisi (token) alinamadi.');
    }

    try {
        const order = await Order.findOne({ where: { odeme_token: token } });
        if (!order) {
            console.error('[CALLBACK ERROR] Token icin siparis bulunamadi. token:', token);
            return failWith('Bu odemeye ait siparis bulunamadi.');
        }

        if (order.durum === 'tamamlandi') {
            console.log('[CALLBACK] Siparis zaten tamamlanmis, success sayfasina yonlendiriliyor:', order.id);
            return res.redirect(successUrl);
        }
        if (order.durum === 'basarisiz' || order.durum === 'iade_edildi') {
            return failWith('Bu siparis daha once iptal edilmis veya iade alinmis.');
        }

        const retrieveResult = await iyzicoService.retrieveCheckoutForm(token, order.conversation_id);
        console.log('[CALLBACK RETRIEVE] iyzico dogrulama sonucu:', JSON.stringify(retrieveResult, null, 2));

        await PaymentTransaction.create({
            siparis_id: order.id,
            saglayici: 'iyzico',
            islem_tipi: 'retrieve',
            conversation_id: order.conversation_id,
            odeme_token: token,
            payment_id: retrieveResult?.paymentId || null,
            durum: retrieveResult?.paymentStatus || retrieveResult?.status || 'unknown',
            hata_kodu: retrieveResult?.errorCode || null,
            hata_mesaji: retrieveResult?.errorMessage?.slice(0, 500) || null,
            ham_yanit: retrieveResult || null,
        });

        const paymentOk =
            retrieveResult?.status === 'success' &&
            retrieveResult?.paymentStatus === 'SUCCESS';

        if (!paymentOk) {
            await order.update({
                durum: 'basarisiz',
                gateway_response: retrieveResult || null,
            });
            return failWith(retrieveResult?.errorMessage || 'Odeme iyzico tarafinda basarisiz.');
        }

        // Basarili: itemTransactionId eslemesi + Enrollment + Earning + sepet temizleme (transaction)
        // iyzico, callback retrieve sonucunda paymentItems (veya itemTransactions) listesi doner.
        // Her bir kalem 'itemId' alaniyla geri gelir; bu alani biz checkout'ta OrderItem.id olarak gondermistik.
        // Boylece itemTransactionId'yi dogru OrderItem'a yaziyoruz - iade ve approval icin sart.
        const itemTransactions = retrieveResult?.paymentItems || retrieveResult?.itemTransactions || [];
        const txByItemId = new Map();
        for (const it of itemTransactions) {
            const key = it?.itemId || it?.basketItemId;
            const txId = it?.paymentTransactionId || it?.itemTransactionId;
            if (key && txId) txByItemId.set(key, txId);
        }
        if (txByItemId.size === 0) {
            console.warn('[CALLBACK] iyzico itemTransactions bos doner; iade/approval bu siparisten yapilamaz.', { order_id: order.id });
        }

        // Transaction sonrasi bildirim icin gerekli minimum bilgileri yakalayacagimiz scope.
        // Burada doluyor; transaction commit edildikten sonra non-blocking bildirim atilir.
        const satisBildirimDataset = [];

        try {
            await sequelize.transaction(async (t) => {
                await order.update({
                    durum: 'tamamlandi',
                    islem_id: retrieveResult.paymentId || null,
                    gateway_response: retrieveResult,
                }, { transaction: t });

                const orderItems = await OrderItem.findAll({
                    where: { siparis_id: order.id },
                    include: [{
                        model: Course,
                        attributes: ['id', 'baslik', 'fiyat', 'egitmen_id'],
                    }],
                    transaction: t,
                });

                for (const oi of orderItems) {
                    // 1) itemTransactionId'yi OrderItem'a yansit (idempotent: yoksa NULL kalir)
                    const txId = txByItemId.get(oi.id) || null;
                    if (txId && !oi.iyzico_item_transaction_id) {
                        await oi.update({ iyzico_item_transaction_id: txId }, { transaction: t });
                    }

                    // 2) Enrollment (idempotent)
                    const [enrollment, created] = await CourseEnrollment.findOrCreate({
                        where: { ogrenci_id: order.kullanici_id, kurs_id: oi.kurs_id },
                        defaults: {
                            ogrenci_id: order.kullanici_id,
                            kurs_id: oi.kurs_id,
                            siparis_kalemi_id: oi.id,
                            ilerleme_yuzdesi: 0,
                            kayit_tarihi: new Date(),
                        },
                        transaction: t,
                    });
                    if (!created && !enrollment.siparis_kalemi_id) {
                        await enrollment.update({ siparis_kalemi_id: oi.id }, { transaction: t });
                    }

                    // 3) Egitmen hakedisi - kurus bazli aritmetik
                    const brutKurus = toKurus(oi.odenen_fiyat);
                    const kesintiKurus = Math.round(brutKurus * PLATFORM_KOMISYON_ORANI / 100);
                    const netKurus = brutKurus - kesintiKurus;
                    await InstructorEarning.findOrCreate({
                        where: { siparis_kalemi_id: oi.id },
                        defaults: {
                            egitmen_id: oi.Course?.egitmen_id || null,
                            siparis_kalemi_id: oi.id,
                            brut_tutar: fromKurus(brutKurus),
                            komisyon_orani: PLATFORM_KOMISYON_ORANI,
                            platform_kesintisi: fromKurus(kesintiKurus),
                            net_tutar: fromKurus(netKurus),
                            para_birimi: 'TRY',
                        },
                        transaction: t,
                    });

                    // Bildirim dataset: transaction icinde sadece veri YAKALIYORUZ, IO yok.
                    if (oi.Course?.egitmen_id) {
                        satisBildirimDataset.push({
                            egitmen_id: oi.Course.egitmen_id,
                            kurs_id: oi.kurs_id,
                            kurs_baslik: oi.Course?.baslik || 'Kurs',
                            net_tutar: fromKurus(netKurus),
                        });
                    }
                }

                // 4) Sepeti bosalt
                const cart = await Cart.findOne({ where: { kullanici_id: order.kullanici_id }, transaction: t });
                if (cart) {
                    await CartItem.destroy({ where: { sepet_id: cart.id }, transaction: t });
                }
            });
        } catch (dbError) {
            // KRITIK: iyzico tahsilati YAPTI ama bizim DB islemimiz patladi.
            // Order durumunu 'basarisiz' isaretlemiyoruz cunku para alinmis durumda.
            // Manuel mudahale gerekir; loga siparis_id + paymentId yaziyoruz ki destek bulsun.
            console.error('[CALLBACK DB ERROR] Odeme alindi ancak kayit/enrollment olusturulamadi.', {
                order_id: order.id,
                conversation_id: order.conversation_id,
                iyzico_payment_id: retrieveResult?.paymentId,
                kullanici_id: order.kullanici_id,
                error_name: dbError.name,
                error_message: dbError.message,
                stack: dbError.stack,
            });
            return failWith(`Odemeniz alindi ancak kayit olusturulamadi. Destek ile iletisime gecin. Siparis No: ${order.id}`);
        }

        // --- SATIS BILDIRIMI (transaction COMMIT sonrasi, non-blocking) ---
        // KRITIK: Bu blok transaction'in DISINDA durur. Bildirim hatasi:
        //   1) order'i 'tamamlandi'dan 'basarisiz'a dusurmemeli,
        //   2) ogrencinin enrollment'ini iptal etmemeli,
        //   3) iyzico'dan iade tetiklememeli.
        // Bu yuzden hatayi sadece logluyoruz, basarili sayfasina yonlendirmeye devam ediyoruz.
        try {
            // Ogrenci adi tek bir Profile sorgusuyla cekiliyor (N+1 yok).
            const ogrenci = await Profile.findByPk(order.kullanici_id, {
                attributes: ['id', 'ad', 'soyad'],
            });
            const ogrenciAd = ogrenci ? `${ogrenci.ad || ''} ${ogrenci.soyad || ''}`.trim() : 'Bir öğrenci';

            // Her satilan kalem icin kursun sahibi egitmene ayri bildirim.
            // Promise.allSettled: bir bildirimin hatasi digerlerini durdurmasin.
            await Promise.allSettled(satisBildirimDataset.map(d =>
                sendNotification({
                    kullanici_id: d.egitmen_id,
                    baslik: 'Tebrikler! Yeni Bir Satış',
                    mesaj: `"${d.kurs_baslik}" kursunuz ${ogrenciAd} tarafından satın alındı. Net hakediş: ${d.net_tutar} TRY.`,
                    tip: 'satis',
                    baglanti_linki: `/instructor/dashboard.html`,
                    kaynak_id: order.id,
                })
            ));
        } catch (notifyErr) {
            console.error('BİLDİRİM KAYIT HATASI: [NOTIFY ERROR] Satis bildirimleri olusturulamadi:', {
                order_id: order.id,
                message: notifyErr.message,
                stack: notifyErr.stack,
            });
        }

        return res.redirect(successUrl);
    } catch (error) {
        console.error('[CALLBACK FATAL]', {
            name: error.name,
            message: error.message,
            stack: error.stack,
        });
        return failWith(`Sunucu hatasi: ${error.message || 'Bilinmeyen hata'}`);
    }
};

/**
 * Akilli iade (refund) - musteri tarafindan tek bir kurs kalemi icin iade talebi.
 * KOSULLAR (HER IKISI BIRLIKTE SAGLANMALI):
 *   1) Siparis tarihinden itibaren 14 gun GECMEMIS olmali.
 *   2) Kurs ilerleme yuzdesi <= %20 olmali (egitmenin emegini korur).
 * Sadece sahip olan kullanici kendi siparisini iade edebilir.
 *
 * @route POST /api/payments/refund/:orderItemId
 */
exports.refundItem = async (req, res, next) => {
    const kullanici_id = req.user.id;
    const { orderItemId } = req.params;

    const IADE_PENCERESI_GUN = 14;
    const MAX_ILERLEME_YUZDESI = 20;

    try {
        // 1) OrderItem + Order + Enrollment'i tek sorguda cek (N+1 onleme)
        const oi = await OrderItem.findOne({
            where: { id: orderItemId },
            include: [
                {
                    model: Order,
                    attributes: ['id', 'kullanici_id', 'durum', 'olusturulma_tarihi'],
                    required: true,
                },
            ],
        });

        if (!oi || !oi.Order) {
            const err = new Error('Iade edilecek siparis kalemi bulunamadi.');
            err.statusCode = 404;
            throw err;
        }
        if (oi.Order.kullanici_id !== kullanici_id) {
            const err = new Error('Bu siparis size ait degil.');
            err.statusCode = 403;
            throw err;
        }
        if (oi.Order.durum !== 'tamamlandi') {
            const err = new Error('Sadece tamamlanmis siparisler iade edilebilir.');
            err.statusCode = 400;
            throw err;
        }
        if (oi.hakedis_durumu === 'iade_edildi') {
            const err = new Error('Bu kalem zaten iade edilmis.');
            err.statusCode = 409;
            throw err;
        }
        if (oi.hakedis_durumu === 'onaylandi') {
            const err = new Error('Bu kalemin hakedisi egitmene aktarilmis. Iade penceresi kapanmistir.');
            err.statusCode = 409;
            throw err;
        }
        if (!oi.iyzico_item_transaction_id) {
            const err = new Error('Bu kalemde iyzico takip numarasi yok; iade gerceklestirilemez. Destek ile iletisime gecin.');
            err.statusCode = 422;
            throw err;
        }

        // 2) Sart-1: 14 gun penceresi
        const siparisTarihi = new Date(oi.Order.olusturulma_tarihi);
        const simdi = new Date();
        const gecenMs = simdi.getTime() - siparisTarihi.getTime();
        const gecenGun = gecenMs / (1000 * 60 * 60 * 24);
        if (gecenGun > IADE_PENCERESI_GUN) {
            const err = new Error(`Iade penceresi kapanmis (${IADE_PENCERESI_GUN} gun gecmis).`);
            err.statusCode = 409;
            throw err;
        }

        // 3) Sart-2: Ilerleme yuzdesi <= 20
        const enrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id: kullanici_id, kurs_id: oi.kurs_id },
            attributes: ['id', 'ilerleme_yuzdesi'],
        });
        const ilerleme = Number(enrollment?.ilerleme_yuzdesi || 0);
        if (ilerleme > MAX_ILERLEME_YUZDESI) {
            const err = new Error(`Kursta ilerlemeniz %${ilerleme} oldugundan iade hakkiniz dustu. (Limit: %${MAX_ILERLEME_YUZDESI})`);
            err.statusCode = 409;
            throw err;
        }

        // 4) iyzico iade cagrisi - DB transaction'i icine almiyoruz cunku
        //    long-running HTTP cagri (timeout/duplikasyon riski). Strateji:
        //      a) Once iyzico refund -> basarili olursa
        //      b) Hizli bir transaction ile DB durumlarini guncelle.
        const refundResult = await iyzicoService.refundItem({
            paymentTransactionId: oi.iyzico_item_transaction_id,
            price: oi.odenen_fiyat,
            ip: req.ip,
            conversationId: oi.Order.id,
        });

        // 5) DB guncellemesi (transaction)
        await sequelize.transaction(async (t) => {
            await oi.update({ hakedis_durumu: 'iade_edildi' }, { transaction: t });

            // Hakedis kaydi varsa sifirla (egitmene gitmemis para zaten)
            await InstructorEarning.destroy({
                where: { siparis_kalemi_id: oi.id },
                transaction: t,
            });

            // Ogrenci enrollment'ini sil (artik kursa erisemez)
            if (enrollment) {
                await CourseEnrollment.destroy({
                    where: { id: enrollment.id },
                    transaction: t,
                });
            }

            // Iade log kaydi
            await PaymentTransaction.create({
                siparis_id: oi.Order.id,
                saglayici: 'iyzico',
                islem_tipi: 'refund',
                conversation_id: oi.Order.id,
                payment_id: refundResult?.paymentId || null,
                durum: 'success',
                ham_yanit: refundResult || null,
            }, { transaction: t });

            // Tum kalemler iade ise siparisin ust durumunu da guncelle
            const kalanlar = await OrderItem.count({
                where: {
                    siparis_id: oi.Order.id,
                    hakedis_durumu: { [Op.ne]: 'iade_edildi' },
                },
                transaction: t,
            });
            if (kalanlar === 0) {
                await Order.update(
                    { durum: 'iade_edildi' },
                    { where: { id: oi.Order.id }, transaction: t }
                );
            }
        });

        console.log(`[REFUND OK] order_item=${oi.id} kullanici=${kullanici_id} price=${oi.odenen_fiyat}`);
        return res.status(200).json({
            success: true,
            message: 'Iadeniz basariyla isleme alindi. Tutar 3-7 is gunu icinde kartiniza yansiyacaktir.',
            data: { siparis_kalemi_id: oi.id, iade_tutari: oi.odenen_fiyat },
        });
    } catch (error) {
        console.error('[REFUND FATAL]', {
            kullanici_id, orderItemId,
            message: error.message,
            iyzico: error.iyzicoResult || null,
        });
        next(error);
    }
};

/**
 * Mevcut kullanıcının siparişlerini listeler.
 * @route GET /api/payments/orders/my
 */
exports.myOrders = async (req, res, next) => {
    try {
        const kullanici_id = req.user.id;
        const orders = await Order.findAll({
            where: { kullanici_id },
            include: [{
                model: OrderItem,
                include: [{ model: Course, attributes: ['id', 'baslik'] }],
            }],
            order: [['olusturulma_tarihi', 'DESC']],
        });
        return res.status(200).json({ status: 'success', data: orders });
    } catch (error) {
        next(error);
    }
};
