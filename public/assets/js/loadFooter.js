// public/assets/js/loadFooter.js
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', async function () {
        const placeholder = document.getElementById('footer-placeholder');
        if (!placeholder) return;

        try {
            const res  = await fetch('/components/footer.html');
            const html = await res.text();
            placeholder.innerHTML = html;
        } catch (e) {
            console.error('[FOOTER] Yüklenemedi:', e);
        }
    });
})();
