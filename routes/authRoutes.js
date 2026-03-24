const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// --- KİMLİK DOĞRULAMA ROTALARI ---

// NOT: Eğer controller dosyasında fonksiyon adları hala register ve login ise böyle kalmalı.
// Eğer kayitOl ve girisYap yaptıysan, noktadan sonrasını ona göre düzelt.
router.post('/kayit', authController.kayitOl); 

// '/auth' yazmıştın, bunu frontend'in beklediği gibi '/giris' yapıyoruz.
router.post('/giris', authController.girisYap); 

module.exports = router;