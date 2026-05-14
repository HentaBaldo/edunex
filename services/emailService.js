/**
 * EduNex Email Service
 *
 * Nodemailer tabanlı merkezi mail gönderim servisi.
 * Tüm mail türleri (doğrulama, şifre sıfırlama vb.) buradan yönetilir.
 *
 * Gerekli .env değişkenleri:
 *   EMAIL_USER    — Gmail adresi
 *   EMAIL_PASS    — Gmail uygulama şifresi (App Password; 2FA açık olmalı)
 *   FRONTEND_URL  — Doğrulama linki için temel URL. PRODUCTION'da ZORUNLU.
 *                   Tanımsızsa development'ta localhost'a düşer, production'da fail-loud.
 */

const nodemailer = require('nodemailer');

const isProduction = process.env.NODE_ENV === 'production';

// FRONTEND_URL kontrol — production'da yanlis URL ile mail gondermek
// kullaniciya kirik link gonderir; bu yuzden config-eksikligini erken yakaliyoruz.
if (isProduction && !process.env.FRONTEND_URL) {
    console.error('[EMAIL SERVICE] KRITIK: FRONTEND_URL .env tanimli degil — production ortaminda dogrulama linkleri kirik gidecek!');
}
const FRONTEND_URL = process.env.FRONTEND_URL
    || (isProduction ? null : 'http://localhost:3000');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS — Gmail 587 ile zorunlu
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // SSL sertifika dogrulamasi: production'da MUTLAKA aktif (MITM koruma).
    // Sadece localhost geliştirme ortamindaki self-signed cert sorunlarini bypass ediyoruz.
    tls: { rejectUnauthorized: isProduction },
    // Bağlantı asmama (hanging) koruması — Gmail cevap vermezse sistem kilitlenmez
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
});

// Sunucu ayağa kalktığında SMTP bağlantısını test et
transporter.verify()
    .then(() => console.log('[EMAIL SERVICE] SMTP Bağlantısı Hazır'))
    .catch(err => console.error('[EMAIL SERVICE] SMTP Hatası:', err.message));

const FROM_ADDRESS = `EduNex Academy <${process.env.EMAIL_USER}>`;

/**
 * E-posta doğrulama maili gönderir.
 * @param {string} to   — Alıcı e-posta adresi
 * @param {string} token — crypto.randomBytes ile üretilmiş hex token
 */
async function sendVerificationEmail(to, token) {
    if (!FRONTEND_URL) {
        // Production'da FRONTEND_URL eksikse mail göndermek anlamsız — kırık link gider.
        throw new Error('FRONTEND_URL .env tanimli degil; dogrulama maili gonderilemez.');
    }
    const verifyUrl = `${FRONTEND_URL}/api/auth/verify?token=${token}`;

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>E-posta Doğrulama</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Geleceğini şekillendiren eğitim platformu</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="color:#1e3a8a;font-size:22px;margin:0 0 16px;">Hesabınızı Doğrulayın</h2>
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                EduNex Academy'e hoş geldiniz! Hesabınızı aktifleştirmek ve platforma erişmek için
                aşağıdaki butona tıklayarak e-posta adresinizi doğrulayın.
              </p>
              <p style="color:#6b7280;font-size:13px;margin:0 0 32px;">
                Bu bağlantı <strong>24 saat</strong> geçerlidir.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                      Hesabımı Doğrula
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#9ca3af;font-size:12px;margin:32px 0 0;line-height:1.6;">
                Butona tıklayamıyor musunuz? Aşağıdaki bağlantıyı tarayıcınıza yapıştırın:<br />
                <a href="${verifyUrl}" style="color:#1e3a8a;word-break:break-all;">${verifyUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Bu e-postayı siz talep etmediyseniz güvenle görmezden gelebilirsiniz.<br />
                &copy; 2025 EduNex Academy. Tüm hakları saklıdır.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: FROM_ADDRESS,
        to,
        subject: 'EduNex Academy — E-posta Adresinizi Doğrulayın',
        html,
    });
}

module.exports = { sendVerificationEmail };
