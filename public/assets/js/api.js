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
            const response = await fetch(`/api${endpoint}`, {
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
            const response = await fetch(`/api${endpoint}`, {
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
            const response = await fetch(`/api${endpoint}`, {
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
     * DELETE isteği
     */
    async delete(endpoint) {
        const token = this.getActiveToken();
        const headers = { 'Content-Type': 'application/json' };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`/api${endpoint}`, {
                method: 'DELETE',
                headers
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
            const response = await fetch(`/api${endpoint}`, {
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
     * User Logout
     */
    logoutUser() {
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
    },

    /**
     * Admin Logout
     */
    logoutAdmin() {
        localStorage.removeItem('edunex_admin_token');
        localStorage.removeItem('edunex_admin_user');
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