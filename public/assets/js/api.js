// public/assets/js/api.js

const ApiService = {
    baseUrl: '/api',

    async request(endpoint, options = {}) {
        const token = localStorage.getItem('edunex_token');
        
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, config);
            const result = await response.json();

            // Backend 'status: error' dönüyorsa veya HTTP kodu hatalıysa
            if (!response.ok || result.status === 'error') {
                if (response.status === 401 && localStorage.getItem('edunex_token')) {
                    this.logout();
                }
                // Artık 'mesaj' değil 'message' kullanıyoruz
                throw new Error(result.message || 'An unexpected error occurred.');
            }

            return result; // { status, message, data } objesini döner
        } catch (error) {
            console.error(`[API Error] [${endpoint}]:`, error.message);
            throw error;
        }
    },

    async get(endpoint) { return this.request(endpoint, { method: 'GET' }); },
    async post(endpoint, body) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) }); },
    async put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) }); },
    async delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); },

    logout() {
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
    }
};