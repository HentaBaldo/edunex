const Iyzipay = require('iyzipay');

if (!process.env.IYZICO_API_KEY || !process.env.IYZICO_SECRET_KEY) {
    console.warn('[IYZICO] Uyari: IYZICO_API_KEY veya IYZICO_SECRET_KEY tanimli degil.');
}

const iyzipay = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY || '',
    secretKey: process.env.IYZICO_SECRET_KEY || '',
    uri: process.env.IYZICO_URI || 'https://sandbox-api.iyzipay.com',
});

module.exports = iyzipay;
