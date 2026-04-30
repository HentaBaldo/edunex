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
const sanitize = (value, fallback = 'EduNex Kullanici') => {
    if (!value) return fallback;
    return String(value).replace(/[=&?#]/g, ' ').trim() || fallback;
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
                name: 'Hasan Talha',
                surname: 'Keskin',
                gsmNumber: '+905350000000',
                email: 'test@test.com',
                identityNumber: '74300864791',
                registrationAddress: 'Sakarya Universitesi Bilgisayar Bolumu',
                ip: '85.34.78.112',
                city: 'Sakarya',
                country: 'Turkey',
                zipCode: '54000',
            },
            shippingAddress: {
                contactName: 'Hasan Talha Keskin',
                city: 'Sakarya',
                country: 'Turkey',
                address: 'Sakarya Universitesi Bilgisayar Bolumu',
                zipCode: '54000',
            },
            billingAddress: {
                contactName: 'Hasan Talha Keskin',
                city: 'Sakarya',
                country: 'Turkey',
                address: 'Sakarya Universitesi Bilgisayar Bolumu',
                zipCode: '54000',
            },
            basketItems,
        };

        console.log('[IYZICO] CALLBACK URL:', callbackUrl);
        console.log('--- IYZICO REQUEST PAYLOAD ---', JSON.stringify(request, null, 2));
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
    const base = (APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
};