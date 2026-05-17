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
        const aliciAdSoyad = [student.ad, student.soyad]
            .filter(Boolean)
            .map(s => String(s).trim())
            .join(' ') || ogrenciAd;
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
            ? items.map(it => {
                const egitmenAdSoyad = [it.egitmen_ad, it.egitmen_soyad]
                    .filter(Boolean)
                    .map(s => String(s).trim())
                    .join(' ');
                const egitmenSatiri = egitmenAdSoyad
                    ? `<div style="color:#6b7280;font-size:12px;margin-top:4px;">Eğitmen: <span style="color:#1e3a8a;font-weight:600;">${egitmenAdSoyad.replace(/</g, '&lt;')}</span></div>`
                    : '';
                return `
                <tr>
                    <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;">
                        <div style="font-weight:600;color:#0f172a;">${(it.baslik || 'Kurs').replace(/</g, '&lt;')}</div>
                        ${egitmenSatiri}
                    </td>
                    <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#1e3a8a;font-size:14px;font-weight:600;text-align:right;white-space:nowrap;vertical-align:top;">
                        ${_fmtTRY(it.odenen_fiyat)}
                    </td>
                </tr>
            `;
            }).join('')
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
                <strong>Siparişiniz başarıyla tamamlandı.</strong> İşlem detaylarınızı aşağıda
                ve ekteki <strong>PDF dekontunda</strong> bulabilirsiniz. Satın aldığınız
                kurslara erişiminiz şu an aktif hale geldi.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 18px;margin-top:8px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;width:45%;">Sipariş No</td>
                  <td style="color:#1e3a8a;font-size:13px;font-weight:600;text-align:right;word-break:break-all;">${String(order.id || '-').replace(/</g, '&lt;')}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:8px;">İşlem Tarihi</td>
                  <td style="color:#0f172a;font-size:13px;text-align:right;padding-top:8px;">${_fmtDateTR(order.olusturulma_tarihi)}</td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:8px;">Alıcı</td>
                  <td style="color:#0f172a;font-size:13px;text-align:right;padding-top:8px;">
                    ${aliciAdSoyad.replace(/</g, '&lt;')}
                  </td>
                </tr>
                ${student.eposta ? `
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:8px;">E-posta</td>
                  <td style="color:#0f172a;font-size:13px;text-align:right;padding-top:8px;word-break:break-all;">${String(student.eposta).replace(/</g, '&lt;')}</td>
                </tr>
                ` : ''}
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

// ──────────────────────────────────────────────────────────────
// ÖĞRENCİ ETKİLEŞİM (ENGAGEMENT) MAİLLERİ — Görev 22
// ──────────────────────────────────────────────────────────────
//
// Üç tetikleyici mail:
//   • sendLiveClassNotification — Takip edilen eğitmen canlı ders açtığında
//   • sendNewCourseNotification — Takip edilen eğitmen yeni kurs yayınladığında
//   • sendCertificateEmail      — Öğrenci kursu tamamlayıp sertifikayı kazandığında (PDF ekli)
//
// Hepsi caller akışını bloklamayan fire-and-forget wrapper'larla kullanılır;
// SMTP gecikmesi ana operasyona (canlı ders yaratma, admin onay, sertifika üretimi) yansımaz.
// Verification/PasswordReset/OrderConfirmation pattern'ı birebir korunmuştur.

const _safe = (val) => String(val == null ? '' : val).replace(/</g, '&lt;');

/**
 * Takipçi öğrenciye: takip ettiği eğitmen yeni canlı ders planladı.
 *
 * @param {object} student     — { ad, soyad, eposta }
 * @param {object} instructor  — { id, ad, soyad }
 * @param {object} session     — { id, baslik, aciklama?, baslangic_tarihi, sure_dakika?, yayin_tipi, kurs_id? }
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendLiveClassNotification(student, instructor, session) {
    try {
        if (!student?.eposta) return { ok: false, error: 'Öğrenci e-posta adresi yok.' };
        if (!session?.id) return { ok: false, error: 'Canlı ders verisi eksik.' };

        const ogrenciAd = (student.ad || '').trim() || 'Değerli Öğrencimiz';
        const egitmenAdSoyad = [instructor?.ad, instructor?.soyad].filter(Boolean).join(' ').trim() || 'Eğitmeniniz';

        // Tip-bazlı yönlendirme — liveSessionController'daki notification mantığıyla aynı:
        //   kursa_ozel -> kurs detayı | genel -> eğitmen profili
        const linkPath = (session.yayin_tipi === 'kursa_ozel' && session.kurs_id)
            ? `/main/course-detail.html?id=${encodeURIComponent(session.kurs_id)}`
            : `/main/instructor-profile.html?id=${encodeURIComponent(instructor?.id || '')}`;
        const ctaUrl = `${FRONTEND_BASE || ''}${linkPath}`;

        const tarihStr = _fmtDateTR(session.baslangic_tarihi);
        const sureStr = session.sure_dakika ? `${session.sure_dakika} dakika` : '';
        const aciklamaBloku = session.aciklama
            ? `<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">${_safe(session.aciklama).slice(0, 500)}</p>`
            : '';

        const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Yeni Canlı Ders</title></head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Takip Ettiğiniz Eğitmenden Yeni Canlı Ders</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 16px;">
              <h2 style="color:#1e3a8a;font-size:22px;margin:0 0 12px;">Merhaba ${_safe(ogrenciAd)},</h2>
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                Takip ettiğiniz <strong>${_safe(egitmenAdSoyad)}</strong> yeni bir canlı ders planladı.
                Koltuğunuzu erken ayırtmak için ders sayfasını ziyaret edebilirsiniz.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">Ders Başlığı</td>
                </tr>
                <tr>
                  <td style="color:#0f172a;font-size:16px;font-weight:600;padding-bottom:14px;border-bottom:1px dashed #cbd5e1;">
                    ${_safe(session.baslik)}
                  </td>
                </tr>
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:14px;padding-bottom:4px;">Başlangıç</td>
                </tr>
                <tr>
                  <td style="color:#1e3a8a;font-size:14px;font-weight:600;">
                    ${_safe(tarihStr)} ${sureStr ? `<span style="color:#6b7280;font-weight:400;"> • ${_safe(sureStr)}</span>` : ''}
                  </td>
                </tr>
              </table>
              ${aciklamaBloku ? `<div style="margin-top:18px;">${aciklamaBloku}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center">
                  <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                    Dersi Görüntüle
                  </a>
                </td></tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:18px 0 0;text-align:center;">
                Bağlantı çalışmıyorsa: <a href="${ctaUrl}" style="color:#1e3a8a;word-break:break-all;">${ctaUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Bu bildirimi takip ettiğiniz eğitmenden aldınız. Takipten çıkarsanız bu mailleri durdurabilirsiniz.<br />
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
            to: student.eposta,
            subject: `EduNex Academy — ${egitmenAdSoyad} yeni bir canlı ders açtı`,
            html,
        });
        return { ok: true };
    } catch (err) {
        console.error(`[EMAIL SERVICE] sendLiveClassNotification(${student?.eposta}) hatasi:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Takipçi öğrenciye: takip ettiği eğitmen yeni bir kurs yayınladı.
 *
 * @param {object} student     — { ad, soyad, eposta }
 * @param {object} instructor  — { id, ad, soyad }
 * @param {object} course      — { id, baslik, alt_baslik?, fiyat? }
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendNewCourseNotification(student, instructor, course) {
    try {
        if (!student?.eposta) return { ok: false, error: 'Öğrenci e-posta adresi yok.' };
        if (!course?.id) return { ok: false, error: 'Kurs verisi eksik.' };

        const ogrenciAd = (student.ad || '').trim() || 'Değerli Öğrencimiz';
        const egitmenAdSoyad = [instructor?.ad, instructor?.soyad].filter(Boolean).join(' ').trim() || 'Eğitmeniniz';
        const ctaUrl = `${FRONTEND_BASE || ''}/main/course-detail.html?id=${encodeURIComponent(course.id)}`;
        const fiyatBloku = course.fiyat != null && Number(course.fiyat) > 0
            ? `<tr>
                <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:14px;padding-bottom:4px;">Fiyat</td>
               </tr>
               <tr>
                <td style="color:#059669;font-size:18px;font-weight:700;">${_fmtTRY(course.fiyat)}</td>
               </tr>`
            : '';
        const altBaslikBloku = course.alt_baslik
            ? `<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">${_safe(course.alt_baslik).slice(0, 300)}</p>`
            : '';

        const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Yeni Kurs</title></head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Takip Ettiğiniz Eğitmenden Yeni Kurs</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 16px;">
              <h2 style="color:#1e3a8a;font-size:22px;margin:0 0 12px;">Merhaba ${_safe(ogrenciAd)},</h2>
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                Takip ettiğiniz <strong>${_safe(egitmenAdSoyad)}</strong> yeni bir kurs yayınladı.
                Hemen göz atıp ilk öğrencilerden biri olabilirsiniz.
              </p>
              ${altBaslikBloku}
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">Kurs Başlığı</td>
                </tr>
                <tr>
                  <td style="color:#0f172a;font-size:16px;font-weight:600;padding-bottom:14px;border-bottom:1px dashed #cbd5e1;">
                    ${_safe(course.baslik)}
                  </td>
                </tr>
                ${fiyatBloku}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center">
                  <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                    Kursu İncele
                  </a>
                </td></tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:18px 0 0;text-align:center;">
                Bağlantı çalışmıyorsa: <a href="${ctaUrl}" style="color:#1e3a8a;word-break:break-all;">${ctaUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Bu bildirimi takip ettiğiniz eğitmenden aldınız.<br />
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
            to: student.eposta,
            subject: `EduNex Academy — ${egitmenAdSoyad} yeni bir kurs yayınladı`,
            html,
        });
        return { ok: true };
    } catch (err) {
        console.error(`[EMAIL SERVICE] sendNewCourseNotification(${student?.eposta}) hatasi:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Öğrenciye sertifika maili — PDF eki ile birlikte.
 *
 * @param {object} student        — { ad, soyad, eposta }
 * @param {string} courseName     — Tamamlanan kursun başlığı
 * @param {string} certificateCode — Sertifika UUID kodu
 * @param {Buffer} pdfBuffer      — Sertifika PDF içeriği (Buffer). Yoksa mail PDF eki olmadan gider.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendCertificateEmail(student, courseName, certificateCode, pdfBuffer) {
    try {
        if (!student?.eposta) return { ok: false, error: 'Öğrenci e-posta adresi yok.' };
        if (!certificateCode) return { ok: false, error: 'Sertifika kodu yok.' };

        const ogrenciAd = (student.ad || '').trim() || 'Değerli Öğrencimiz';
        const aliciAdSoyad = [student.ad, student.soyad].filter(Boolean).join(' ').trim() || ogrenciAd;
        const kursBaslik = String(courseName || 'Kurs').trim() || 'Kurs';
        const certUrl = `${FRONTEND_BASE || ''}/api/certificates/${encodeURIComponent(certificateCode)}/pdf`;

        const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Sertifikanız Hazır</title></head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Başarınızı Kutluyoruz!</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 8px;text-align:center;">
              <div style="font-size:56px;line-height:1;margin-bottom:12px;">&#127891;</div>
              <h2 style="color:#1e3a8a;font-size:24px;margin:0 0 8px;">Tebrikler, ${_safe(aliciAdSoyad)}!</h2>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0;">
                <strong>${_safe(kursBaslik)}</strong> kursunu başarıyla tamamladınız.
                Hak ettiğiniz sertifikanız bu e-postanın <strong>PDF eki</strong> olarak iletilmiştir.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">Sertifika Kodu</td>
                </tr>
                <tr>
                  <td style="color:#0f172a;font-size:14px;font-weight:600;font-family:'Courier New',monospace;word-break:break-all;">
                    ${_safe(certificateCode)}
                  </td>
                </tr>
                <tr>
                  <td style="color:#9ca3af;font-size:11px;padding-top:8px;line-height:1.5;">
                    Sertifikanızın geçerliliği bu kodla doğrulanır. İşveren veya kurumlar
                    bu kodu sistemimizden teyit edebilir.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center">
                  <a href="${certUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                    Sertifikamı Görüntüle
                  </a>
                </td></tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:18px 0 0;text-align:center;">
                Bağlantı çalışmıyorsa: <a href="${certUrl}" style="color:#1e3a8a;word-break:break-all;">${certUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;margin-top:24px;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Bu başarınızı LinkedIn'de paylaşmayı unutmayın!<br />
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
            subject: `EduNex Academy — Tebrikler! "${kursBaslik}" Sertifikanız Hazır`,
            html,
        };

        if (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
            const safeCode = String(certificateCode).replace(/[^a-zA-Z0-9_-]/g, '');
            mailOptions.attachments = [{
                filename: `EduNex_Sertifika_${safeCode}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            }];
        }

        await transporter.sendMail(mailOptions);
        return { ok: true };
    } catch (err) {
        console.error(`[EMAIL SERVICE] sendCertificateEmail(${student?.eposta}) hatasi:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Fire-and-forget wrapper'lar — caller akışı bloklanmaz.
 * Tüm setImmediate + .then/.catch yapısı diğer Async wrapper'larla bire bir aynı tutuldu.
 */
function sendLiveClassNotificationAsync(student, instructor, session) {
    setImmediate(() => {
        sendLiveClassNotification(student, instructor, session)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Canli ders maili gonderildi: ${student?.eposta} (session=${session?.id})`);
                else console.error(`[EMAIL SERVICE] (bg) Canli ders maili basarisiz (${student?.eposta}): ${result.error}`);
            })
            .catch(err => console.error('Canli Ders Mail Kuyruk Hatasi:', {
                to: student?.eposta,
                session_id: session?.id,
                name: err && err.name,
                code: err && err.code,
                message: err && err.message,
            }));
    });
}

function sendNewCourseNotificationAsync(student, instructor, course) {
    setImmediate(() => {
        sendNewCourseNotification(student, instructor, course)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Yeni kurs maili gonderildi: ${student?.eposta} (course=${course?.id})`);
                else console.error(`[EMAIL SERVICE] (bg) Yeni kurs maili basarisiz (${student?.eposta}): ${result.error}`);
            })
            .catch(err => console.error('Yeni Kurs Mail Kuyruk Hatasi:', {
                to: student?.eposta,
                course_id: course?.id,
                name: err && err.name,
                code: err && err.code,
                message: err && err.message,
            }));
    });
}

function sendCertificateEmailAsync(student, courseName, certificateCode, pdfBuffer) {
    setImmediate(() => {
        sendCertificateEmail(student, courseName, certificateCode, pdfBuffer)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Sertifika maili gonderildi: ${student?.eposta} (cert=${certificateCode})`);
                else console.error(`[EMAIL SERVICE] (bg) Sertifika maili basarisiz (${student?.eposta}): ${result.error}`);
            })
            .catch(err => console.error('Sertifika Mail Kuyruk Hatasi:', {
                to: student?.eposta,
                cert_kodu: certificateCode,
                name: err && err.name,
                code: err && err.code,
                message: err && err.message,
            }));
    });
}

// ──────────────────────────────────────────────────────────────
// EĞİTMEN ODAKLI KURS DURUM MAİLLERİ — Görev 23
// ──────────────────────────────────────────────────────────────
//
// Üç tetikleyici mail:
//   • sendCourseApprovedEmail — Admin kursu onayladığında (onay_bekliyor / taslak / arsiv -> yayinda)
//   • sendCourseDraftedEmail  — Admin yayindaki kursu taslağa çektiğinde (yayinda -> taslak, iade_sebebi ile)
//   • sendCourseRejectedEmail — Admin onay bekleyen kursu reddettiğinde (red_sebebi + ticket ile)
//
// Hepsi caller akışını bloklamayan fire-and-forget wrapper'larla kullanılır;
// admin yüzlerce kursu toplu onaylasa bile SMTP gecikmesi paneli kilitlemez.

/**
 * Eğitmene: kursunuz yayına alındı.
 *
 * @param {object} instructor — { ad, soyad, eposta }
 * @param {object} course     — { id, baslik }
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendCourseApprovedEmail(instructor, course) {
    try {
        if (!instructor?.eposta) return { ok: false, error: 'Eğitmen e-posta adresi yok.' };
        if (!course?.id) return { ok: false, error: 'Kurs verisi eksik.' };

        const egitmenAd = (instructor.ad || '').trim() || 'Değerli Eğitmenimiz';
        const kursBaslikSafe = _safe(course.baslik || 'Kursunuz');
        const ctaUrl = `${FRONTEND_BASE || ''}/main/course-detail.html?id=${encodeURIComponent(course.id)}`;
        const dashUrl = `${FRONTEND_BASE || ''}/instructor/dashboard.html`;

        const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Kursunuz Yayında!</title></head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Eğitmen Paneli — Kurs Onay Bildirimi</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 8px;text-align:center;">
              <div style="font-size:56px;line-height:1;margin-bottom:12px;">&#127881;</div>
              <h2 style="color:#1e3a8a;font-size:24px;margin:0 0 8px;">Tebrikler, ${_safe(egitmenAd)}!</h2>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0;">
                Kursunuz <strong>yayına alındı</strong> ve şu an tüm öğrencilerin erişimine açık.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">Yayına Alınan Kurs</td>
                </tr>
                <tr>
                  <td style="color:#0f172a;font-size:16px;font-weight:600;line-height:1.5;">
                    ${kursBaslikSafe}
                  </td>
                </tr>
                <tr>
                  <td style="color:#9ca3af;font-size:11px;padding-top:10px;line-height:1.5;">
                    Kursunuz arama sonuçlarında, kategorinizde ve takipçilerinize bildirim olarak görünmeye başlamıştır.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center">
                  <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                    Kursu Görüntüle
                  </a>
                </td></tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:18px 0 0;text-align:center;">
                Eğitmen panelinize gitmek için: <a href="${dashUrl}" style="color:#1e3a8a;word-break:break-all;">${dashUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;margin-top:24px;">
              <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
                Bu bildirim admin onay aksiyonunun sonucudur.<br />
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
            subject: `EduNex Academy — Tebrikler! "${String(course.baslik || '').slice(0, 80)}" yayına alındı`,
            html,
        });
        return { ok: true };
    } catch (err) {
        console.error(`[EMAIL SERVICE] sendCourseApprovedEmail(${instructor?.eposta}) hatasi:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Eğitmene: kursunuz taslağa çekildi (admin tarafından iade).
 *
 * @param {object} instructor — { ad, soyad, eposta }
 * @param {object} course     — { id, baslik }
 * @param {string} reason     — Admin'in iade gerekçesi (iade_sebebi)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendCourseDraftedEmail(instructor, course, reason) {
    try {
        if (!instructor?.eposta) return { ok: false, error: 'Eğitmen e-posta adresi yok.' };
        if (!course?.id) return { ok: false, error: 'Kurs verisi eksik.' };

        const egitmenAd = (instructor.ad || '').trim() || 'Değerli Eğitmenimiz';
        const kursBaslikSafe = _safe(course.baslik || 'Kursunuz');
        const editUrl = `${FRONTEND_BASE || ''}/instructor/edit-course.html?id=${encodeURIComponent(course.id)}`;
        const sebepMetni = String(reason || '').trim();
        const sebepBloku = sebepMetni
            ? `
            <tr>
              <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:14px;padding-bottom:6px;">Admin Notu</td>
            </tr>
            <tr>
              <td style="color:#0f172a;font-size:14px;line-height:1.6;white-space:pre-wrap;">
                ${_safe(sebepMetni).slice(0, 1500)}
              </td>
            </tr>`
            : '';

        const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Kursunuz Taslağa Alındı</title></head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Eğitmen Paneli — Kurs Durum Güncellemesi</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 16px;">
              <h2 style="color:#1e3a8a;font-size:22px;margin:0 0 12px;">Merhaba ${_safe(egitmenAd)},</h2>
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                Kursunuz <strong>yayından kaldırılarak taslak durumuna</strong> alındı.
                Aşağıdaki notu inceleyerek eksiklikleri giderebilir, kursunuzu güncelleyip yeniden onaya gönderebilirsiniz.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">Etkilenen Kurs</td>
                </tr>
                <tr>
                  <td style="color:#0f172a;font-size:16px;font-weight:600;line-height:1.5;${sebepBloku ? 'padding-bottom:14px;border-bottom:1px dashed #cbd5e1;' : ''}">
                    ${kursBaslikSafe}
                  </td>
                </tr>
                ${sebepBloku}
              </table>
              <div style="margin-top:18px;padding:14px 16px;background:#fef3c7;border-left:4px solid #c9a84c;border-radius:4px;">
                <p style="color:#78350f;font-size:13px;line-height:1.6;margin:0;">
                  <strong>Not:</strong> Bu süre boyunca öğrenciler kursu satın alamaz; kursunuz arama sonuçlarında görünmez.
                  Mevcut öğrencilerin erişimi etkilenmez.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center">
                  <a href="${editUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                    Kursu Düzenle
                  </a>
                </td></tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:18px 0 0;text-align:center;">
                Bağlantı çalışmıyorsa: <a href="${editUrl}" style="color:#1e3a8a;word-break:break-all;">${editUrl}</a>
              </p>
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

        await transporter.sendMail({
            from: FROM_ADDRESS,
            to: instructor.eposta,
            subject: `EduNex Academy — "${String(course.baslik || '').slice(0, 80)}" kursunuz taslağa alındı`,
            html,
        });
        return { ok: true };
    } catch (err) {
        console.error(`[EMAIL SERVICE] sendCourseDraftedEmail(${instructor?.eposta}) hatasi:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Eğitmene: kursunuz reddedildi (onay bekleyen kurs, red_sebebi ile).
 *
 * @param {object} instructor — { ad, soyad, eposta }
 * @param {object} course     — { id, baslik }
 * @param {string} reason     — Admin'in red gerekçesi (red_sebebi)
 * @param {string|number} [ticketId] — İlgili destek bileti id (varsa CTA buraya gider)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendCourseRejectedEmail(instructor, course, reason, ticketId) {
    try {
        if (!instructor?.eposta) return { ok: false, error: 'Eğitmen e-posta adresi yok.' };
        if (!course?.id) return { ok: false, error: 'Kurs verisi eksik.' };

        const egitmenAd = (instructor.ad || '').trim() || 'Değerli Eğitmenimiz';
        const kursBaslikSafe = _safe(course.baslik || 'Kursunuz');
        const ticketUrl = ticketId
            ? `${FRONTEND_BASE || ''}/main/contact.html?ticket=${encodeURIComponent(ticketId)}`
            : `${FRONTEND_BASE || ''}/main/contact.html`;
        const editUrl = `${FRONTEND_BASE || ''}/instructor/edit-course.html?id=${encodeURIComponent(course.id)}`;
        const sebepMetni = String(reason || '').trim();
        const sebepBloku = sebepMetni
            ? `
            <tr>
              <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:14px;padding-bottom:6px;">Red Gerekçesi</td>
            </tr>
            <tr>
              <td style="color:#0f172a;font-size:14px;line-height:1.6;white-space:pre-wrap;">
                ${_safe(sebepMetni).slice(0, 1500)}
              </td>
            </tr>`
            : '';

        const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Kurs Onay Sonucu</title></head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a84c;font-size:28px;letter-spacing:1px;font-weight:700;">EduNex Academy</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Eğitmen Paneli — Kurs Onay Sonucu</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 16px;">
              <h2 style="color:#1e3a8a;font-size:22px;margin:0 0 12px;">Merhaba ${_safe(egitmenAd)},</h2>
              <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">
                Onaya gönderdiğiniz kursunuz, inceleme sonucunda <strong>reddedildi</strong>.
                Kursunuz şu an taslak durumundadır; aşağıdaki gerekçeyi inceleyerek gerekli düzenlemeleri
                yapıp tekrar onaya gönderebilirsiniz.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
                <tr>
                  <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:6px;">Etkilenen Kurs</td>
                </tr>
                <tr>
                  <td style="color:#0f172a;font-size:16px;font-weight:600;line-height:1.5;${sebepBloku ? 'padding-bottom:14px;border-bottom:1px dashed #cbd5e1;' : ''}">
                    ${kursBaslikSafe}
                  </td>
                </tr>
                ${sebepBloku}
              </table>
              ${ticketId ? `
              <div style="margin-top:18px;padding:14px 16px;background:#fef3c7;border-left:4px solid #c9a84c;border-radius:4px;">
                <p style="color:#78350f;font-size:13px;line-height:1.6;margin:0;">
                  <strong>Destek Bileti:</strong> Bu red için sizin adınıza otomatik bir destek talebi oluşturuldu.
                  Aşağıdaki butonla bilet üzerinden admine doğrudan yanıt yazabilirsiniz.
                </p>
              </div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center">
                  <a href="${ticketId ? ticketUrl : editUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a84c 0%,#b8943f 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(201,168,76,0.4);">
                    ${ticketId ? 'Destek Biletini Aç' : 'Kursu Düzenle'}
                  </a>
                </td></tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin:18px 0 0;text-align:center;">
                ${ticketId ? `Kursu düzenlemek için: <a href="${editUrl}" style="color:#1e3a8a;word-break:break-all;">${editUrl}</a>` : `Bağlantı çalışmıyorsa: <a href="${editUrl}" style="color:#1e3a8a;word-break:break-all;">${editUrl}</a>`}
              </p>
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

        await transporter.sendMail({
            from: FROM_ADDRESS,
            to: instructor.eposta,
            subject: `EduNex Academy — "${String(course.baslik || '').slice(0, 80)}" kursunuz reddedildi`,
            html,
        });
        return { ok: true };
    } catch (err) {
        console.error(`[EMAIL SERVICE] sendCourseRejectedEmail(${instructor?.eposta}) hatasi:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Fire-and-forget wrapper'lar — admin yüzlerce kursu toplu yönetse bile
 * SMTP gecikmesi response süresini şişirmez. setImmediate + .then/.catch
 * yapısı diğer Async wrapper'larla bire bir aynı.
 */
function sendCourseApprovedEmailAsync(instructor, course) {
    setImmediate(() => {
        sendCourseApprovedEmail(instructor, course)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Kurs onay maili gonderildi: ${instructor?.eposta} (course=${course?.id})`);
                else console.error(`[EMAIL SERVICE] (bg) Kurs onay maili basarisiz (${instructor?.eposta}): ${result.error}`);
            })
            .catch(err => console.error('Kurs Onay Mail Kuyruk Hatasi:', {
                to: instructor?.eposta,
                course_id: course?.id,
                name: err && err.name,
                code: err && err.code,
                message: err && err.message,
            }));
    });
}

function sendCourseDraftedEmailAsync(instructor, course, reason) {
    setImmediate(() => {
        sendCourseDraftedEmail(instructor, course, reason)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Kurs taslak maili gonderildi: ${instructor?.eposta} (course=${course?.id})`);
                else console.error(`[EMAIL SERVICE] (bg) Kurs taslak maili basarisiz (${instructor?.eposta}): ${result.error}`);
            })
            .catch(err => console.error('Kurs Taslak Mail Kuyruk Hatasi:', {
                to: instructor?.eposta,
                course_id: course?.id,
                name: err && err.name,
                code: err && err.code,
                message: err && err.message,
            }));
    });
}

function sendCourseRejectedEmailAsync(instructor, course, reason, ticketId) {
    setImmediate(() => {
        sendCourseRejectedEmail(instructor, course, reason, ticketId)
            .then(result => {
                if (result.ok) console.log(`[EMAIL SERVICE] (bg) Kurs red maili gonderildi: ${instructor?.eposta} (course=${course?.id}, ticket=${ticketId})`);
                else console.error(`[EMAIL SERVICE] (bg) Kurs red maili basarisiz (${instructor?.eposta}): ${result.error}`);
            })
            .catch(err => console.error('Kurs Red Mail Kuyruk Hatasi:', {
                to: instructor?.eposta,
                course_id: course?.id,
                ticket_id: ticketId,
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
  // Görev 22 — Öğrenci etkileşim tetikleyicileri
  sendLiveClassNotification,
  sendLiveClassNotificationAsync,
  sendNewCourseNotification,
  sendNewCourseNotificationAsync,
  sendCertificateEmail,
  sendCertificateEmailAsync,
  // Görev 23 — Eğitmen odaklı kurs durum mailleri
  sendCourseApprovedEmail,
  sendCourseApprovedEmailAsync,
  sendCourseDraftedEmail,
  sendCourseDraftedEmailAsync,
  sendCourseRejectedEmail,
  sendCourseRejectedEmailAsync,
};