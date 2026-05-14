/**
 * EduNex Email Service
 *
 * Nodemailer tabanlı merkezi mail gönderim servisi.
 * Saglayicidan bagimsiz (Brevo / SendGrid / Mailgun / Gmail) calisir —
 * tum SMTP parametreleri .env'den okunur.
 *
 * Gerekli .env değişkenleri:
 * EMAIL_HOST    — SMTP host (varsayilan: smtp-relay.brevo.com)
 * EMAIL_PORT    — SMTP port (Render engellerini asmak icin 2525 onerilir)
 * EMAIL_USER    — SMTP kullanici adi (Brevo'da: hesap login eposta)
 * EMAIL_PASS    — SMTP sifresi / API key (Brevo'da: SMTP key)
 * EMAIL_FROM    — Gonderici adresi (opsiyonel; bos ise EMAIL_USER kullanilir)
 * FRONTEND_URL  — Doğrulama linki için temel URL. PRODUCTION'da ZORUNLU.
 * Tanımsızsa development'ta localhost'a düşer, production'da fail-loud.
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

// === SMTP TRANSPORTER (saglayici-agnostik) ===
//
// Tum baglanti parametreleri .env'den okunur. 
//
// Port secimi ve Render Engeli (ÖNEMLİ):
//   - 2525 -> STARTTLS. Render vb. bulut sunuculari 587 portunu spam korumasi
//             nedeniyle disari kapatir (Connection Timeout verir). Bu engeli
//             asmak icin arka kapi olan 2525 portu kullanilmalidir.
//   - 587  -> STARTTLS (secure=false, requireTLS=true)
//   - 465  -> SSL implicit (secure=true)
//
// pool: true — Bulutta kisa-omurlu socket'ler "socket hang up" hatasi verir;
// keep-alive havuzu her mailde yeni TCP handshake'i ortadan kaldirir.
//
// family: 4 — Render gibi hostlarda IPv6 cikis yolu kapali oldugu icin Node
// AAAA kaydini deneyince "connect ENETUNREACH" alir. IPv4'u zorluyoruz.
//
// rejectUnauthorized: false — Bazi proxy/host'larda intermediate sertifika
// eksikligi baglantiyi koparmasin diye gevsetildi.
//
// Timeout'lar 10sn x 3 — sessiz asilmayi (silent drop) engeller; mail
// kuyrugu zaten arka planda calistigi icin istemci akisini bloklamaz.
const SMTP_HOST = process.env.EMAIL_HOST || 'smtp-relay.brevo.com';
const SMTP_PORT = Number.parseInt(process.env.EMAIL_PORT, 10) || 2525;
const SMTP_SECURE = SMTP_PORT === 465; // 465 implicit SSL; diger tum portlarda (587, 2525) STARTTLS gecerli

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: !SMTP_SECURE, // STARTTLS modunda TLS yukseltmesi zorunlu — cleartext'e dusmesin
    pool: true,
    family: 4,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    debug: true,
    logger: true,
});

console.log(`[EMAIL SERVICE] SMTP transport hazirlaniyor: ${SMTP_HOST}:${SMTP_PORT} (${SMTP_SECURE ? 'SSL' : 'STARTTLS'})`);

// Sunucu ayağa kalktığında SMTP bağlantısını test et
transporter.verify()
    .then(() => console.log('[EMAIL SERVICE] SMTP Bağlantısı Hazır'))
    .catch(err => console.error('[EMAIL SERVICE] SMTP Hatası:', err.message));

// EMAIL_FROM tanimliysa onu kullan (Brevo'da SMTP login != gonderici eposta olabilir).
// Aksi halde EMAIL_USER'i fallback olarak kullan.
const FROM_ADDRESS = `EduNex Academy <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;

/**
 * E-posta doğrulama maili gönderir.
 *
 * ÖNEMLI: Bu fonksiyon ASLA throw etmez ve register/resend gibi ana iş akışını
 * bloklamaz. Hata durumunda { ok: false, error } doner, caller log'lar.
 *
 * @param {string} to    — Alıcı e-posta adresi
 * @param {string} token — crypto.randomBytes ile üretilmiş hex token
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendVerificationEmail(to, token) {
  try {
    if (!FRONTEND_URL) {
        // Production'da FRONTEND_URL eksikse mail göndermek anlamsız — kırık link gider.
        const msg = 'FRONTEND_URL .env tanimli degil; dogrulama maili gonderilemez.';
        console.error('[EMAIL SERVICE]', msg);
        return { ok: false, error: msg };
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

          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Geleceğini şekillendiren eğitim platformu</p>
            </td>
          </tr>

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

          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Bu e-postayı siz talep etmediyseniz güvenle görmezden gelebilirsiniz.<br />
                &copy; 2026 EduNex Academy. Tüm hakları saklıdır.
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
    return { ok: true };
  } catch (err) {
    // SMTP timeout / auth / network — register asla bloklanmasin diye yutuyoruz.
    console.error(`[EMAIL SERVICE] sendVerificationEmail(${to}) hatasi:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Fire-and-forget wrapper: maili arka planda gonderir, caller bekletmez.
 * Render Health Check'in (SIGTERM) tetiklenmemesi icin register/resend
 * akislarinda BU kullanilmali — await edilmez, response hemen doner.
 *
 * sendVerificationEmail zaten throw etmiyor; yine de garantili olsun diye
 * .catch ile sariliyor (unhandled rejection riskini sifirlamak icin).
 */
function sendVerificationEmailAsync(to, token) {
    setImmediate(() => {
        // Iki katmanli koruma:
        //   1) sendVerificationEmail icindeki try/catch zaten throw etmiyor.
        //   2) Buradaki .catch ise olasi bir "unhandled promise rejection" durumunda
        //      (ornegin sendMail icindeki bir sync hata, transporter pool kapanma vs.)
        //      sessizce yutulmasin diye SON hat. Render'da loglarda gorebiliyoruz.
        sendVerificationEmail(to, token)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Mail gonderildi: ${to}`);
                else console.error(`[EMAIL SERVICE] (bg) Mail basarisiz (${to}): ${result.error}`);
            })
            .catch(err => console.error('Kuyruk Hatası:', {
                to,
                name: err && err.name,
                code: err && err.code,
                command: err && err.command,
                message: err && err.message,
                stack: err && err.stack,
            }));
    });
}

module.exports = { sendVerificationEmail, sendVerificationEmailAsync };