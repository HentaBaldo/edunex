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
const { PassThrough } = require('stream');
const { streamOrderReceiptPdf } = require('./pdfService');

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
    // SMTP debug/logger sadece development'ta ac. Production'da log spam yaratir.
    debug: process.env.NODE_ENV !== 'production',
    logger: process.env.NODE_ENV !== 'production',
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

/**
 * Şifre sıfırlama maili gönderir.
 *
 * - HAM token'i URL'e gömerek mail'e koyar. (DB'de hash'lenmiş hali tutulur.)
 * - sendVerificationEmail ile AYNI hata-yutma kuralina tabi: caller akisini bloklamaz.
 * - Lacivert (#1e3a8a) + Altin Sarisi (#c9a84c) EduNex kurumsal kimlik renkleri.
 *
 * @param {string} to         — Alıcı e-posta adresi
 * @param {string} resetToken — crypto.randomBytes ile üretilmiş HAM hex token
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendPasswordResetEmail(to, resetToken) {
  try {
    if (!FRONTEND_URL) {
      const msg = 'FRONTEND_URL .env tanimli degil; sifre sifirlama maili gonderilemez.';
      console.error('[EMAIL SERVICE]', msg);
      return { ok: false, error: msg };
    }

    // Frontend route: kullanici buradan token + yeni sifreyi POST /api/auth/reset-password'e iletir.
    // Eger frontend bu sayfayi henuz olusturmadiysa /auth/index.html'e parametre olarak gider;
    // ekip ileride dedike bir reset sayfasi (orn: /auth/reset.html) eklerse sadece bu URL'i guncelleriz.
    const resetUrl = `${FRONTEND_URL}/auth/index.html?reset=${encodeURIComponent(resetToken)}`;

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Şifre Sıfırlama</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Hesap Güvenliği Bildirimi</p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="color:#1e3a8a;font-size:22px;margin:0 0 16px;">Şifre Sıfırlama Talebi</h2>
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                EduNex Academy hesabınız için bir şifre sıfırlama talebi aldık.
                Yeni şifrenizi belirlemek için aşağıdaki butona tıklayın.
              </p>
              <p style="color:#6b7280;font-size:13px;margin:0 0 32px;">
                Bu bağlantı <strong>1 saat</strong> süreyle geçerlidir.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                      Şifremi Sıfırla
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#9ca3af;font-size:12px;margin:32px 0 0;line-height:1.6;">
                Butona tıklayamıyor musunuz? Aşağıdaki bağlantıyı tarayıcınıza yapıştırın:<br />
                <a href="${resetUrl}" style="color:#1e3a8a;word-break:break-all;">${resetUrl}</a>
              </p>

              <div style="margin-top:32px;padding:16px 20px;background:#fef3c7;border-left:4px solid #c9a84c;border-radius:4px;">
                <p style="color:#78350f;font-size:13px;line-height:1.6;margin:0;">
                  <strong>Güvenlik Uyarısı:</strong> Bu işlemi siz başlatmadıysanız bu e-postayı
                  <strong>görmezden gelin</strong>. Şifreniz güvende kalır; hesabınızda herhangi
                  bir değişiklik yapılmaz. Bağlantı 1 saat sonra otomatik geçersiz olur.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Bu e-posta sadece bilgilendirme amaçlıdır. Lütfen bu adrese yanıt vermeyin.<br />
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
      subject: 'EduNex Academy — Şifre Sıfırlama Talebi',
      html,
    });
    return { ok: true };
  } catch (err) {
    // SMTP timeout/auth/network: caller akisini blokleme, sessizce log'la.
    console.error(`[EMAIL SERVICE] sendPasswordResetEmail(${to}) hatasi:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Fire-and-forget wrapper — Render Health Check (SIGTERM) tetiklenmesin diye
 * forgot-password akisinda BU kullanilmalidir. response hemen doner, mail bg'de gider.
 */
function sendPasswordResetEmailAsync(to, resetToken) {
  setImmediate(() => {
    sendPasswordResetEmail(to, resetToken)
      .then(result => {
        if (result.ok) console.log(`[EMAIL SERVICE] (bg) Sifre sifirlama maili gonderildi: ${to}`);
        else console.error(`[EMAIL SERVICE] (bg) Sifre sifirlama maili basarisiz (${to}): ${result.error}`);
      })
      .catch(err => console.error('Sifre Sifirlama Kuyruk Hatasi:', {
        to,
        name: err && err.name,
        code: err && err.code,
        command: err && err.command,
        message: err && err.message,
      }));
  });
}

// ──────────────────────────────────────────────────────────────
// ÖDEME SONRASI BİLDİRİM MAİLLERİ (Sektör Standardı)
// ──────────────────────────────────────────────────────────────
//
// İki ayrı muhatap, iki ayrı tasarım:
//   • Öğrenci -> "Siparişiniz Alındı" + PDF dekont eki
//   • Eğitmen -> "Yeni Bir Satış Yaptın" (KVKK gereği öğrenci PII yok)
//
// Her ikisi de transaction COMMIT'ten SONRA cagrılır ve fire-and-forget
// wrapper'ları üzerinden gönderilir; SMTP gecikmesi kullanıcıyı bekletemez.

const FRONTEND_BASE = FRONTEND_URL || (isProduction ? null : 'http://localhost:3000');

const _fmtTRY = (val) => {
    const n = Number(val || 0);
    return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
};

const _fmtDateTR = (iso) => {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
    } catch (_) {
        return String(iso);
    }
};

/**
 * Order Sequelize instance'ından bellek-içi PDF Buffer üretir.
 * Diske yazmaz; nodemailer.attachments[].content olarak doğrudan eklenir.
 *
 * order parametresi: Profile + OrderItems[Course] + PaymentTransactions
 * include edilmiş tam ilişkili instance olmalı (receiptController'daki
 * _loadOrderWithRelations sonucu ile aynı şekil).
 */
function _generateOrderReceiptBuffer(order) {
    return new Promise((resolve, reject) => {
        try {
            const stream = new PassThrough();
            const chunks = [];
            stream.on('data', (c) => chunks.push(c));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
            // streamOrderReceiptPdf zaten doc.end() çağırdığı için stream
            // kendiliğinden kapanır; biz sadece data/end olaylarını dinliyoruz.
            streamOrderReceiptPdf({ order, output: stream });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Öğrenciye sipariş onay maili — PDF dekont eki ile.
 *
 * @param {object} student     — { ad, soyad, eposta } (alıcı)
 * @param {object} order       — Profile + OrderItems[Course] + PaymentTransactions include edilmiş Sequelize Order instance
 * @param {Array}  orderItems  — [{ baslik, odenen_fiyat }] (HTML gövdesinde listelenecek kalemler)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendStudentOrderConfirmation(student, order, orderItems) {
    try {
        if (!student?.eposta) {
            return { ok: false, error: 'Öğrenci e-posta adresi yok.' };
        }
        if (!order) {
            return { ok: false, error: 'Order verisi yok.' };
        }

        const myCoursesUrl = `${FRONTEND_BASE || ''}/student/dashboard.html`;
        const ogrenciAd = (student.ad || '').trim() || 'Değerli Öğrencimiz';
        const items = Array.isArray(orderItems) ? orderItems : [];

        // PDF üret — başarısız olursa maili yine de gönder (eksik ek > eksik mail).
        // Kullanıcı PDF'ini her zaman GET /api/receipts/download/:orderId üzerinden de indirebilir.
        let pdfBuffer = null;
        try {
            pdfBuffer = await _generateOrderReceiptBuffer(order);
        } catch (pdfErr) {
            console.error(`[EMAIL SERVICE] PDF eki üretilemedi (order=${order.id}):`, pdfErr.message);
        }

        const itemRowsHtml = items.length
            ? items.map(it => `
                <tr>
                    <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">
                        ${(it.baslik || 'Kurs').replace(/</g, '&lt;')}
                    </td>
                    <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#1e3a8a;font-size:14px;font-weight:600;text-align:right;white-space:nowrap;">
                        ${_fmtTRY(it.odenen_fiyat)}
                    </td>
                </tr>
            `).join('')
            : `<tr><td colspan="2" style="padding:12px 0;color:#6b7280;font-size:13px;">Sipariş kalemi bulunamadı.</td></tr>`;

        const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sipariş Onayı</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Siparişiniz Başarıyla Alındı!</p>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 40px 8px;">
              <h2 style="color:#1e3a8a;font-size:22px;margin:0 0 12px;">Teşekkürler, ${ogrenciAd.replace(/</g, '&lt;')}!</h2>
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 8px;">
                Ödemeniz başarıyla tamamlandı ve aldığınız kurslara erişiminiz aktif hale geldi.
                Aşağıda sipariş özetinizi bulabilirsiniz; detaylı dekont bu e-postanın
                <strong>PDF eki</strong> olarak gönderilmiştir.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 18px;margin-top:8px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Sipariş No</td>
                  <td style="color:#1e3a8a;font-size:13px;font-weight:600;text-align:right;">${String(order.id || '-').replace(/</g, '&lt;')}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:6px;">Tarih</td>
                  <td style="color:#0f172a;font-size:13px;text-align:right;padding-top:6px;">${_fmtDateTR(order.olusturulma_tarihi)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 0;">
              <h3 style="color:#0f172a;font-size:15px;margin:0 0 8px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;">Sipariş Kalemleri</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemRowsHtml}
                <tr>
                  <td style="padding:14px 0 0;color:#0f172a;font-size:15px;font-weight:700;">Toplam</td>
                  <td style="padding:14px 0 0;color:#c9a84c;font-size:18px;font-weight:700;text-align:right;">${_fmtTRY(order.toplam_tutar)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${myCoursesUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                      Eğitime Hemen Başla
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:18px 0 0;text-align:center;">
                Bağlantı çalışmıyorsa: <a href="${myCoursesUrl}" style="color:#1e3a8a;word-break:break-all;">${myCoursesUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 0;">
              <div style="background:#fef3c7;border-left:4px solid #c9a84c;border-radius:4px;padding:14px 16px;">
                <p style="color:#78350f;font-size:13px;line-height:1.6;margin:0;">
                  <strong>İade Hakkınız:</strong> Sipariş tarihinden itibaren <strong>14 gün</strong> içinde
                  ve kurs ilerlemeniz <strong>%20'nin altında</strong> ise iade talebinde bulunabilirsiniz.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;margin-top:24px;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Sorularınız için: destek@edunex.com<br />
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

        const mailOptions = {
            from: FROM_ADDRESS,
            to: student.eposta,
            subject: `EduNex Academy — Sipariş Onayınız (#${String(order.id || '').slice(0, 8)})`,
            html,
        };

        if (pdfBuffer && pdfBuffer.length > 0) {
            const safeId = String(order.id || 'siparis').replace(/[^a-zA-Z0-9_-]/g, '');
            mailOptions.attachments = [{
                filename: `EduNex_Dekont_${safeId}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            }];
        }

        await transporter.sendMail(mailOptions);
        return { ok: true };
    } catch (err) {
        console.error(`[EMAIL SERVICE] sendStudentOrderConfirmation(${student?.eposta}) hatasi:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Eğitmene satış bildirimi maili. KVKK: öğrenci adı/eposta YOK.
 *
 * @param {object} instructor — { ad, soyad, eposta }
 * @param {string} courseName — Satılan kursun başlığı
 * @param {number|string} netEarning — Platform komisyonu düşülmüş NET kazanç (TRY)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendInstructorSaleNotification(instructor, courseName, netEarning) {
    try {
        if (!instructor?.eposta) {
            return { ok: false, error: 'Eğitmen e-posta adresi yok.' };
        }

        const salesUrl = `${FRONTEND_BASE || ''}/instructor/sales-history.html`;
        const egitmenAd = (instructor.ad || '').trim() || 'Değerli Eğitmenimiz';
        const kursAdiSafe = String(courseName || 'Kursunuz').replace(/</g, '&lt;');

        const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Yeni Satış Bildirimi</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Eğitmen Paneli — Satış Bildirimi</p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 40px 16px;text-align:center;">
              <div style="font-size:56px;line-height:1;margin-bottom:12px;">&#127881;</div>
              <h2 style="color:#1e3a8a;font-size:24px;margin:0 0 8px;">Tebrikler, ${egitmenAd.replace(/</g, '&lt;')}!</h2>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0;">
                Yeni bir satış yaptınız &mdash; emekleriniz karşılığını buluyor!
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:8px;">Satılan Kurs</td>
                </tr>
                <tr>
                  <td style="color:#0f172a;font-size:16px;font-weight:600;line-height:1.5;padding-bottom:18px;border-bottom:1px dashed #cbd5e1;">
                    ${kursAdiSafe}
                  </td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:18px;padding-bottom:6px;">Net Kazancınız</td>
                </tr>
                <tr>
                  <td style="color:#059669;font-size:28px;font-weight:800;letter-spacing:0.5px;">
                    ${_fmtTRY(netEarning)}
                  </td>
                </tr>
                <tr>
                  <td style="color:#9ca3af;font-size:11px;padding-top:8px;line-height:1.5;">
                    Platform komisyonu düşülmüş, size ait net tutardır. Net hak ediş, 14 günlük iade
                    penceresi kapandıktan sonra ödemeye uygun (available) duruma geçer.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${salesUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                      Satış Raporunu İncele
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:18px 0 0;text-align:center;">
                Bağlantı çalışmıyorsa: <a href="${salesUrl}" style="color:#1e3a8a;word-break:break-all;">${salesUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;margin-top:24px;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Bu bildirim, KVKK gereği öğrenci kimlik bilgisi içermez.<br />
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
            to: instructor.eposta,
            subject: 'EduNex Academy — Tebrikler, yeni bir satış yaptınız!',
            html,
        });
        return { ok: true };
    } catch (err) {
        console.error(`[EMAIL SERVICE] sendInstructorSaleNotification(${instructor?.eposta}) hatasi:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Fire-and-forget wrapper'lar — Render Health Check (SIGTERM) tetiklenmesin
 * diye callback akışında BU kullanılmalıdır. Caller response'u beklemez.
 */
function sendStudentOrderConfirmationAsync(student, order, orderItems) {
    setImmediate(() => {
        sendStudentOrderConfirmation(student, order, orderItems)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Sipariş onay maili gönderildi: ${student?.eposta} (order=${order?.id})`);
                else console.error(`[EMAIL SERVICE] (bg) Sipariş onay maili basarisiz (${student?.eposta}): ${result.error}`);
            })
            .catch(err => console.error('Sipariş Mail Kuyruk Hatasi:', {
                to: student?.eposta,
                order_id: order?.id,
                name: err && err.name,
                code: err && err.code,
                message: err && err.message,
            }));
    });
}

function sendInstructorSaleNotificationAsync(instructor, courseName, netEarning) {
    setImmediate(() => {
        sendInstructorSaleNotification(instructor, courseName, netEarning)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Eğitmen satış maili gönderildi: ${instructor?.eposta}`);
                else console.error(`[EMAIL SERVICE] (bg) Eğitmen satış maili basarisiz (${instructor?.eposta}): ${result.error}`);
            })
            .catch(err => console.error('Eğitmen Mail Kuyruk Hatasi:', {
                to: instructor?.eposta,
                name: err && err.name,
                code: err && err.code,
                message: err && err.message,
            }));
    });
}

module.exports = {
  sendVerificationEmail,
  sendVerificationEmailAsync,
  sendPasswordResetEmail,
  sendPasswordResetEmailAsync,
  sendStudentOrderConfirmation,
  sendStudentOrderConfirmationAsync,
  sendInstructorSaleNotification,
  sendInstructorSaleNotificationAsync,
};