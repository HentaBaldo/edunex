#!/bin/sh
# ============================================================
# EduNex - Git Pre-Commit Hook Yukleyici
# ============================================================
# Bu script .env benzeri dosyalarin yanlislikla commit'lenmesini
# engelleyen bir pre-commit hook'u .git/hooks/'a yukler.
#
# KULLANIM:
#   bash scripts/install-git-hooks.sh
#
# Bir kez calistirmak yeterli; sonraki tum commit'lerde otomatik
# kontrol yapilir.
# ============================================================

HOOK_PATH=".git/hooks/pre-commit"

cat > "$HOOK_PATH" << 'EOF'
#!/bin/sh
# Pre-commit: .env / secret dosyalarini engelle

# .env varyantlari (sadece .env.example izinli)
FORBIDDEN=$(git diff --cached --name-only --diff-filter=ACM | grep -E '(^|/)\.env($|\.[a-z]+$)' | grep -v '\.env\.example$')

if [ -n "$FORBIDDEN" ]; then
    echo ""
    echo "❌ COMMIT ENGELLENDI: Asagidaki dosyalar secret icerebilir:"
    echo "$FORBIDDEN" | sed 's/^/   - /'
    echo ""
    echo "   .env dosyalari ASLA commit edilmemelidir."
    echo "   Eger gercekten gerekli ise: git commit --no-verify (ONERILMEZ)"
    echo ""
    exit 1
fi

# Sertifika / private key dosyalari
KEYS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(pem|key|p12|pfx|crt)$')
if [ -n "$KEYS" ]; then
    echo ""
    echo "❌ COMMIT ENGELLENDI: Asagidaki dosyalar private key/sertifika gibi gozukuyor:"
    echo "$KEYS" | sed 's/^/   - /'
    echo ""
    exit 1
fi

# Common secret pattern'leri commit icinde araz
SECRETS_PATTERN='(api[_-]?key|secret[_-]?key|password|token)\s*=\s*["'\'']?[A-Za-z0-9+/]{20,}'
SECRETS_FOUND=$(git diff --cached -U0 | grep -iE "^\+.*$SECRETS_PATTERN" | head -3)
if [ -n "$SECRETS_FOUND" ]; then
    echo ""
    echo "⚠️  UYARI: Commit icinde secret benzeri pattern bulundu:"
    echo "$SECRETS_FOUND" | head -3
    echo ""
    echo "   Eger bu gercek bir secret degilse: git commit --no-verify ile gec"
    echo ""
    exit 1
fi

exit 0
EOF

chmod +x "$HOOK_PATH"
echo "✅ Pre-commit hook yuklendi: $HOOK_PATH"
echo "   Artik .env / .pem / secret pattern'i iceren commit'ler engellenecek."
