/**
 * 用户权限管理模块
 * 提供用户管理、角色分配和权限控制功能
 */

class UsersModule {
    constructor() {
        this.table = null;
        this.currentFilters = {};
        this.init();
    }

    init() {
        console.log('UsersModule: 初始化用户权限管理模块');
        this.initTable();
    }

    initTable() {
        if ($.fn.DataTable) {
            this.table = $('#users-table').DataTable({
                processing: true,
                serverSide: false,
                ajax: {
                    url: '/api/users',
                    type: 'GET',
                    data: (d) => {
                        return {
                            ...d,
                            ...this.currentFilters,
                            page: Math.floor(d.start / d.length) + 1,
                            limit: d.length
                        };
                    },
                    dataSrc: (json) => {
                        if (json.success) {
                            return json.data.items;
                        } else {
                            console.error('获取用户数据失败:', json.message);
                            return [];
                        }
                    }
                },
                columns: [
                    {
                        data: 'username',
                        title: '用户名',
                        render: (data, type, row) => {
                            return `<a href="#" onclick="usersModule.viewUser('${row.id}')">${data}</a>`;
                        }
                    },
                    {
                        data: 'full_name',
                        title: '姓名',
                        render: (data, type, row) => {
                            return data || '-';
                        }
                    },
                    {
                        data: 'email',
                        title: '邮箱',
                        render: (data, type, row) => {
                            return data || '-';
                        }
                    },
                    {
                        data: 'roles.name',
                        title: '角色',
                        render: (data, type, row) => {
                            return data || '-';
                        }
                    },
                    {
                        data: 'is_active',
                        title: '状态',
                        render: (data, type, row) => {
                            const statusMap = {
                                true: { text: '活跃', class: 'badge-success' },
                                false: { text: '禁用', class: 'badge-danger' }
                            };
                            const status = statusMap[data] || { text: '未知', class: 'badge-secondary' };
                            return `<span class="badge ${status.class}">${status.text}</span>`;
                        }
                    },
                    {
                        data: 'created_at',
                        title: '创建时间',
                        render: (data, type, row) => {
                            return adminCore.formatDate(data);
                        }
                    },
                    {
                        data: null,
                        title: '操作',
                        orderable: false,
                        render: (data, type, row) => {
                            return `
                                <button class="btn btn-sm" onclick="usersModule.viewUser('${row.id}')">查看</button>
                                <button class="btn btn-sm" onclick="usersModule.editUser('${row.id}')">编辑</button>
                                <button class="btn btn-sm" onclick="usersModule.toggleUserStatus('${row.id}', ${row.is_active})">${row.is_active ? '禁用' : '启用'}</button>
                            `;
                        }
                    }
                ],
                order: [[5, 'desc']], // 默认按创建时间倒序
                pageLength: 25,
                lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
                language: {
                    processing: "处理中...",
                    lengthMenu: "显示 _MENU_ 条记录",
                    zeroRecords: "没有找到记录",
                    info: "显示第 _START_ 至 _END_ 项结果，共 _TOTAL_ 项",
                    infoEmpty: "显示第 0 至 0 项结果，共 0 项",
                    infoFiltered: "(由 _MAX_ 项结果过滤)",
                    search: "搜索:",
                    paginate: {
                        first: "首页",
                        last: "末页",
                        next: "下页",
                        previous: "上页"
                    }
                }
            });
        }
    }

    refreshTable() {
        if (this.table) {
            this.table.ajax.reload();
        }
    }

    async viewUser(userId) {
        try {
            const response = await adminCore.apiRequest(`/api/users?id=${userId}`);
            if (response.success) {
                this.showUserModal(response.data, 'view');
            }
        } catch (error) {
            console.error('获取用户详情失败:', error);
        }
    }

    async editUser(userId) {
        try {
            const response = await adminCore.apiRequest(`/api/users?id=${userId}`);
            if (response.success) {
                this.showUserModal(response.data, 'edit');
            }
        } catch (error) {
            console.error('获取用户详情失败:', error);
        }
    }

    async createUser() {
        this.showUserModal(null, 'create');
    }

    showUserModal(userData, mode) {
        const modal = this.createUserModal(userData, mode);
        document.body.appendChild(modal);
        
        // 显示模态框
        modal.style.display = 'block';
        
        // 绑定事件
        this.bindUserModalEvents(modal, userData, mode);
    }

    createUserModal(userData, mode) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background-color: white;
            margin: 5% auto;
            padding: 20px;
            border-radius: 8px;
            width: 80%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
        `;

        const title = mode === 'create' ? '新建用户' : 
                     mode === 'edit' ? '编辑用户' : '查看用户';
        
        modalContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>${title}</h3>
                <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
            </div>
            
            <form id="userForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <label>用户名 *</label>
                        <input type="text" name="username" value="${userData?.username || ''}" ${mode === 'view' ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label>邮箱 *</label>
                        <input type="email" name="email" value="${userData?.email || ''}" ${mode === 'view' ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label>姓名</label>
                        <input type="text" name="full_name" value="${userData?.full_name || ''}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>角色 *</label>
                        <select name="role_id" ${mode === 'view' ? 'disabled' : ''} required>
                            <option value="">选择角色</option>
                            <option value="super_admin" ${userData?.roles?.name === 'super_admin' ? 'selected' : ''}>超级管理员</option>
                            <option value="operations_manager" ${userData?.roles?.name === 'operations_manager' ? 'selected' : ''}>运营管理员</option>
                            <option value="order_manager" ${userData?.roles?.name === 'order_manager' ? 'selected' : ''}>订单管理员</option>
                            <option value="inventory_manager" ${userData?.roles?.name === 'inventory_manager' ? 'selected' : ''}>库存管理员</option>
                            <option value="ad_manager" ${userData?.roles?.name === 'ad_manager' ? 'selected' : ''}>广告管理员</option>
                            <option value="finance" ${userData?.roles?.name === 'finance' ? 'selected' : ''}>财务</option>
                            <option value="viewer" ${userData?.roles?.name === 'viewer' ? 'selected' : ''}>查看者</option>
                        </select>
                    </div>
                    ${mode === 'create' ? `
                    <div>
                        <label>密码 *</label>
                        <input type="password" name="password" required>
                    </div>
                    <div>
                        <label>确认密码 *</label>
                        <input type="password" name="confirm_password" required>
                    </div>
                    ` : ''}
                    <div>
                        <label>状态</label>
                        <select name="is_active" ${mode === 'view' ? 'disabled' : ''}>
                            <option value="true" ${userData?.is_active ? 'selected' : ''}>活跃</option>
                            <option value="false" ${!userData?.is_active ? 'selected' : ''}>禁用</option>
                        </select>
                    </div>
                </div>
                
                <div style="margin-top: 20px; text-align: right;">
                    <button type="button" class="btn btn-secondary modal-close">取消</button>
                    ${mode !== 'view' ? '<button type="submit" class="btn btn-primary">保存</button>' : ''}
                </div>
            </form>
        `;

        modal.appendChild(modalContent);
        return modal;
    }

    bindUserModalEvents(modal, userData, mode) {
        // 关闭模态框
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });

        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        // 表单提交
        if (mode !== 'view') {
            const form = modal.querySelector('#userForm');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveUser(form, userData, mode);
            });
        }
    }

    async saveUser(form, userData, mode) {
        try {
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            // 验证密码
            if (mode === 'create') {
                if (data.password !== data.confirm_password) {
                    adminCore.showNotification('密码和确认密码不匹配', 'error');
                    return;
                }
                if (data.password.length < 6) {
                    adminCore.showNotification('密码长度至少6位', 'error');
                    return;
                }
            }

            // 转换布尔值
            data.is_active = data.is_active === 'true';

            // 获取角色ID
            const roleMap = {
                'super_admin': 'super_admin',
                'operations_manager': 'operations_manager',
                'order_manager': 'order_manager',
                'inventory_manager': 'inventory_manager',
                'ad_manager': 'ad_manager',
                'finance': 'finance',
                'viewer': 'viewer'
            };
            data.role_id = roleMap[data.role_id];

            let response;
            if (mode === 'create') {
                response = await adminCore.apiRequest('/api/users', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
            } else {
                response = await adminCore.apiRequest(`/api/users?id=${userData.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
            }

            if (response.success) {
                adminCore.showNotification('用户保存成功', 'success');
                document.body.removeChild(form.closest('.modal'));
                this.refreshTable();
            }
        } catch (error) {
            console.error('保存用户失败:', error);
        }
    }

    async toggleUserStatus(userId, currentStatus) {
        const action = currentStatus ? '禁用' : '启用';
        const confirmMessage = `确定要${action}这个用户吗？`;
        
        if (confirm(confirmMessage)) {
            try {
                const response = await adminCore.apiRequest(`/api/users?id=${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ is_active: !currentStatus })
                });

                if (response.success) {
                    adminCore.showNotification(`用户${action}成功`, 'success');
                    this.refreshTable();
                }
            } catch (error) {
                console.error(`${action}用户失败:`, error);
            }
        }
    }
}

// 创建全局实例
window.usersModule = new UsersModule();
