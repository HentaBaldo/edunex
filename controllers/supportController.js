/**
 * EduNex Destek Talebi (Ticket) Controller
 *
 * Akis:
 *   - Kullanici (egitmen/ogrenci) ticket acar -> SupportTicket + ilk SupportMessage olusur.
 *   - Admin cevap yazar    -> ticket.durum = 'cevaplandi', talep sahibine 'destek' bildirim.
 *   - Kullanici cevap yazar -> ticket.durum = 'acik' (admin'in yeni cevap beklemesi).
 *   - Admin ticket'i kapatabilir (durum='kapali'); kapali ticket'a mesaj eklenemez.
 *
 * Guvenlik:
 *   - getTicketDetails / replyTicket: ticket sahibi VEYA admin disinda kimse erisemez.
 *   - adminGetAllTickets sadece /api/admin/... altinda isAdmin middleware'i ile mount edilir.
 */

const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { SupportTicket, SupportMessage, Profile, Notification } = require('../models');
const { sendNotification } = require('../services/notificationService');

const VALID_KATEGORI = ['finans', 'teknik', 'kurs_onay', 'diger'];
const KONU_MIN = 5;
const KONU_MAX = 255;
const MESAJ_MIN = 2;
const MESAJ_MAX = 1000;

// Bildirimde admin paneline veya kullanici sayfasina yonlendirmek icin URL kalibi.
// contact.html artik dinamik destek merkezi (Faz 3); ?ticket=ID detay panelini acar.
function buildUserTicketUrl(ticketId) {
    return `/main/contact.html?ticket=${ticketId}`;
}
function buildAdminTicketUrl(ticketId) {
    return `/admin/support.html?ticket=${ticketId}`;
}

function normalize(str, max) {
    return String(str || '').trim().slice(0, max);
}

/**
 * Yeni destek talebi olusturur ve ilk mesaji yazar.
 * Body: { konu, kategori?, mesaj }
 * @route POST /api/support/tickets
 */
exports.createTicket = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const kullanici_id = req.user?.id;
        if (!kullanici_id) {
            await t.rollback();
            return res.status(401).json({ success: false, message: 'Oturum bilgisi cozumlenemedi.' });
        }

        const konu = normalize(req.body?.konu, KONU_MAX);
        const mesaj = normalize(req.body?.mesaj, MESAJ_MAX);
        let kategori = String(req.body?.kategori || 'diger').trim();
        if (!VALID_KATEGORI.includes(kategori)) kategori = 'diger';

        if (konu.length < KONU_MIN) {
            await t.rollback();
            return res.status(400).json({ success: false, message: `Konu en az ${KONU_MIN} karakter olmali.` });
        }
        if (mesaj.length < MESAJ_MIN) {
            await t.rollback();
            return res.status(400).json({ success: false, message: `Mesaj en az ${MESAJ_MIN} karakter olmali.` });
        }

        const ticket = await SupportTicket.create({
            kullanici_id,
            konu,
            kategori,
            durum: 'acik',
        }, { transaction: t });

        await SupportMessage.create({
            talep_id: ticket.id,
            gonderen_id: kullanici_id,
            mesaj,
            okundu_mu: false,
        }, { transaction: t });

        await t.commit();

        console.log(`[SUPPORT] Yeni ticket olusturuldu: ${ticket.id} (kullanici=${kullanici_id}, kategori=${kategori})`);
        return res.status(201).json({
            success: true,
            message: 'Destek talebiniz olusturuldu.',
            data: { id: ticket.id, konu: ticket.konu, kategori: ticket.kategori, durum: ticket.durum },
        });
    } catch (error) {
        await t.rollback().catch(() => {});
        console.error('[SUPPORT] createTicket hatasi:', error.message);
        next(error);
    }
};

/**
 * Giris yapan kullanicinin kendi taleplerini doner.
 * Query: ?durum=acik|cevaplandi|kapali (opsiyonel)
 * @route GET /api/support/tickets
 */
exports.getMyTickets = async (req, res, next) => {
    try {
        const kullanici_id = req.user?.id;
        if (!kullanici_id) {
            return res.status(401).json({ success: false, message: 'Oturum bilgisi cozumlenemedi.' });
        }

        const where = { kullanici_id };
        const durum = String(req.query?.durum || '').trim();
        if (['acik', 'cevaplandi', 'kapali'].includes(durum)) where.durum = durum;

        const tickets = await SupportTicket.findAll({
            where,
            order: [['olusturulma_tarihi', 'DESC']],
            limit: 100,
        });

        return res.status(200).json({ success: true, data: tickets });
    } catch (error) {
        console.error('[SUPPORT] getMyTickets hatasi:', error.message);
        next(error);
    }
};

/**
 * Tek bir ticket'in detayi + tum mesaj gecmisi.
 * Sahip veya admin disinda kimse erisemez.
 * @route GET /api/support/tickets/:id
 */
exports.getTicketDetails = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const isAdmin = req.user?.rol === 'admin';
        if (!userId) return res.status(401).json({ success: false, message: 'Oturum bilgisi cozumlenemedi.' });

        const ticket = await SupportTicket.findByPk(req.params.id, {
            include: [
                { model: Profile, as: 'Kullanici', attributes: ['id', 'ad', 'soyad', 'eposta', 'rol'] },
                {
                    model: SupportMessage,
                    as: 'Mesajlar',
                    include: [{ model: Profile, as: 'Gonderen', attributes: ['id', 'ad', 'soyad', 'rol'] }],
                },
            ],
            order: [[{ model: SupportMessage, as: 'Mesajlar' }, 'olusturulma_tarihi', 'ASC']],
        });

        if (!ticket) return res.status(404).json({ success: false, message: 'Destek talebi bulunamadi.' });

        if (!isAdmin && ticket.kullanici_id !== userId) {
            return res.status(403).json({ success: false, message: 'Bu talebe erisim yetkiniz yok.' });
        }

        // Karsi tarafin yazdigi okunmamis mesajlari "okundu" yap (yan etki).
        // Sahip aciyorsa admin'in (gonderen != sahip) mesajlarini okuduk demektir.
        // Admin aciyorsa sahip'in mesajlarini okuduk demektir.
        try {
            const karsiTaraf = isAdmin
                ? { [Op.ne]: null, [Op.notIn]: [] } // admin gorsel; tum non-admin'i okundu say
                : null;
            if (isAdmin) {
                await SupportMessage.update(
                    { okundu_mu: true },
                    { where: { talep_id: ticket.id, gonderen_id: { [Op.ne]: null }, okundu_mu: false } }
                );
            } else {
                // Kullanici aciyor: kendi yazmadiklarini okundu yap.
                await SupportMessage.update(
                    { okundu_mu: true },
                    { where: { talep_id: ticket.id, gonderen_id: { [Op.ne]: userId }, okundu_mu: false } }
                );
            }
        } catch (markErr) {
            console.warn('[SUPPORT] okundu_mu guncelleme atlandi:', markErr.message);
        }

        return res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        console.error('[SUPPORT] getTicketDetails hatasi:', error.message);
        next(error);
    }
};

/**
 * Bir ticket'a yeni mesaj ekler.
 *   - Mesaji Admin yazarsa     -> durum='cevaplandi' + talep sahibine 'destek' bildirimi.
 *   - Mesaji Kullanici yazarsa -> durum='acik' (admin'in yeni cevap vermesi bekleniyor).
 *   - Kapali ticket'a mesaj eklenemez.
 *
 * Body: { mesaj }
 * @route POST /api/support/tickets/:id/messages   (kullanici)
 * @route POST /api/admin/support/tickets/:id/messages  (admin)
 */
exports.replyTicket = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const userId = req.user?.id;
        const isAdmin = req.user?.rol === 'admin';
        if (!userId) {
            await t.rollback();
            return res.status(401).json({ success: false, message: 'Oturum bilgisi cozumlenemedi.' });
        }

        const mesaj = normalize(req.body?.mesaj, MESAJ_MAX);
        if (mesaj.length < MESAJ_MIN) {
            await t.rollback();
            return res.status(400).json({ success: false, message: `Mesaj en az ${MESAJ_MIN} karakter olmali.` });
        }

        const ticket = await SupportTicket.findByPk(req.params.id, { transaction: t });
        if (!ticket) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Destek talebi bulunamadi.' });
        }

        // Yetki: sahip veya admin.
        if (!isAdmin && ticket.kullanici_id !== userId) {
            await t.rollback();
            return res.status(403).json({ success: false, message: 'Bu talebe mesaj yazma yetkiniz yok.' });
        }

        if (ticket.durum === 'kapali') {
            await t.rollback();
            return res.status(409).json({ success: false, message: 'Bu talep kapali. Yeni mesaj eklenemez.' });
        }

        const message = await SupportMessage.create({
            talep_id: ticket.id,
            gonderen_id: userId,
            mesaj,
            okundu_mu: false,
        }, { transaction: t });

        // Durum gecisi: admin yazdi -> cevaplandi, kullanici yazdi -> acik.
        const yeniDurum = isAdmin ? 'cevaplandi' : 'acik';
        if (ticket.durum !== yeniDurum) {
            await ticket.update({ durum: yeniDurum }, { transaction: t });
        }

        await t.commit();

        // Bildirim: SADECE admin cevapladiginda talep sahibine gonderiyoruz.
        // (Admin tarafi notification almaz; admin paneli ticket listesi bu rolu ustlenir.)
        if (isAdmin && ticket.kullanici_id !== userId) {
            try {
                await sendNotification({
                    kullanici_id: ticket.kullanici_id,
                    baslik: 'Destek talebinize yanit geldi',
                    mesaj: `"${ticket.konu}" konulu talebinize yeni bir cevap geldi.`,
                    tip: 'destek',
                    baglanti_linki: buildUserTicketUrl(ticket.id),
                    kaynak_id: ticket.id,
                });
            } catch (notifyErr) {
                // Bildirim non-blocking: asil cevabin yazilmasini engellemez.
                console.warn('[SUPPORT] sendNotification (admin->kullanici) atlandi:', notifyErr.message);
            }
        }

        console.log(`[SUPPORT] Mesaj eklendi: ticket=${ticket.id}, gonderen=${userId}, admin=${isAdmin}, yeniDurum=${yeniDurum}`);
        return res.status(201).json({
            success: true,
            message: 'Mesajiniz iletildi.',
            data: { id: message.id, durum: yeniDurum },
        });
    } catch (error) {
        await t.rollback().catch(() => {});
        console.error('[SUPPORT] replyTicket hatasi:', error.message);
        next(error);
    }
};

/**
 * Admin: tum ticket'lari filtreli + sayfalamali doner.
 * Query: ?durum=...&kategori=...&search=...&page=1&limit=20
 * @route GET /api/admin/support/tickets
 */
exports.adminGetAllTickets = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const offset = (page - 1) * limit;

        const where = {};
        const durum = String(req.query.durum || '').trim();
        if (['acik', 'cevaplandi', 'kapali'].includes(durum)) where.durum = durum;

        const kategori = String(req.query.kategori || '').trim();
        if (VALID_KATEGORI.includes(kategori)) where.kategori = kategori;

        const search = String(req.query.search || '').trim();
        if (search) where.konu = { [Op.like]: `%${search}%` };

        const { count, rows } = await SupportTicket.findAndCountAll({
            where,
            include: [
                { model: Profile, as: 'Kullanici', attributes: ['id', 'ad', 'soyad', 'eposta', 'rol'] },
            ],
            order: [['olusturulma_tarihi', 'DESC']],
            limit,
            offset,
        });

        // Sekme rozet sayilari (filter uygulamadan).
        const [acik, cevaplandi, kapali] = await Promise.all([
            SupportTicket.count({ where: { durum: 'acik' } }),
            SupportTicket.count({ where: { durum: 'cevaplandi' } }),
            SupportTicket.count({ where: { durum: 'kapali' } }),
        ]);

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
            counts: { acik, cevaplandi, kapali },
        });
    } catch (error) {
        console.error('[SUPPORT] adminGetAllTickets hatasi:', error.message);
        next(error);
    }
};

/**
 * Admin: ticket durumunu degistirir (cogunlukla 'kapali' kullanilir).
 * Body: { durum: 'acik'|'cevaplandi'|'kapali' }
 * @route PATCH /api/admin/support/tickets/:id/status
 */
exports.adminUpdateStatus = async (req, res, next) => {
    try {
        const yeni = String(req.body?.durum || '').trim();
        if (!['acik', 'cevaplandi', 'kapali'].includes(yeni)) {
            return res.status(400).json({ success: false, message: 'Gecersiz durum.' });
        }

        const ticket = await SupportTicket.findByPk(req.params.id);
        if (!ticket) return res.status(404).json({ success: false, message: 'Destek talebi bulunamadi.' });

        if (ticket.durum === yeni) {
            return res.status(200).json({ success: true, message: 'Durum zaten ayni.', data: { id: ticket.id, durum: yeni } });
        }

        await ticket.update({ durum: yeni });

        // Kullaniciya kapama bildirimi (opsiyonel ama UX icin onemli).
        if (yeni === 'kapali') {
            try {
                await sendNotification({
                    kullanici_id: ticket.kullanici_id,
                    baslik: 'Destek talebiniz kapatildi',
                    mesaj: `"${ticket.konu}" konulu talebiniz cozulmus olarak kapatildi.`,
                    tip: 'destek',
                    baglanti_linki: buildUserTicketUrl(ticket.id),
                    kaynak_id: ticket.id,
                });
            } catch (e) {
                console.warn('[SUPPORT] kapatma bildirimi atlandi:', e.message);
            }
        }

        console.log(`[SUPPORT] Durum guncellendi: ticket=${ticket.id}, admin=${req.user?.id}, durum=${yeni}`);
        return res.status(200).json({ success: true, message: 'Durum guncellendi.', data: { id: ticket.id, durum: yeni } });
    } catch (error) {
        console.error('[SUPPORT] adminUpdateStatus hatasi:', error.message);
        next(error);
    }
};

// Otomasyon icin diger modullerin (rejectCourse) cagiracagi yardimci.
// HTTP katmaninda DEGIL — controller'larin server-side cagrisi icin export edildi.
exports._internal = {
    buildUserTicketUrl,
    buildAdminTicketUrl,
};
