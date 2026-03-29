/**
 * EduNex BunnyCDN Service
 * Sisteme yuklenen medya dosyalarinin Bunny.net uzerinde depolanmasi 
 * ve yonetilmesi isleyislerini barindirir.
 */

const axios = require('axios');
const fs = require('fs');

const LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;

// API anahtarlarinin eksikligi durumunda sistem loglarina uyari dusulur
if (!LIBRARY_ID || !ACCESS_KEY) {
    console.warn('[BUNNY SERVICE] UYARI: BunnyCDN API kimlik bilgileri eksik. Cevresel degiskenleri (.env) kontrol edin.');
}

const bunnyAPI = axios.create({
    baseURL: `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos`,
    headers: { AccessKey: ACCESS_KEY }
});

/**
 * Gecici dizine alinmis video dosyasini Bunny.net Stream API'sine yukler.
 * Iki asamali bir islem gerceklestirir: Video GUID olusturma ve Stream aktarimi.
 * * @param {string} filePath - Sunucudaki gecici video dosyasinin tam yolu.
 * @param {string} title - Videonun gosterim basligi.
 * @returns {Promise<string>} Olusturulan videonun benzersiz GUID degeri.
 * @throws {Error} Yukleme islemi basarisiz olursa hata firlatir.
 */
const uploadVideoToBunny = async (filePath, title) => {
    try {
        // Asama 1: Bunny.net uzerinde yeni bir video kaydi olusturarak GUID bilgisini al
        const createResponse = await bunnyAPI.post('', { title: title });
        const videoGuid = createResponse.data.guid;

        // Asama 2: Olusturulan kayda ait video dosyasini binary stream (akis) olarak gonder
        const fileStream = fs.createReadStream(filePath);
        
        await bunnyAPI.put(`/${videoGuid}`, fileStream, {
            headers: {
                'Content-Type': 'application/octet-stream'
            }
        });

        return videoGuid;
    } catch (error) {
        const errorDetail = error.response?.data || error.message;
        console.error(`[BUNNY SERVICE] Video upload error: ${JSON.stringify(errorDetail)}`);
        throw new Error('Video bulut sunucusuna yuklenirken bir hata olustu.');
    }
};

module.exports = { uploadVideoToBunny };