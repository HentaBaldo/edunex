/**
 * EduNex - Global API Service
 * Centralized fetch wrapper with proper error handling
 * ✅ User Token + Admin Token desteği
 */

const ApiService = {
    /**
     * Aktif token'ı belirle (User veya Admin)
     */
    getActiveToken() {
        // Önce admin token kontrol et
        const adminToken = localStorage.getItem('edunex_admin_token');
        if (adminToken) return adminToken;
        
        // Sonra user token
        const userToken = localStorage.getItem('edunex_token');
        if (userToken) return userToken;
        
        return null;
    },

    /**
     * GET isteği
     */
    async get(endpoint) {
        const token = this.getActiveToken();
        const headers = { 'Content-Type': 'application/json' };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${window.location.origin}/api${endpoint}`, {
                method: 'GET',
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                const error = new Error(data.message || `HTTP ${response.status}`);
                error.statusCode = response.status;
                throw error;
            }

            return data;

        } catch (error) {
            console.error(`[API Error] [${endpoint}]:`, error.message);
            throw error;
        }
    },

    /**
     * POST isteği
     */
    async post(endpoint, body) {
        const token = this.getActiveToken();
        const headers = { 'Content-Type': 'application/json' };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${window.location.origin}/api${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                data = {
                    message: `Server Error: ${response.status}`,
                    statusCode: response.status
                };
            }

            if (!response.ok) {
                const error = new Error(data.message || `HTTP ${response.status}`);
                error.statusCode = response.status;
                throw error;
            }

            return data;

        } catch (error) {
            console.error(`[API Error] [${endpoint}]:`, error.message);
            throw error;
        }
    },

    /**
     * PUT isteği
     */
    async put(endpoint, body) {
        const token = this.getActiveToken();
        const headers = { 'Content-Type': 'application/json' };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${window.location.origin}/api${endpoint}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(body)
            });

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                data = {
                    message: `Server Error: ${response.status}`,
                    statusCode: response.status
                };
            }

            if (!response.ok) {
                const error = new Error(data.message || `HTTP ${response.status}`);
                error.statusCode = response.status;
                throw error;
            }

            return data;

        } catch (error) {
            console.error(`[API Error] [${endpoint}]:`, error.message);
            throw error;
        }
    },

    /**
     * PATCH isteği (kısmi güncelleme — örn. ticket durum değişimi)
     */
    async patch(endpoint, body) {
        const token = this.getActiveToken();
        const headers = { 'Content-Type': 'application/json' };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${window.location.origin}/api${endpoint}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(body)
            });

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                data = {
                    message: `Server Error: ${response.status}`,
                    statusCode: response.status
                };
            }

            if (!response.ok) {
                const error = new Error(data.message || `HTTP ${response.status}`);
                error.statusCode = response.status;
                throw error;
            }

            return data;

        } catch (error) {
            console.error(`[API Error] [${endpoint}]:`, error.message);
            throw error;
        }
    },

    /**
     * DELETE isteği (opsiyonel body ile - ornegin sebep alani icin)
     */
    async delete(endpoint, body) {
        const token = this.getActiveToken();
        const headers = { 'Content-Type': 'application/json' };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const fetchOptions = { method: 'DELETE', headers };
            if (body !== undefined && body !== null) {
                fetchOptions.body = JSON.stringify(body);
            }
            const response = await fetch(`${window.location.origin}/api${endpoint}`, fetchOptions);

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                data = {
                    message: `Server Error: ${response.status}`,
                    statusCode: response.status
                };
            }

            if (!response.ok) {
                const error = new Error(data.message || `HTTP ${response.status}`);
                error.statusCode = response.status;
                throw error;
            }

            return data;

        } catch (error) {
            console.error(`[API Error] [${endpoint}]:`, error.message);
            throw error;
        }
    },

    /**
     * FormData POST (Video Upload için)
     */
    async postFormData(endpoint, formData) {
        const token = this.getActiveToken();
        const headers = {};
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        // Content-Type'ı FormData için otomatik ayarla

        try {
            const response = await fetch(`${window.location.origin}/api${endpoint}`, {
                method: 'POST',
                headers,
                body: formData
            });

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                data = {
                    message: `Server Error: ${response.status}`,
                    statusCode: response.status
                };
            }

            if (!response.ok) {
                const error = new Error(data.message || `HTTP ${response.status}`);
                error.statusCode = response.status;
                throw error;
            }

            return data;

        } catch (error) {
            console.error(`[API Error] [${endpoint}]:`, error.message);
            throw error;
        }
    },

    /**
     * Oturum verilerini koklu temizler.
     * Sadece bilinen anahtarlari degil, edunex_* on ekli HER anahtari hem
     * localStorage hem de sessionStorage'dan kaldirir. Boylece "iyzico_baglandi"
     * gibi gelecekteki flag'ler bile A->B hesap gecisinde sizmaz.
     *
     * @param {'user'|'admin'} [scope] - 'admin' verilirse admin anahtarlari da temizlenir.
     */
    _clearAllEdunexStorage(scope = 'user') {
        const sil = (store) => {
            const silinecek = [];
            for (let i = 0; i < store.length; i++) {
                const k = store.key(i);
                if (!k) continue;
                // edunex_* tum anahtarlar -- ileride eklenecek flag'leri de kapsar
                if (k.startsWith('edunex_')) {
                    // Admin scope'unda da degilsek admin anahtarlarini koruyalim,
                    // boylece admin sekmesi acikken user logout admin'i atmamis olur.
                    if (scope !== 'admin' && k.startsWith('edunex_admin_')) continue;
                    silinecek.push(k);
                }
            }
            silinecek.forEach(k => store.removeItem(k));
        };
        try { sil(localStorage); } catch {}
        try { sil(sessionStorage); } catch {}
    },

    /**
     * User Logout
     */
    logoutUser() {
        this._clearAllEdunexStorage('user');
        window.location.href = '/auth/index.html';
    },

    /**
     * Admin Logout
     */
    logoutAdmin() {
        this._clearAllEdunexStorage('admin');
        window.location.href = '/admin/login.html';
    },

    /**
     * Genel Logout
     */
    logout() {
        const adminToken = localStorage.getItem('edunex_admin_token');
        const userToken = localStorage.getItem('edunex_token');

        if (adminToken) {
            this.logoutAdmin();
        } else if (userToken) {
            this.logoutUser();
        } else {
            window.location.href = '/auth/index.html';
        }
    }
};