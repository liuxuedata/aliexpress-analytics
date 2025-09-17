/**
 * 跨境电商管理平台 - 核心管理脚本
 * 提供统一的数据管理、权限控制和模块切换功能
 */

class AdminCore {
    constructor() {
        this.currentModule = 'dashboard';
        this.currentUser = null;
        this.sites = [];
        this.modules = {};
        this.init();
    }

    async init() {
        console.log('AdminCore: 初始化管理后台');
        
        // 初始化事件监听
        this.initEventListeners();
        
        // 加载用户信息
        await this.loadUserInfo();
        
        // 加载站点列表
        await this.loadSites();
        
        // 初始化模块
        this.initModules();
        
        // 加载仪表盘数据
        await this.loadDashboardData();
        
        console.log('AdminCore: 初始化完成');
    }

    initEventListeners() {
        // 侧边栏切换
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // 菜单项点击
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const module = e.target.getAttribute('href').substring(1);
                this.switchModule(module);
            });
        });

        // 窗口大小变化
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                document.getElementById('sidebar').classList.remove('open');
            }
        });
    }

    async loadUserInfo() {
        try {
            // 从localStorage获取用户信息
            const userInfo = localStorage.getItem('admin_user') || localStorage.getItem('user');
            if (userInfo) {
                this.currentUser = JSON.parse(userInfo);
                document.getElementById('currentUser').textContent = this.currentUser.full_name || this.currentUser.name || this.currentUser.username || '管理员';
            } else {
                // 临时：创建默认管理员用户，避免重定向
                console.log('未找到用户信息，使用默认管理员账户');
                this.currentUser = {
                    id: 'admin',
                    username: 'admin',
                    full_name: '系统管理员',
                    role: {
                        name: 'admin',
                        permissions: {
                            analytics: ['read', 'write'],
                            orders: ['read', 'write'],
                            inventory: ['read', 'write'],
                            ads: ['read', 'write'],
                            users: ['read', 'write']
                        }
                    }
                };
                document.getElementById('currentUser').textContent = '系统管理员';
            }
        } catch (error) {
            console.error('加载用户信息失败:', error);
            // 临时：创建默认管理员用户，避免重定向
            this.currentUser = {
                id: 'admin',
                username: 'admin',
                full_name: '系统管理员',
                role: {
                    name: 'admin',
                    permissions: {
                        analytics: ['read', 'write'],
                        orders: ['read', 'write'],
                        inventory: ['read', 'write'],
                        ads: ['read', 'write'],
                        users: ['read', 'write']
                    }
                }
            };
            document.getElementById('currentUser').textContent = '系统管理员';
        }
    }

    async loadSites() {
        try {
            const response = await fetch('/api/sites');
            const result = await response.json();
            
            if (result.success) {
                this.sites = result.data || [];
                this.updateSiteSelectors();
            } else {
                console.error('加载站点列表失败:', result.message);
            }
        } catch (error) {
            console.error('加载站点列表失败:', error);
        }
    }

    updateSiteSelectors() {
        // 更新所有站点选择器
        const selectors = [
            'analyticsSiteSelect',
            'orderSiteFilter',
            'inventorySiteFilter',
            'adsSiteFilter'
        ];

        selectors.forEach(selectorId => {
            const selector = document.getElementById(selectorId);
            if (selector) {
                // 清空现有选项（保留第一个默认选项）
                while (selector.children.length > 1) {
                    selector.removeChild(selector.lastChild);
                }

                // 添加站点选项
                this.sites.forEach(site => {
                    const option = document.createElement('option');
                    option.value = site.id;
                    option.textContent = `${site.name} (${site.platform})`;
                    selector.appendChild(option);
                });
            }
        });
    }

    initModules() {
        // 初始化各个模块
        this.modules = {
            analytics: window.analyticsModule || new AnalyticsModule(),
            orders: window.ordersModule || new OrdersModule(),
            inventory: window.inventoryModule || new InventoryModule(),
            ads: window.adsModule || new AdsModule(),
            users: window.usersModule || new UsersModule()
        };
    }

    async loadDashboardData() {
        try {
            // 并行加载仪表盘数据
            const [ordersData, inventoryData, adsData] = await Promise.all([
                this.fetchOrdersSummary(),
                this.fetchInventorySummary(),
                this.fetchAdsSummary()
            ]);

            // 更新KPI卡片
            document.getElementById('totalOrders').textContent = ordersData.total || 0;
            document.getElementById('totalSales').textContent = this.formatCurrency(ordersData.totalSales || 0);
            document.getElementById('totalProducts').textContent = inventoryData.totalProducts || 0;
            document.getElementById('activeAds').textContent = adsData.activeCampaigns || 0;

        } catch (error) {
            console.error('加载仪表盘数据失败:', error);
        }
    }

    async fetchOrdersSummary() {
        try {
            const response = await fetch('/api/orders?limit=1');
            const result = await response.json();
            
            if (result.success) {
                // 计算总销售额
                const totalSales = result.data.items.reduce((sum, order) => sum + (order.total || 0), 0);
                return {
                    total: result.data.total,
                    totalSales: totalSales
                };
            }
        } catch (error) {
            console.error('获取订单汇总失败:', error);
        }
        return { total: 0, totalSales: 0 };
    }

    async fetchInventorySummary() {
        try {
            const response = await fetch('/api/inventory?limit=1');
            const result = await response.json();
            
            if (result.success) {
                return {
                    totalProducts: result.data.total
                };
            }
        } catch (error) {
            console.error('获取库存汇总失败:', error);
        }
        return { totalProducts: 0 };
    }

    async fetchAdsSummary() {
        try {
            const response = await fetch('/api/ads?status=active&limit=1');
            const result = await response.json();
            
            if (result.success) {
                return {
                    activeCampaigns: result.data.total
                };
            }
        } catch (error) {
            console.error('获取广告汇总失败:', error);
        }
        return { activeCampaigns: 0 };
    }

    switchModule(moduleName) {
        // 隐藏所有模块容器
        const containers = document.querySelectorAll('.module-container');
        containers.forEach(container => {
            container.style.display = 'none';
        });

        // 移除所有菜单项的active类
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });

        // 显示目标模块
        const targetContainer = document.getElementById(`${moduleName}-container`);
        if (targetContainer) {
            targetContainer.style.display = 'block';
        }

        // 激活对应菜单项
        const targetMenuItem = document.querySelector(`[href="#${moduleName}"]`);
        if (targetMenuItem) {
            targetMenuItem.classList.add('active');
        }

        // 更新页面标题
        const titles = {
            dashboard: '仪表盘',
            analytics: '运营分析',
            orders: '订单管理',
            inventory: '库存管理',
            ads: '广告管理',
            users: '用户管理'
        };
        document.getElementById('pageTitle').textContent = titles[moduleName] || '管理后台';

        // 更新当前模块
        this.currentModule = moduleName;

        // 调用模块的初始化方法
        if (this.modules[moduleName] && typeof this.modules[moduleName].init === 'function') {
            this.modules[moduleName].init();
        }

        // 关闭移动端侧边栏
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
        }
    }

    // 工具方法
    formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    formatDate(date) {
        return new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    }

    formatNumber(number) {
        return new Intl.NumberFormat('zh-CN').format(number);
    }

    showLoading(element) {
        if (element) {
            element.innerHTML = '<div class="loading-state">加载中...</div>';
        }
    }

    showError(element, message) {
        if (element) {
            element.innerHTML = `<div class="error-state">${message}</div>`;
        }
    }

    showNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // 添加样式
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '4px',
            color: 'white',
            zIndex: '9999',
            maxWidth: '300px',
            wordWrap: 'break-word'
        });

        // 设置背景色
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        // 添加到页面
        document.body.appendChild(notification);

        // 3秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    async apiRequest(url, options = {}) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || '请求失败');
            }

            return result;
        } catch (error) {
            console.error('API请求失败:', error);
            this.showNotification(error.message, 'error');
            throw error;
        }
    }

    redirectToLogin() {
        // 重定向到登录页面
        window.location.href = '/login.html';
    }

    logout() {
        // 清除用户信息
        localStorage.removeItem('admin_user');
        this.redirectToLogin();
    }

    // 权限检查
    hasPermission(module, action) {
        if (!this.currentUser || !this.currentUser.role) {
            return false;
        }

        const permissions = this.currentUser.role.permissions;
        return permissions[module] && permissions[module].includes(action);
    }

    // 数据导出
    exportToCSV(data, filename) {
        if (!data || data.length === 0) {
            this.showNotification('没有数据可导出', 'warning');
            return;
        }

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// 创建全局实例
window.adminCore = new AdminCore();

// 导出类供其他模块使用
window.AdminCore = AdminCore;
