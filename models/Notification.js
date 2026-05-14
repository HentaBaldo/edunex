module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      kullanici_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      icerik: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Bildirim tipi.
      // - yeni_kurs / canli_yayin / sistem  : platform mesajlari
      // - satis / yorum / takip             : egitmene yonelik domain olaylari (Mayis 2026'da eklendi)
      // - destek                            : destek talebi (ticket) icin admin/kullanici bildirimleri
      tip: {
        type: DataTypes.ENUM(
          'yeni_kurs',
          'canli_yayin',
          'sistem',
          'satis',
          'yorum',
          'takip',
          'destek'
        ),
        allowNull: false,
        defaultValue: 'sistem',
      },
      okundu_mu: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      hedef_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      // Bildirimin kaynagi olan domain nesnenin UUID'si (opsiyonel).
      // Ornek: canli_yayin bildirimi icin LiveSession.id; satis icin Order.id vb.
      // Statefull dinamik render icin kritik: GET sirasinda kaynak nesneyi join edip
      // gercek-zamanli durum/metin/url uretebilmek icin tutuyoruz.
      kaynak_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // Sequelize'in default createdAt'ini Turkce kolon adimiza map'liyoruz.
      // updatedAt: okundu_mu degisikligini tarihleyebilmek icin acik (sutun: guncelleme_tarihi).
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      guncelleme_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'bildirimler',
      timestamps: true,
      createdAt: 'olusturulma_tarihi',
      updatedAt: 'guncelleme_tarihi',
      indexes: [
        { fields: ['kullanici_id'] },
        { fields: ['kullanici_id', 'okundu_mu'] },
        { fields: ['olusturulma_tarihi'] },
        { fields: ['tip', 'kaynak_id'] },
      ],
    }
  );

  return Notification;
};
