# EduNex Migrations

Bu klasor MySQL icin elle calistirilan **idempotent** SQL migration scriptlerini barindirir.

## Calistirma sirasi

Production ortamda `sequelize.sync({ alter: true })` ENUM kolonu degisikliklerinde guvenilir degildir, bu yuzden marketplace ozelliklerini deploy etmeden once asagidaki dosyayi tek seferlik calistirin:

```bash
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/001_marketplace_submerchant.sql
```

Yeniden calistirilabilir: scriptler `INFORMATION_SCHEMA` kontrolu yaparak mevcut kolonlari atlar.

## Liste

| # | Dosya | Amac |
|---|-------|------|
| 001 | `001_marketplace_submerchant.sql` | `egitmen_detaylari.submerchant_key`, `siparis_kalemleri.iyzico_item_transaction_id`, `siparis_kalemleri.hakedis_durumu` kolonlarini ekler. |



