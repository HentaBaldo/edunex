/**
 * EduNex iyzico Ödeme Servisi
 * iyzico Checkout Form (hosted) entegrasyonu için sarmalayıcı.
 * Sandbox: https://sandbox-api.iyzipay.com | Canlı: https://api.iyzipay.com
 */

const Iyzipay = require('iyzipay');

const {
    IYZICO_API_KEY,
    IYZICO_SECRET_KEY,
    IYZICO_BASE_URL,
    APP_BASE_URL,
} = process.env;

if (!IYZICO_API_KEY || !IYZICO_SECRET_KEY) {
    console.warn('[IYZICO] Uyari: IYZICO_API_KEY / IYZICO_SECRET_KEY .env icinde tanimli degil.');
}

const iyzipay = new Iyzipay({
    apiKey: IYZICO_API_KEY || 'sandbox-api-key',
    secretKey: IYZICO_SECRET_KEY || 'sandbox-secret-key',
    uri: IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com',
});

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
            category1: sanitize(item.kategori || 'Egitim', 'Egitim'),
            itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
            price: Number(item.fiyat).toFixed(2),
        }));

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
                gsmNumber: user.telefon || '+905000000000',
                email: user.email || 'kullanici@edunex.local',
                identityNumber: '11111111111',
                registrationAddress: sanitize(user.sehir || 'Turkiye', 'Turkiye'),
                ip: user.ip || '85.34.78.112',
                city: sanitize(user.sehir || 'Istanbul', 'Istanbul'),
                country: 'Turkey',
            },
            shippingAddress: {
                contactName: sanitize(`${user.ad || ''} ${user.soyad || ''}`.trim(), 'EduNex Kullanici'),
                city: sanitize(user.sehir || 'Istanbul', 'Istanbul'),
                country: 'Turkey',
                address: sanitize(user.sehir || 'Turkiye', 'Turkiye'),
            },
            billingAddress: {
                contactName: sanitize(`${user.ad || ''} ${user.soyad || ''}`.trim(), 'EduNex Kullanici'),
                city: sanitize(user.sehir || 'Istanbul', 'Istanbul'),
                country: 'Turkey',
                address: sanitize(user.sehir || 'Turkiye', 'Turkiye'),
            },
            basketItems,
        };

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
