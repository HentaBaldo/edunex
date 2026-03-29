/**
 * EduNex Application Entry Point (Server)
 * Uygulamanin baslatilmasi, veritabani baglantisinin dogrulanmasi 
 * ve sunucu yasam dongusunun (lifecycle) guvenli yonetimini barindirir.
 */

require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Veritabani baglantisini dogrula
        await sequelize.authenticate();
        console.log('[SERVER] Veritabani baglantisi basariyla kuruldu.');

        // Sunucuyu ayaga kaldir
        const server = app.listen(PORT, () => {
            console.log(`[SERVER] Sunucu port ${PORT} uzerinde calisiyor. Ortam: ${process.env.NODE_ENV || 'development'}`);
        });

        // Istemci zaman asimi (Timeout) yapilandirmasi:
        // Buyuk medya dosyalarinin (video) yuklenmesi sirasinda baglantinin kopmasini 
        // onlemek amaciyla timeout suresi 5 dakika (300.000 ms) olarak artirilmistir.
        server.timeout = 300000;

        // --- Graceful Shutdown (Guvenli Kapanis) ---
        // Sunucu durdurulmak istendiginde mevcut islemlerin bitmesini bekler ve baglantilari guvenle kapatir.
        const gracefulShutdown = () => {
            console.log('\n[SERVER] Kapanma sinyali alindi. Sunucu guvenli bir sekilde durduruluyor...');
            server.close(async () => {
                console.log('[SERVER] Gelen yeni istekler durduruldu.');
                try {
                    await sequelize.close();
                    console.log('[SERVER] Veritabani baglantisi guvenle kapatildi.');
                    process.exit(0);
                } catch (err) {
                    console.error('[SERVER] Veritabani kapatilirken hata olustu:', err.message);
                    process.exit(1);
                }
            });
        };

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);

    } catch (error) {
        console.error(`[SERVER CRITICAL] Sunucu baslatilamadi: ${error.message}`);
        process.exit(1);
    }
}

// --- Global Error Handling ---
// Yakalanamayan asenkron hatalari (Promise Rejections) logla
process.on('unhandledRejection', (reason, promise) => {
    console.error('[SERVER ERROR] Yakalanmayan Promise Hatasi (Unhandled Rejection):', reason);
});

// Yakalanamayan senkron hatalari (Exceptions) logla ve guvenli cikis yap
process.on('uncaughtException', (error) => {
    console.error('[SERVER CRITICAL] Beklenmeyen Hata (Uncaught Exception):', error.message);
    process.exit(1);
});

// Uygulamayi baslat
startServer();