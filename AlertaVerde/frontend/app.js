// =============================================
// MÓDULO DE GERENCIAMENTO DE ARMAZENAMENTO (Simplificado para API)
// =============================================
class StorageManager {
    static setToken(token) {
        localStorage.setItem('agricultureSystem_token', token);
    }

    static getToken() {
        return localStorage.getItem('agricultureSystem_token');
    }

    static clearToken() {
        localStorage.removeItem('agricultureSystem_token');
    }
}

// =============================================
// MÓDULO DE GERENCIAMENTO DE ERROS
// =============================================
class ErrorHandler {
    static init() {
        window.addEventListener('error', this.handleGlobalError.bind(this));
        window.addEventListener('unhandledrejection', this.handlePromiseRejection.bind(this));
    }

    static handleGlobalError(event) {
        console.error('Erro global:', event.error);
        this.showNotification('Ocorreu um erro inesperado. Tente novamente.', 'error');
    }

    static handlePromiseRejection(event) {
        console.error('Promise rejeitada:', event.reason);
        event.preventDefault();
        // Não mostre notificação para toda promise rejeitada, 
        // pois trataremos elas localmente (ex: login inválido)
    }

    static showNotification(message, type = 'error') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    static getUserFriendlyError(error) {
        const messages = {
            'Failed to fetch': 'Erro de conexão. Verifique sua internet.',
            'city not found': 'Cidade não encontrada.',
            'invalid API key': 'Problema no serviço meteorológico.',
            'Network Error': 'Erro de rede. Verifique sua conexão.'
        };
        return messages[error.message] || 'Erro ao carregar dados climáticos';
    }
}

// =============================================
// MÓDULO DE CACHE DE DADOS (Para API de Clima)
// =============================================
class WeatherCache {
    constructor() {
        this.data = {};
        this.CACHE_DURATION = 10 * 60 * 1000; // 10 minutos
    }

    set(city, data) {
        this.data[city] = {
            data,
            timestamp: Date.now()
        };
    }

    get(city) {
        const cached = this.data[city];
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
            return cached.data;
        }
        return null;
    }

    clear() {
        this.data = {};
    }
}

// =============================================
// MÓDULO PRINCIPAL DA APLICAÇÃO (Modificado para API)
// =============================================
class AgricultureApp {
    constructor() {
        // API de Clima
        this.API_KEY = 'c078160b604897141ff65b50363e12a8';
        this.BASE_URL = 'https://api.openweathermap.org/data/2.5';
        
        // URL da sua API C++ (Back-end)
        // Por enquanto, usamos uma URL relativa.
        this.API_BASE_URL = '/api'; 

        this.weatherCache = new WeatherCache();
        this.init();
    }

    init() {
        ErrorHandler.init();
        this.setupEventListeners();
        this.checkLoggedInUser();
        this.setupRealTimeValidation();
    }

    // Função de "sanitização" simples para evitar XSS
    sanitizeInput(input) {
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    // =============================================
    // FUNÇÃO AJUDANTE: Requisições para API C++
    // =============================================
    async apiFetch(endpoint, options = {}) {
        const token = StorageManager.getToken();
        
        // Configurações padrão
        const defaultHeaders = {
            'Content-Type': 'application/json',
        };

        // Adiciona o token de autorização se ele existir
        if (token) {
            defaultHeaders['Authorization'] = `Bearer ${token}`;
        }

        // Junta os headers
        options.headers = { ...defaultHeaders, ...options.headers };

        // Faz a requisição
        const response = await fetch(`${this.API_BASE_URL}${endpoint}`, options);

        // Se a resposta for "Sem Conteúdo" (ex: um DELETE), retorne sucesso
        if (response.status === 204) {
            return { ok: true, data: null };
        }

        // Tenta pegar o JSON da resposta
        const data = await response.json();

        // Retorna um objeto padronizado
        return {
            ok: response.ok,
            status: response.status,
            data: data
        };
    }

    // =============================================
    // SEÇÃO DE AUTENTICAÇÃO (Modificada para API)
    // =============================================

    setupEventListeners() {
        // Autenticação
        document.getElementById('switch-to-register').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegisterForm();
        });
        
        document.getElementById('switch-to-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginForm();
        });
        
        // Funções de Login/Registro agora são 'async'
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.logoutUser());

        // Navegação
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab));
        });

        // Busca de Clima (API OpenWeather)
        document.querySelector('.search-btn').addEventListener('click', () => this.handleSearch());
        document.getElementById('city-search').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // Agricultura (API C++)
        document.getElementById('crop-form').addEventListener('submit', (e) => this.handleCropSubmit(e));
    }

    setupRealTimeValidation() {
        const registerPassword = document.getElementById('register-password');
        const registerConfirm = document.getElementById('register-confirm');
        
        registerPassword.addEventListener('input', () => this.validatePasswordStrength());
        registerConfirm.addEventListener('input', () => this.validatePasswordMatch());
    }

    // Validação de força da senha (Isso é SÓ para UX, a validação real é no back-end)
    calculatePasswordStrength(password) {
        let strength = 0;
        if (password.length >= 6) strength++;
        if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
        if (password.match(/\d/)) strength++;
        if (password.match(/[^a-zA-Z\d]/)) strength++;
        return strength;
    }
    
    validatePasswordStrength() {
        const password = document.getElementById('register-password').value;
        const strength = this.calculatePasswordStrength(password);
        const strengthBar = document.getElementById('password-strength');
        strengthBar.className = `password-strength strength-${strength}`;
        this.updateRegisterButton();
    }

    validatePasswordMatch() {
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        const matchElement = document.getElementById('password-match');
        
        if (confirm === '') {
            matchElement.textContent = '';
            matchElement.style.color = '';
        } else if (password === confirm) {
            matchElement.textContent = '✓ Senhas coincidem';
            matchElement.style.color = 'var(--success-color)';
        } else {
            matchElement.textContent = '✗ Senhas não coincidem';
            matchElement.style.color = 'var(--danger-color)';
        }
        this.updateRegisterButton();
    }

    updateRegisterButton() {
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        const registerBtn = document.getElementById('register-btn');
        
        const isStrong = this.calculatePasswordStrength(password) >= 2;
        const isMatching = password === confirm && password !== '';
        
        registerBtn.disabled = !(isStrong && isMatching);
    }

    showLoginForm() {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
    }

    showRegisterForm() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        try {
            const result = await this.apiFetch('/login', {
                method: 'POST',
                body: JSON.stringify({ email: email, password: password })
            });

            if (result.ok) {
                StorageManager.setToken(result.data.token);
                this.loginUser(result.data.user);
            } else {
                ErrorHandler.showNotification(result.data.message || 'E-mail ou senha incorretos!', 'error');
            }
        } catch (error) {
            console.error('Erro de conexão no login:', error);
            ErrorHandler.showNotification('Erro ao conectar com o servidor.', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const name = this.sanitizeInput(document.getElementById('register-name').value);
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        
        try {
            const result = await this.apiFetch('/register', {
                method: 'POST',
                body: JSON.stringify({ name: name, email: email, password: password })
            });

            if (result.ok) {
                ErrorHandler.showNotification('Cadastro realizado com sucesso! Faça login para continuar.', 'success');
                this.showLoginForm();
                document.getElementById('login-email').value = email;
            } else {
                // Erro vindo do back-end (ex: email já existe)
                ErrorHandler.showNotification(result.data.message || 'Erro ao cadastrar.', 'error');
            }
        } catch (error) {
            console.error('Erro de conexão no registro:', error);
            ErrorHandler.showNotification('Erro ao conectar com o servidor.', 'error');
        }
    }

    loginUser(user) {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        
        const userName = user.name ? user.name.split(' ')[0] : 'Usuário';
        document.getElementById('user-greeting').textContent = `Olá, ${this.sanitizeInput(userName)}!`;
        document.getElementById('user-email').textContent = this.sanitizeInput(user.email);
        
        // Carregar dados iniciais
        // (Ainda usa a API de clima, mas agora carrega as culturas do nosso back-end)
        const defaultCity = user.preferences?.defaultCity || 'Cabo de Santo Agostinho';
        document.getElementById('city-search').value = defaultCity;
        
        this.fetchWeatherData(defaultCity);
        this.loadCrops();
    }

    logoutUser() {
        StorageManager.clearToken();
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();
        this.showLoginForm();
    }

    async checkLoggedInUser() {
        const token = StorageManager.getToken();
        
        if (token) {
            try {
                // Tenta buscar os dados do usuário usando o token
                const result = await this.apiFetch('/me'); // '/api/me' é uma rota comum para "quem sou eu"
                
                if (result.ok) {
                    this.loginUser(result.data.user);
                } else {
                    // Token inválido ou expirado
                    StorageManager.clearToken();
                }
            } catch (error) {
                console.error('Erro ao validar token:', error);
                // Servidor pode estar offline, não faz nada
            }
        }
    }

    switchTab(tab) {
        const tabId = tab.getAttribute('data-tab');
        
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`${tabId}-content`).classList.add('active');
    }

    // =============================================
    // SEÇÃO DE CLIMA (API OpenWeather)
    // =============================================

    handleSearch() {
        const city = document.getElementById('city-search').value.trim();
        if (city) {
            this.fetchWeatherData(city);
        }
    }

    async fetchWeatherData(city) {
        const loadingEl = document.getElementById('loading');
        const errorEl = document.getElementById('error-message');
        const weatherContent = document.getElementById('weather-content');
        const apiStatus = document.getElementById('api-status');
        const offlineWarning = document.getElementById('offline-warning');
        
        const cached = this.weatherCache.get(city);
        if (cached) {
            this.updateWeatherUI(cached.current);
            this.updateForecastUI(cached.forecast);
            apiStatus.innerHTML = '<i class="fas fa-database"></i> Dados carregados do cache';
            apiStatus.style.background = '#e6fffa';
            return;
        }
        
        loadingEl.style.display = 'block';
        weatherContent.style.display = 'none';
        errorEl.style.display = 'none';
        offlineWarning.style.display = 'none';
        apiStatus.innerHTML = '<i class="fas fa-sync-alt"></i> Buscando dados da API...';
        apiStatus.style.background = '#e6fffa';
        
        try {
            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrentWeather(city),
                this.fetch5DayForecast(city)
            ]);
            
            if (!currentData || !forecastData) {
                throw new Error('Dados incompletos da API');
            }
            
            this.weatherCache.set(city, { current: currentData, forecast: forecastData });
            
            this.updateWeatherUI(currentData);
            this.updateForecastUI(forecastData);
            
            apiStatus.innerHTML = '<i class="fas fa-check-circle"></i> Dados atualizados com sucesso';
            apiStatus.style.background = '#c6f6d5';
            
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
            const offlineData = this.getOfflineWeatherData(city); // Tenta cache antigo
            if (offlineData) {
                offlineWarning.style.display = 'block';
                this.updateWeatherUI(offlineData.current);
                this.updateForecastUI(offlineData.forecast);
            } else {
                loadingEl.style.display = 'none';
                errorEl.style.display = 'block';
                document.getElementById('error-text').textContent = ErrorHandler.getUserFriendlyError(error);
                apiStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro na conexão com a API';
                apiStatus.style.background = '#fed7d7';
            }
        }
    }

    async fetchCurrentWeather(city) {
        const url = `${this.BASE_URL}/weather?q=${city}&units=metric&appid=${this.API_KEY}&lang=pt_br`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('city not found');
        }
        return await response.json();
    }

    async fetch5DayForecast(city) {
        const url = `${this.BASE_URL}/forecast?q=${city}&units=metric&appid=${this.API_KEY}&lang=pt_br`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Erro ao buscar previsão');
        }
        return await response.json();
    }

    getOfflineWeatherData(city) {
        return this.weatherCache.get(city) || null;
    }

    updateWeatherUI(data) {
        const weatherIcons = {
            'Clear': 'fa-sun', 'Clouds': 'fa-cloud', 'Rain': 'fa-cloud-rain',
            'Drizzle': 'fa-cloud-sun-rain', 'Thunderstorm': 'fa-bolt', 'Snow': 'fa-snowflake',
            'Mist': 'fa-smog', 'Smoke': 'fa-smog', 'Haze': 'fa-smog',
            'Dust': 'fa-smog', 'Fog': 'fa-smog', 'Sand': 'fa-smog',
            'Ash': 'fa-smog', 'Squall': 'fa-wind', 'Tornado': 'fa-tornado'
        };

        document.querySelector('.temp').textContent = `${Math.round(data.main.temp)}°C`;
        document.querySelector('.weather-text').textContent = data.weather[0].description;
        
        const weatherIcon = document.querySelector('.weather-icon');
        const iconClass = weatherIcons[data.weather[0].main] || 'fa-cloud';
        weatherIcon.className = `fas ${iconClass} weather-icon`;
        
        const detailValues = document.querySelectorAll('.detail-value');
        detailValues[0].textContent = `${data.main.humidity}%`;
        detailValues[1].textContent = `${data.wind.speed} km/h`;
        detailValues[2].textContent = `${data.main.pressure} hPa`;
        detailValues[3].textContent = data.visibility ? `${(data.visibility / 1000).toFixed(1)}` : '--';
        
        document.querySelector('.location').innerHTML = 
            `<i class="fas fa-map-marker-alt"></i> ${data.name}, ${data.sys.country}`;
        
        document.querySelector('.update-time').textContent = new Date().toLocaleTimeString('pt-BR');
        
        this.generateRecommendations(data);
        
        document.getElementById('weather-content').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error-message').style.display = 'none';
    }

    updateForecastUI(forecastData) {
        const weekDays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const weatherIcons = {
            'Clear': 'fa-sun', 'Clouds': 'fa-cloud', 'Rain': 'fa-cloud-rain',
            'Drizzle': 'fa-cloud-sun-rain', 'Thunderstorm': 'fa-bolt',
            'Snow': 'fa-snowflake', 'Mist': 'fa-smog'
        };

        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = '';
        
        const dailyForecasts = [];
        const processedDays = new Set();
        
        forecastData.list.forEach(item => {
            const date = new Date(item.dt * 1000);
            const dateString = date.toDateString();
            
            if (!processedDays.has(dateString) && dailyForecasts.length < 5) {
                processedDays.add(dateString);
                dailyForecasts.push({
                    date: dateString,
                    dayName: weekDays[date.getDay()],
                    temp: Math.round(item.main.temp),
                    temp_min: Math.round(item.main.temp_min),
                    temp_max: Math.round(item.main.temp_max),
                    description: item.weather[0].description,
                    icon: item.weather[0].main,
                    humidity: item.main.humidity
                });
            }
        });
        
        dailyForecasts.forEach(day => {
            const forecastCard = document.createElement('div');
            forecastCard.className = 'forecast-card';
            const iconClass = weatherIcons[day.icon] || 'fa-cloud';
            
            forecastCard.innerHTML = `
                <div class="forecast-day">${day.dayName}</div>
                <div class="forecast-date">${new Date(day.date).toLocaleDateString('pt-BR')}</div>
                <i class="fas ${iconClass}" style="font-size: 2rem; color: var(--secondary-color); margin: 0.5rem 0;"></i>
                <div class="forecast-temp">${day.temp}°C</div>
                <div class="temp-range">Min: ${day.temp_min}°C / Max: ${day.temp_max}°C</div>
                <div class="forecast-desc">${day.description}</div>
                <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #718096;">
                    <i class="fas fa-tint"></i> ${day.humidity}%
                </div>
            `;
            forecastContainer.appendChild(forecastCard);
        });
    }

    generateRecommendations(weatherData) {
        const cropRecommendations = {
            'quente-seco': ['Coco', 'Cana-de-açúcar', 'Manga', 'Caju', 'Abacaxi', 'Sorgo'],
            'quente-umido': ['Banana', 'Mamão', 'Maracujá', 'Mandioca', 'Inhame', 'Abacate'],
            'temperado': ['Milho', 'Feijão', 'Tomate', 'Pimentão', 'Cenoura', 'Alface'],
            'chuvoso': ['Arroz', 'Banana', 'Mandioca', 'Taro', 'Elódea', 'Berinjela']
        };

        const temp = weatherData.main.temp;
        const humidity = weatherData.main.humidity;
        const weatherMain = weatherData.weather[0].main;
        
        let climateType = '';
        let irrigation = '';
        let period = '';
        
        if (temp > 28 && humidity < 60) {
            climateType = 'quente-seco';
            irrigation = 'Intensiva - 3 vezes ao dia';
            period = 'Plantio ideal imediato';
        } else if (temp > 25 && humidity > 70) {
            climateType = 'quente-umido';
            irrigation = 'Moderada - 2 vezes ao dia';
            period = 'Bom período para plantio';
        } else if (temp > 20 && temp <= 25) {
            climateType = 'temperado';
            irrigation = 'Leve - 1 vez ao dia';
            period = 'Período favorável';
        } else {
            climateType = 'chuvoso';
            irrigation = 'Reduzida - Apenas se necessário';
            period = 'Aguardar melhora do clima';
        }
        
        document.getElementById('recommended-crops').textContent = cropRecommendations[climateType].join(', ');
        document.getElementById('irrigation-tip').textContent = irrigation;
        document.getElementById('planting-period').textContent = period;
        
        const alertText = document.getElementById('alert-text');
        const weatherAlert = document.getElementById('weather-alert');
        
        if (temp > 35) {
            alertText.textContent = 'ALERTA: Temperatura muito alta para a maioria das culturas';
            weatherAlert.className = 'agriculture-alert alert-danger';
        } else if (temp < 15) {
            alertText.textContent = 'ALERTA: Temperatura muito baixa para culturas tropicais';
            weatherAlert.className = 'agriculture-alert alert-danger';
        } else if (humidity < 40) {
            alertText.textContent = 'ALERTA: Umidade muito baixa - aumentar irrigação';
            weatherAlert.className = 'agriculture-alert alert-danger';
        } else if (weatherMain === 'Rain') {
            alertText.textContent = 'Chuva prevista - reduzir irrigação';
            weatherAlert.className = 'agriculture-alert';
        } else {
            alertText.textContent = 'Condições favoráveis para cultivo';
            weatherAlert.className = 'agriculture-alert alert-success';
        }
    }

    // =============================================
    // SEÇÃO DE AGRICULTURA (Modificada para API C++)
    // =============================================

    async loadCrops() {
        const cropsContainer = document.getElementById('crops-container');
        cropsContainer.innerHTML = '<p>Carregando culturas...</p>';

        try {
            const result = await this.apiFetch('/crops'); // GET /api/crops
            
            if (!result.ok) {
                throw new Error(result.data.message || 'Erro ao carregar culturas');
            }

            const savedCrops = result.data.crops || [];
            cropsContainer.innerHTML = '';
            
            if (savedCrops.length === 0) {
                cropsContainer.innerHTML = '<p>Nenhuma cultura cadastrada ainda.</p>';
                return;
            }
            
            savedCrops.forEach(crop => {
                const cropItem = document.createElement('div');
                cropItem.className = 'crop-item';
                // O 'id' vem do banco de dados (ex: MongoDB ObjectId ou um UUID)
                const cropId = crop.id; 
                const daysPlanted = Math.floor((new Date() - new Date(crop.plantingDate)) / (1000 * 60 * 60 * 24));
                
                cropItem.innerHTML = `
                    <div class="crop-header">
                        <span class="crop-name">${this.sanitizeInput(crop.name)}</span>
                        <span class="crop-date">Plantio: ${new Date(crop.plantingDate).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div class="crop-details">
                        <div class="crop-detail">Tipo: ${this.sanitizeInput(crop.type)}</div>
                        <div class="crop-detail">Área: ${crop.area} ha</div>
                        <div class="crop-detail">Dias: ${daysPlanted}d</div>
                    </div>
                    <button onclick="app.deleteCrop('${cropId}')" class="btn" style="background: var(--danger-color); color: white; margin-top: 0.5rem; padding: 0.3rem 0.8rem;">
                        <i class="fas fa-trash"></i> Remover
                    </button>
                `;
                cropsContainer.appendChild(cropItem);
            });

        } catch (error) {
            console.error('Erro ao carregar culturas:', error);
            cropsContainer.innerHTML = '<p style="color: red;">Não foi possível carregar suas culturas.</p>';
            ErrorHandler.showNotification(error.message, 'error');
        }
    }

    async handleCropSubmit(e) {
        e.preventDefault();
        
        const cropData = {
            name: this.sanitizeInput(document.getElementById('crop-name').value),
            type: document.getElementById('crop-type').value,
            plantingDate: document.getElementById('planting-date').value,
            area: document.getElementById('crop-area').value
        };
        
        try {
            const result = await this.apiFetch('/crops', { // POST /api/crops
                method: 'POST',
                body: JSON.stringify(cropData)
            });

            if (!result.ok) {
                throw new Error(result.data.message || 'Erro ao salvar cultura');
            }
            
            document.getElementById('crop-form').reset();
            document.getElementById('planting-date').valueAsDate = new Date();
            
            this.loadCrops(); // Recarrega a lista
            ErrorHandler.showNotification('Cultura cadastrada com sucesso!', 'success');

        } catch (error) {
            console.error('Erro ao salvar cultura:', error);
            ErrorHandler.showNotification(error.message, 'error');
        }
    }

    async deleteCrop(cropId) {
        // Confirmação
        if (!confirm('Tem certeza de que deseja remover esta cultura?')) {
            return;
        }

        try {
            const result = await this.apiFetch(`/crops/${cropId}`, { // DELETE /api/crops/:id
                method: 'DELETE'
            });

            if (!result.ok) {
                throw new Error(result.data.message || 'Erro ao remover cultura');
            }

            this.loadCrops(); // Recarrega a lista
            ErrorHandler.showNotification('Cultura removida com sucesso!', 'success');

        } catch (error) {
            console.error('Erro ao deletar cultura:', error);
            ErrorHandler.showNotification(error.message, 'error');
        }
    }
}

// =============================================
// INICIALIZAÇÃO DA APLICAÇÃO
// =============================================
let app;
document.addEventListener('DOMContentLoaded', function() {
    app = new AgricultureApp();
    
    // Configurar data atual no formulário
    document.getElementById('planting-date').valueAsDate = new Date();
    
    // Expor a instância 'app' globalmente para que
    // os botões 'onclick="app.deleteCrop()"' funcionem
    window.app = app;
});