const { Category } = require('../models');

/**
 * Türkçe karakterleri temizleyen ve URL dostu slug oluşturan yardımcı fonksiyon.
 */
const slugify = (text) => {
  const trMap = {
    'ç': 'c', 'ğ': 'g', 'ş': 's', 'ü': 'u', 'ı': 'i', 'ö': 'o',
    'Ç': 'C', 'Ğ': 'G', 'Ş': 'S', 'Ü': 'U', 'İ': 'I', 'Ö': 'O'
  };
  for (let key in trMap) {
    text = text.replace(new RegExp(key, 'g'), trMap[key]);
  }
  return text
    .toLowerCase()
    .replace(/[^-a-zA-Z0-9\s]+/g, '') // Alfanumerik olmayanları kaldır
    .replace(/\s+/g, '-')            // Boşlukları - yap
    .replace(/-+/g, '-')             // Birden fazla -'yi teke düşür
    .trim();
};

/**
 * 3 Katmanlı Profesyonel Kategori Yapısını Senkronize Eder.
 */
const seedCategories = async () => {
  try {
    // 1. ADIM: HIZ KONTROLÜ
    // Eğer tabloda zaten veri varsa, döngülere hiç girmeden fonksiyonu bitirir.
    const count = await Category.count();
    if (count > 0) {
        console.log('[SEEDER] Kategoriler zaten mevcut, senkronizasyon atlaniyor...');
        return; 
    }

    // 2. ADIM: VERİ TANIMLAMASI
    const categoryData = [
      {
        name: "Yazılım Geliştirme",
        subs: [
          { name: "Web Geliştirme", topics: ["JavaScript & TypeScript", "React JS & Next.js", "Node.js & Arka Uç Geliştirme", "ASP.NET Core"] },
          { name: "Mobil Uygulama Geliştirme", topics: ["Google Flutter & Dart", "React Native", "iOS Geliştirme (Swift & SwiftUI)", "Android Geliştirme (Kotlin)"] },
          { name: "Veri Bilimi ve Yapay Zeka", topics: ["Python ile Veri Analizi", "Makine Öğrenimi (Machine Learning)", "Üretken Yapay Zeka (GenAI) & LLM", "Derin Öğrenme (Deep Learning)"] },
          { name: "Programlama Dilleri", topics: ["Python", "Java", "C# / C++", "Go / Rust"] },
          { name: "Oyun Geliştirme", topics: ["Unity (C#)", "Unreal Engine (C++)", "2D & 3D Oyun Tasarımı"] }
        ]
      },
      {
        name: "BT ve Altyapı",
        subs: [
          { name: "Siber Güvenlik", topics: ["Etik Hackleme ve Sızma Testi", "Ağ Güvenliği (Network Security)", "Bilgi Güvenliği Sertifikaları (Security+)"] },
          { name: "Bulut Bilişim ve DevOps", topics: ["AWS / Azure / Google Cloud", "Docker & Kubernetes", "CI/CD Süreçleri ve Git/GitHub"] },
          { name: "Sistem Yönetimi", topics: ["Linux Yönetimi", "Windows Server ve Active Directory", "Veri Tabanı Yönetimi (SQL / NoSQL)"] }
        ]
      },
      {
        name: "Tasarım",
        subs: [
          { name: "Kullanıcı Deneyimi (UX/UI)", topics: ["Figma ile Arayüz Tasarımı", "Mobil Uygulama ve Web Tasarımı", "Kullanıcı Deneyimi Araştırması"] },
          { name: "Grafik Tasarım", topics: ["Adobe Photoshop & Illustrator", "Canva ile Görsel Oluşturma", "Kurumsal Kimlik ve Logo Tasarımı"] },
          { name: "3D ve Animasyon", topics: ["Blender ile 3D Modelleme", "After Effects ile Hareketli Grafik (Motion)", "AutoCAD ve Mimari Modelleme"] }
        ]
      },
      {
        name: "İşletme ve Yönetim",
        subs: [
          { name: "Proje Yönetimi", topics: ["PMP & PMI Sertifikasyon Hazırlık", "Agile & Scrum Metodolojileri", "İş Analizi ve Gereksinim Yönetimi"] },
          { name: "Girişimcilik ve Strateji", topics: ["İş Planı ve Girişimcilik Temelleri", "Freelance (Serbest Çalışma) Rehberi", "Liderlik ve Yönetim Becerileri"] },
          { name: "İnsan Kaynakları", topics: ["İşe Alım ve Yetenek Yönetimi", "İK Analitiği ve Raporlama"] }
        ]
      },
      {
        name: "Pazarlama",
        subs: [
          { name: "Dijital Pazarlama", topics: ["Sosyal Medya Yönetimi ve Reklamları", "SEO (Arama Motoru Optimizasyonu)", "Google Ads ve PPC Reklamcılığı"] },
          { name: "İçerik Pazarlaması", topics: ["YouTube ve Video Pazarlama", "Reklam Yazarlığı (Copywriting)", "İçerik Üretimi ve Blog Yazarlığı"] },
          { name: "E-Ticaret", topics: ["Amazon FBA & Dropshipping", "Shopify ve E-Ticaret Altyapıları"] }
        ]
      },
      {
        name: "Finans ve Muhasebe",
        subs: [
          { name: "Muhasebe ve Finansal Analiz", topics: ["Temel Muhasebe ve Defter Tutma", "Finansal Modelleme ve Excel", "Vergi Mevzuatı ve Uyumluluk"] },
          { name: "Yatırım ve Ekonomi", topics: ["Borsa ve Hisse Senedi Analizi", "Kripto Paralar ve Blockchain", "Kişisel Finans Yönetimi"] }
        ]
      },
      {
        name: "Kişisel Gelişim",
        subs: [
          { name: "Kariyer ve Verimlilik", topics: ["Mülakat Teknikleri ve CV Hazırlama", "Zaman Yönetimi ve Planlama", "Topluluk Önünde Konuşma ve Sunum"] },
          { name: "Dil Eğitimi", topics: ["İngilizce (Genel & İş İngilizcesi)", "Almanca / Fransızca / İspanyolca", "Sınav Hazırlık (IELTS / TOEFL / YDS)"] }
        ]
      },
      {
        name: "Ofis Verimliliği",
        subs: [
          { name: "Microsoft Office Araçları", topics: ["İleri Excel ve Veri Analizi", "PowerPoint ile Etkili Sunumlar"] },
          { name: "İş Analitiği Araçları", topics: ["Power BI & Tableau", "SQL ile Veri Raporlama"] },
          { name: "Yapay Zeka Verimlilik Araçları", topics: ["ChatGPT ve Prompt Engineering", "Notion ile Süreç Yönetimi"] }
        ]
      }
    ];

    console.log('[SEEDER] Kategori hiyerarsisi kuruluyor (Bu islem bir kez yapilir)...');

    for (const main of categoryData) {
      // 1. Katman (Ana Kategori)
      const [mainCat] = await Category.findOrCreate({
        where: { ad: main.name, ust_kategori_id: null },
        defaults: { slug: slugify(main.name) }
      });

      for (const sub of main.subs) {
        // 2. Katman (Alt Kategori)
        const [subCat] = await Category.findOrCreate({
          where: { ad: sub.name, ust_kategori_id: mainCat.id },
          defaults: { slug: slugify(sub.name) }
        });

        for (const topicName of sub.topics) {
          // 3. Katman (Konu)
          await Category.findOrCreate({
            where: { ad: topicName, ust_kategori_id: subCat.id },
            defaults: { slug: slugify(topicName) }
          });
        }
      }
    }
    
    console.log('[SEEDER] Kategori hiyerarsisi basariyla senkronize edildi.');

  } catch (error) {
    console.error('[SEEDER ERROR] Kategori hatasi:', error);
  }
};

module.exports = seedCategories;