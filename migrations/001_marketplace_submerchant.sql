-- ============================================================================
-- EduNex - Pazaryeri (Marketplace) Migration #1
-- Tarih: 2026-05-13
-- Amac: iyzico Alt Uye Isyeri (SubMerchant) modeline gecis icin gerekli
--       yeni kolonlari ekler. Idempotent (yeniden calistirilabilir).
-- ============================================================================

-- 1) egitmen_detaylari -> submerchant_key
-- iyzico'da olusturulan SubMerchant kaydinin benzersiz anahtari.
-- NULL kalabilir: henuz SubMerchant'a kaydolmamis eski egitmenler icin.
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'egitmen_detaylari'
      AND COLUMN_NAME = 'submerchant_key'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE egitmen_detaylari ADD COLUMN submerchant_key VARCHAR(255) NULL AFTER biyografi',
    'SELECT "egitmen_detaylari.submerchant_key zaten mevcut" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) siparis_kalemleri -> iyzico_item_transaction_id
-- iyzico'nun her basket item icin urettigi takip numarasi. Iade ve onay
-- API cagrilarinda referans olarak kullanilir.
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'siparis_kalemleri'
      AND COLUMN_NAME = 'iyzico_item_transaction_id'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE siparis_kalemleri ADD COLUMN iyzico_item_transaction_id VARCHAR(255) NULL AFTER odenen_fiyat',
    'SELECT "siparis_kalemleri.iyzico_item_transaction_id zaten mevcut" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) siparis_kalemleri -> hakedis_durumu
-- Her bir kalemin marketplace yasam dongusu (refund / approval).
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'siparis_kalemleri'
      AND COLUMN_NAME = 'hakedis_durumu'
);
SET @sql := IF(@col_exists = 0,
    "ALTER TABLE siparis_kalemleri ADD COLUMN hakedis_durumu ENUM('beklemede','onaylandi','iade_edildi') NOT NULL DEFAULT 'beklemede' AFTER iyzico_item_transaction_id",
    'SELECT "siparis_kalemleri.hakedis_durumu zaten mevcut" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Hakedis cron job'unun verimli tarama yapabilmesi icin index
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'siparis_kalemleri'
      AND INDEX_NAME = 'idx_siparis_kalemleri_hakedis_durumu'
);
SET @sql := IF(@idx_exists = 0,
    'CREATE INDEX idx_siparis_kalemleri_hakedis_durumu ON siparis_kalemleri (hakedis_durumu)',
    'SELECT "idx_siparis_kalemleri_hakedis_durumu zaten mevcut" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- DOGRULAMA: Migration sonrasi semayi gor.
-- ============================================================================
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'egitmen_detaylari';
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'siparis_kalemleri';
