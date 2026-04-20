/**
 * EduNex - Learning Room: Canlı Ders widget'ı
 * Öğrencinin açtığı kursa ait canlı oturumları listeler.
 */

(function () {
    document.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        const courseId = params.get('id');
        if (!courseId) return;
        loadLiveSessions(courseId);
    });

    async function loadLiveSessions(courseId) {
        try {
            const result = await ApiService.get(`/live-sessions/course/${courseId}`);
            const sessions = (result.data || []).filter(s => s.durum !== 'iptal');
            if (sessions.length === 0) return;

            const widget = document.getElementById('liveSessionsWidget');
            const list = document.getElementById('liveSessionsList');
            if (!widget || !list) return;

            list.innerHTML = sessions.map(renderSession).join('');
            widget.style.display = 'block';
        } catch (err) {
            console.warn('[LEARNING-LIVE] Canlı ders listesi alınamadı:', err.message);
        }
    }

    function renderSession(s) {
        const start = new Date(s.baslangic_tarihi);
        const now = new Date();
        const minutesToStart = Math.round((start - now) / 60000);
        const joinable = minutesToStart <= 15 && minutesToStart >= -(s.sure_dakika || 60);

        const dateLabel = start.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
        const colorDot = joinable ? '#10b981' : '#64748b';
        const btnStyle = joinable
            ? 'background:#8b5cf6; color:#fff; cursor:pointer;'
            : 'background:#334155; color:#94a3b8; cursor:not-allowed;';

        return `
            <div style="background:#1e293b; border:1px solid #334155; border-radius:8px; padding:10px 12px; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="width:8px; height:8px; border-radius:50%; background:${colorDot};"></span>
                    <b style="color:#e2e8f0; font-size:0.88rem;">${escapeHtml(s.baslik)}</b>
                </div>
                <div style="color:#94a3b8; font-size:0.78rem; margin-bottom:8px;">
                    <i class="far fa-clock"></i> ${dateLabel} · ${s.sure_dakika} dk
                </div>
                <button ${joinable ? '' : 'disabled'} onclick="window.open('/live/live-room.html?sessionId=${s.id}', '_blank')"
                    style="width:100%; padding:6px 0; border:0; border-radius:6px; font-size:0.82rem; ${btnStyle}">
                    <i class="fas fa-sign-in-alt"></i>
                    ${joinable ? 'Derse Katıl' : timeHint(minutesToStart, s.sure_dakika)}
                </button>
            </div>`;
    }

    function timeHint(minutesToStart, duration) {
        if (minutesToStart > 15) {
            if (minutesToStart > 60 * 24) return `${Math.round(minutesToStart / (60 * 24))} gün sonra`;
            if (minutesToStart > 60) return `${Math.round(minutesToStart / 60)} saat sonra`;
            return `${minutesToStart} dk sonra`;
        }
        return 'Oturum sona erdi';
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }
})();
