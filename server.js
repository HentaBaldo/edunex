require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Veritabanı bağlantı kontrolü
        await sequelize.authenticate();
        console.log(`[BİLGİ] [${new Date().toISOString()}] Veritabani baglantisi basariyla kuruldu.`);

        // Sunucuyu dinlemeye başla
        app.listen(PORT, () => {
            console.log(`[BİLGİ] [${new Date().toISOString()}] Sunucu ${PORT} portunda calisiyor. Ortam: ${process.env.NODE_ENV || 'development'}`);
        });

    } catch (error) {
        console.error(`[KRITIK] [${new Date().toISOString()}] Sunucu baslatilamadi: ${error.message}`);
        // Kritik bağlantı hatasında süreci durdur (Docker/PM2 gibi araçlar için sinyaldir)
        process.exit(1);
    }
}

// Uygulamayı başlat
startServer();