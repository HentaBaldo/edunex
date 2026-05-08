/**
 * EduNex iyzico Ödeme Servisi
 * iyzico Checkout Form (hosted) entegrasyonu için sarmalayıcı.
 * Sandbox: https://sandbox-api.iyzipay.com | Canlı: https://api.iyzipay.com
 */

const Iyzipay = require('iyzipay');
const iyzipay = require('../config/iyzipay');

const { APP_BASE_URL } = process.env;

/**
 * iyzico'nun belirli alanlarda izin verdiği karakterleri korur,
 * riskli karakterleri (=, &, vb.) boşlukla değiştirir.
 */
const sanitize = (value, fallback = 'EduNex') => {
    if (!value) return fallback;
    return String(value).replace(/[=&?#<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;
};

const formatPhone = (phone) => {
    if (!phone) return '+905000000000';
    const d = String(phone).replace(/\D/g, '');
    if (d.startsWith('90') && d.length === 12) return '+' + d;
    if (d.startsWith('0') && d.length === 11) return '+9' + d;
    if (d.length === 10) return '+90' + d;
    return '+905000000000';
};

/**
 * Checkout Form başlatır.
 * Dönüş: { paymentPageUrl, token, conversationId } (başarı)
 * veya throw Error (iyzico hatasi).
 *
 * @param {object} params
 * @param {object} params.order       - Order kaydı (id, toplam_tutar, para_birimi, conversation_id)
 * @param {object} params.user        - { id, ad, soyad, email, sehir?, telefon? }
 * @param {Array}  params.items       - [{ id, baslik, kategori, fiyat }]
 * @param {string} params.callbackUrl - iyzico'nun sonucu POST edeceği URL
 */
exports.initializeCheckoutForm = ({ order, user, items, callbackUrl }) => {
    return new Promise((resolve, reject) => {
        const totalPrice = Number(order.toplam_tutar).toFixed(2);

        const basketItems = items.map(item => ({
            id: item.id,
            name: sanitize(item.baslik, 'Kurs'),
            category1:'Egitim',
            itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
            price: Number(item.fiyat).toFixed(2),
        }));

        if (Number(totalPrice) <= 0) {
            return reject(new Error('Odeme tutari sifir veya negatif olamaz.'));
        }

        const request = {
            locale: Iyzipay.LOCALE.TR,
            conversationId: order.conversation_id,
            price: totalPrice,
            paidPrice: totalPrice,
            currency: Iyzipay.CURRENCY.TRY,
            basketId: order.id,
            paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
            callbackUrl,
            enabledInstallments: [2, 3, 6, 9],
            buyer: {
                id: user.id,
                name: sanitize(user.ad, 'EduNex'),
                surname: sanitize(user.soyad, 'Kullanici'),
                gsmNumber: formatPhone(user.telefon),
                email: user.email || 'kullanici@edunex.com',
                identityNumber: '11111111111',
                registrationAddress: sanitize(user.sehir || 'Turkiye', 'Turkiye'),
                ip: user.ip || '85.34.78.112',
                city: sanitize(user.sehir || 'Istanbul', 'Istanbul'),
                country: 'Turkey',
                zipCode: '34000',
            },
            shippingAddress: {
                contactName: sanitize(`${user.ad || ''} ${user.soyad || ''}`.trim(), 'EduNex Kullanici'),
                city: sanitize(user.sehir || 'Istanbul', 'Istanbul'),
                country: 'Turkey',
                address: sanitize(user.sehir || 'Turkiye', 'Turkiye'),
                zipCode: '34000',
            },
            billingAddress: {
                contactName: sanitize(`${user.ad || ''} ${user.soyad || ''}`.trim(), 'EduNex Kullanici'),
                city: sanitize(user.sehir || 'Istanbul', 'Istanbul'),
                country: 'Turkey',
                address: sanitize(user.sehir || 'Turkiye', 'Turkiye'),
                zipCode: '34000',
            },
            basketItems,
        };

        // Hassas veri (alici email/telefon/adres) iceren tam payload sadece development'ta loglanir.
        if (process.env.NODE_ENV !== 'production') {
            console.log('[IYZICO] CALLBACK URL:', callbackUrl);
            console.log('--- IYZICO REQUEST PAYLOAD ---', JSON.stringify(request, null, 2));
        } else {
            console.log(`[IYZICO] Checkout init basket=${order.id} total=${totalPrice}`);
        }
        iyzipay.checkoutFormInitialize.create(request, (err, result) => {
            if (err) return reject(err);
            if (!result || result.status !== 'success') {
                const error = new Error(result?.errorMessage || 'iyzico Checkout Form baslatilamadi.');
                error.iyzicoResult = result;
                return reject(error);
            }
            resolve({
                paymentPageUrl: result.paymentPageUrl,
                token: result.token,
                conversationId: result.conversationId,
                raw: result,
            });
        });
    });
};

/**
 * Callback'ten gelen token ile ödeme durumunu sorgular.
 */
exports.retrieveCheckoutForm = (token, conversationId) => {
    return new Promise((resolve, reject) => {
        iyzipay.checkoutForm.retrieve(
            {
                locale: Iyzipay.LOCALE.TR,
                conversationId,
                token,
            },
            (err, result) => {
                if (err) return reject(err);
                resolve(result);
            }
        );
    });
};

exports.buildAbsoluteUrl = (pathname) => {
    const fallback = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
    const base = (APP_BASE_URL || fallback).replace(/\/+$/, '');
    if (!base) {
        throw new Error('APP_BASE_URL ortam degiskeni production icin tanimlanmalidir.');
    }
    return `${base}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
};