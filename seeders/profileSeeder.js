const { Profile } = require('../models');
const bcrypt = require('bcrypt');

/**
 * Başlangıç profillerini (Admin, Eğitmen, Öğrenci) oluşturur.
 * Şifreler varsayılan olarak '123456' set edilir.
 */
const seedProfiles = async () => {
  try {
    // Production'da otomatik test hesabi olusturulmasin (zayif sifreli admin
    // hesabi sizdirma riski). Yeni admin'i SEED_ADMIN_PASSWORD env'i ile
    // bilinçli olarak ekle.
    if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
      console.log('[SEEDER] Production ortaminda varsayilan profil seeder atlandi.');
      return;
    }

    const seedPassword = process.env.SEED_ADMIN_PASSWORD || '123456';
    const hashedPassword = await bcrypt.hash(seedPassword, 10);

    const users = [
      {
        ad: 'Sistem',
        soyad: 'Admin',
        eposta: 'admin@admin.com',
        sifre: hashedPassword,
        rol: 'admin',
        profil_herkese_acik_mi: true
      },
      {
        ad: 'Test',
        soyad: 'Eğitmen',
        eposta: 'egitmen@egitmen.com',
        sifre: hashedPassword,
        rol: 'egitmen',
        profil_herkese_acik_mi: true
      },
      {
        ad: 'Test',
        soyad: 'Öğrenci',
        eposta: 'ogrenci@ogrenci.com',
        sifre: hashedPassword,
        rol: 'ogrenci',
        profil_herkese_acik_mi: true
      }
    ];

    for (const user of users) {
      // findOrCreate: E-posta adresine göre kontrol eder, yoksa oluşturur.
      await Profile.findOrCreate({
        where: { eposta: user.eposta },
        defaults: user
      });
    }

    console.log('Temel profiller başarıyla senkronize edildi.');
  } catch (error) {
    console.error('Seeder Hatası (Profil):', error.message);
  }
};

module.exports = seedProfiles;