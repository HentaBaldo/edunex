// public/assets/js/api.js

const ApiService = {
    baseUrl: '/api',

    async request(endpoint, options = {}) {
        const isAdminPath = window.location.pathname.startsWith('/admin');
        const tokenKey = isAdminPath ? 'edunex_admin_token' : 'edunex_token';
        const token = localStorage.getItem(tokenKey);
        
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (token) headers['Authorization'] = `Bearer ${token}`;

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, config);
            const result = await response.json();

            if (!response.ok || result.status === 'error') {
                if (response.status === 401 && token) {
                    this.logout();
                }
                throw new Error(result.message || 'An unexpected error occurred.');
            }

            return result;
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
        const isAdminPath = window.location.pathname.startsWith('/admin');
        if (isAdminPath) {
            localStorage.removeItem('edunex_admin_token');
            localStorage.removeItem('edunex_admin_user');
            window.location.replace('/admin/login.html');
        } else {
            localStorage.removeItem('edunex_token');
            localStorage.removeItem('edunex_user');
            window.location.replace('/auth/index.html');
        }
    }
};