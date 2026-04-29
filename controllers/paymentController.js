/**
 * EduNex Ödeme (Payment) Controller
 * Sepet -> Sipariş -> iyzico Checkout -> Callback -> Enrollment akışını yönetir.
 */

const { v4: uuidv4 } = require('uuid');
const {
    sequelize,
    Cart,
    CartItem,
    Course,
    Profile,
    Order,
    OrderItem,
    CourseEnrollment,
    InstructorEarning,
    PaymentTransaction,
    Category,
} = require('../models');
const iyzicoService = require('../services/iyzicoService');

const PLATFORM_KOMISYON_ORANI = 30; // %30

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
                include: [{ model: Category, attributes: ['ad'] }],
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
        }

        // Toplami DB fiyatlarindan hesapla (istemciye guvenme)
        const toplam = cartItems.reduce((s, ci) => s + Number(ci.Course.fiyat || 0), 0);
        if (toplam <= 0) {
            const err = new Error('Odeme tutari sifir veya gecersiz.');
            err.statusCode = 400;
            throw err;
        }

        const user = await Profile.findByPk(kullanici_id, {
            attributes: ['id', 'ad', 'soyad', 'eposta', 'sehir'],
        });
        if (!user) {
            const err = new Error('Kullanici bulunamadi.');
            err.statusCode = 404;
            throw err;
        }

        // Siparis + kalemler transaction ile
        const conversationId = uuidv4();
        const { order, orderItems } = await sequelize.transaction(async (t) => {
            const ord = await Order.create({
                kullanici_id,
                toplam_tutar: toplam.toFixed(2),
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
                    odenen_fiyat: Number(ci.Course.fiyat).toFixed(2),
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
                    ip: req.ip,
                },
                items: orderItems.map(({ orderItem, course }) => ({
                    id: orderItem.id,
                    baslik: course.baslik,
                    kategori: course.Category?.ad || 'Egitim',
                    fiyat: course.fiyat,
                })),
                callbackUrl,
            });
        } catch (iyzErr) {
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

        return res.status(200).json({
            status: 'success',
            data: {
                siparis_id: order.id,
                conversation_id: conversationId,
                token: initResult.token,
                paymentPageUrl: initResult.paymentPageUrl,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * iyzico callback'i. Basarili/basarisiz HTML sayfasina yonlendirir.
 * iyzico token'i POST (x-www-form-urlencoded) olarak gonderir.
 * @route POST /api/payments/callback
 */
exports.callback = async (req, res) => {
    const token = req.body?.token || req.query?.token;
    const successUrl = '/student/payment-success.html';
    const failureUrl = '/student/payment-failure.html';

    if (!token) {
        return res.redirect(`${failureUrl}?reason=token_yok`);
    }

    try {
        // Token ile Order bul
        const order = await Order.findOne({ where: { odeme_token: token } });
        if (!order) {
            return res.redirect(`${failureUrl}?reason=siparis_bulunamadi`);
        }

        // Idempotency: zaten tamamlanmissa tekrar isleme
        if (order.durum === 'tamamlandi') {
            return res.redirect(`${successUrl}?siparis=${order.id}`);
        }
        if (order.durum === 'basarisiz' || order.durum === 'iade_edildi') {
            return res.redirect(`${failureUrl}?reason=siparis_iptal`);
        }

        // iyzico'dan dogrulama al
        const retrieveResult = await iyzicoService.retrieveCheckoutForm(token, order.conversation_id);

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
            const reason = encodeURIComponent(retrieveResult?.errorMessage || 'odeme_basarisiz');
            return res.redirect(`${failureUrl}?reason=${reason}`);
        }

        // Basarili: Enrollment + Earning olustur + sepeti bosalt (transaction)
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
                    attributes: ['id', 'fiyat', 'egitmen_id'],
                }],
                transaction: t,
            });

            for (const oi of orderItems) {
                // Enrollment (idempotent: zaten varsa atla)
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

                // Egitmen hakedisi (findOrCreate: çift callback'te tekrar oluşturma)
                const brut = Number(oi.odenen_fiyat);
                const kesinti = Number((brut * PLATFORM_KOMISYON_ORANI / 100).toFixed(2));
                const net = Number((brut - kesinti).toFixed(2));
                await InstructorEarning.findOrCreate({
                    where: { siparis_kalemi_id: oi.id },
                    defaults: {
                        egitmen_id: oi.Course?.egitmen_id || null,
                        siparis_kalemi_id: oi.id,
                        brut_tutar: brut.toFixed(2),
                        komisyon_orani: PLATFORM_KOMISYON_ORANI,
                        platform_kesintisi: kesinti.toFixed(2),
                        net_tutar: net.toFixed(2),
                        para_birimi: 'TRY',
                    },
                    transaction: t,
                });
            }

            // Sepeti bosalt
            const cart = await Cart.findOne({ where: { kullanici_id: order.kullanici_id }, transaction: t });
            if (cart) {
                await CartItem.destroy({ where: { sepet_id: cart.id }, transaction: t });
            }
        });

        return res.redirect(`${successUrl}?siparis=${order.id}`);
    } catch (error) {
        console.error('[PAYMENT CALLBACK ERROR]', error);
        return res.redirect(`${failureUrl}?reason=sunucu_hatasi`);
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
