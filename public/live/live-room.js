/**
 * EduNex - Canlı Oturum Odası
 * Jitsi External API (meet.jit.si) ile gömülü toplantı + 60 sn heartbeat ile yoklama.
 */

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('sessionId');

let jitsiApi = null;
let heartbeatTimer = null;
let isJoined = false;
let currentMinutes = 0;

document.addEventListener('DOMContentLoaded', bootstrap);
window.addEventListener('beforeunload', cleanup);

async function bootstrap() {
    if (!sessionId) {
        showError('Geçersiz oturum linki. sessionId parametresi bulunamadı.');
        return;
    }

    try {
        const result = await ApiService.post(`/live-sessions/${sessionId}/join`, {});
        const data = result.data;

        document.getElementById('sessionTitle').textContent = data.session.baslik || 'Canlı Ders';

        const roleBadge = document.getElementById('roleBadge');
        roleBadge.textContent = data.user.moderator ? 'Eğitmen (Moderatör)' : 'Öğrenci';
        roleBadge.style.display = 'inline-block';

        if (!data.user.moderator) {
            document.getElementById('attendancePill').style.display = 'flex';
        }

        launchJitsi(data);
    } catch (error) {
        showError(error.message || 'Oturuma katılamadık.');
    }
}

function launchJitsi({ session, room, user }) {
    const domain = room.domain || 'meet.jit.si';
    const container = document.getElementById('jitsiContainer');

    const options = {
        roomName: room.oda_adi,
        parentNode: container,
        width: '100%',
        height: '100%',
        userInfo: {
            displayName: user.displayName,
            email: user.email || '',
        },
        configOverwrite: {
            startWithAudioMuted: !user.moderator,
            startWithVideoMuted: !user.moderator,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
        },
    };

    try {
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
    } catch (err) {
        showError('Jitsi iframe başlatılamadı: ' + err.message);
        return;
    }

    document.getElementById('loadingScreen').style.display = 'none';
    container.style.display = 'block';

    jitsiApi.addListener('videoConferenceJoined', onConferenceJoined);
    jitsiApi.addListener('videoConferenceLeft', onConferenceLeft);
    jitsiApi.addListener('readyToClose', () => {
        cleanup();
        history.back();
    });
}

function onConferenceJoined() {
    if (isJoined) return;
    isJoined = true;
    console.log('[LIVE] videoConferenceJoined — heartbeat başlatıldı');

    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, 60 * 1000);
}

function onConferenceLeft() {
    console.log('[LIVE] videoConferenceLeft — heartbeat durduruldu');
    stopHeartbeat();
}

async function sendHeartbeat() {
    try {
        const result = await ApiService.post(`/live-sessions/${sessionId}/heartbeat`, {});
        if (result?.data?.toplam_dakika !== undefined) {
            currentMinutes = result.data.toplam_dakika;
            const el = document.getElementById('attendanceMinutes');
            if (el) el.textContent = currentMinutes;
        }
    } catch (err) {
        console.warn('[LIVE] heartbeat hata:', err.message);
    }
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    isJoined = false;
}

function cleanup() {
    stopHeartbeat();
    if (jitsiApi) {
        try { jitsiApi.dispose(); } catch (_) {}
        jitsiApi = null;
    }
}

function showError(message) {
    document.getElementById('loadingScreen').style.display = 'none';
    const errScreen = document.getElementById('errorScreen');
    document.getElementById('errorMessage').textContent = message;
    errScreen.style.display = 'flex';
}
