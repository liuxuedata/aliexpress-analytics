/**
 * 订单管理模块
 * 提供订单的增删改查、状态管理等功能
 */

class OrdersModule {
    constructor() {
        this.table = null;
        this.currentFilters = {};
        this.init();
    }

    init() {
        console.log('OrdersModule: 初始化订单管理模块');
        this.initTable();
        this.initFilters();
    }

    initTable() {
        if ($.fn.DataTable) {
            this.table = $('#orders-table').DataTable({
                processing: true,
                serverSide: false,
                ajax: {
                    url: '/api/orders',
                    type: 'GET',
                    data: (d) => {
                        // 确保分页参数有效
                        const start = parseInt(d.start) || 0;
                        const length = parseInt(d.length) || 25;
                        const page = Math.floor(start / length) + 1;
                        
                        return {
                            ...d,
                            ...this.currentFilters,
                            page: page,
                            limit: length
                        };
                    },
                    dataSrc: (json) => {
                        if (json.success) {
                            return json.data.items;
                        } else {
                            console.error('获取订单数据失败:', json.message);
                            return [];
                        }
                    }
                },
                columns: [
                    {
                        data: 'order_no',
                        title: '订单号',
                        render: (data, type, row) => {
                            return `<a href="#" onclick="ordersModule.viewOrder('${row.id}')">${data}</a>`;
                        }
                    },
                    {
                        data: 'site_id',
                        title: '站点',
                        render: (data, type, row) => {
                            const site = adminCore.sites.find(s => s.id === data);
                            return site ? `${site.name} (${site.platform})` : data;
                        }
                    },
                    {
                        data: 'customers',
                        title: '客户',
                        render: (data, type, row) => {
                            if (data && data.email) {
                                return `${data.email}`;
                            }
                            return '-';
                        }
                    },
                    {
                        data: 'total',
                        title: '金额',
                        render: (data, type, row) => {
                            return adminCore.formatCurrency(data, row.currency);
                        }
                    },
                    {
                        data: 'status',
                        title: '状态',
                        render: (data, type, row) => {
                            const statusMap = {
                                'pending': { text: '待处理', class: 'badge-warning' },
                                'confirmed': { text: '已确认', class: 'badge-info' },
                                'shipped': { text: '已发货', class: 'badge-info' },
                                'delivered': { text: '已送达', class: 'badge-success' },
                                'completed': { text: '已完成', class: 'badge-success' },
                                'cancelled': { text: '已取消', class: 'badge-danger' }
                            };
                            const status = statusMap[data] || { text: data, class: 'badge-secondary' };
                            return `<span class="badge ${status.class}">${status.text}</span>`;
                        }
                    },
                    {
                        data: 'placed_at',
                        title: '下单时间',
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
                                <button class="btn btn-sm" onclick="ordersModule.viewOrder('${row.id}')">查看</button>
                                <button class="btn btn-sm" onclick="ordersModule.editOrder('${row.id}')">编辑</button>
                                <button class="btn btn-sm" onclick="ordersModule.updateStatus('${row.id}')">更新状态</button>
                            `;
                        }
                    }
                ],
                order: [[5, 'desc']], // 默认按下单时间倒序
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

    initFilters() {
        // 站点筛选
        const siteFilter = document.getElementById('orderSiteFilter');
        if (siteFilter) {
            siteFilter.addEventListener('change', (e) => {
                this.currentFilters.site_id = e.target.value || undefined;
                this.refreshTable();
            });
        }

        // 状态筛选
        const statusFilter = document.getElementById('orderStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.currentFilters.status = e.target.value || undefined;
                this.refreshTable();
            });
        }

        // 日期范围筛选
        const dateRange = document.getElementById('orderDateRange');
        if (dateRange && flatpickr) {
            flatpickr(dateRange, {
                mode: "range",
                dateFormat: "Y-m-d",
                onChange: (selectedDates) => {
                    if (selectedDates.length === 2) {
                        this.currentFilters.date_from = selectedDates[0].toISOString().split('T')[0];
                        this.currentFilters.date_to = selectedDates[1].toISOString().split('T')[0];
                    } else {
                        delete this.currentFilters.date_from;
                        delete this.currentFilters.date_to;
                    }
                    this.refreshTable();
                }
            });
        }
    }

    refreshTable() {
        if (this.table) {
            this.table.ajax.reload();
        }
    }

    async viewOrder(orderId) {
        try {
            const response = await adminCore.apiRequest(`/api/orders?id=${orderId}`);
            if (response.success) {
                this.showOrderModal(response.data, 'view');
            }
        } catch (error) {
            console.error('获取订单详情失败:', error);
        }
    }

    async editOrder(orderId) {
        try {
            const response = await adminCore.apiRequest(`/api/orders?id=${orderId}`);
            if (response.success) {
                this.showOrderModal(response.data, 'edit');
            }
        } catch (error) {
            console.error('获取订单详情失败:', error);
        }
    }

    async createOrder() {
        this.showOrderModal(null, 'create');
    }

    showOrderModal(orderData, mode) {
        const modal = this.createOrderModal(orderData, mode);
        document.body.appendChild(modal);
        
        // 显示模态框
        modal.style.display = 'block';
        
        // 绑定事件
        this.bindOrderModalEvents(modal, orderData, mode);
    }

    createOrderModal(orderData, mode) {
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
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
        `;

        const title = mode === 'create' ? '新建订单' : 
                     mode === 'edit' ? '编辑订单' : '查看订单';
        
        modalContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>${title}</h3>
                <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
            </div>
            
            <form id="orderForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <label>订单号 *</label>
                        <input type="text" name="order_no" value="${orderData?.order_no || ''}" ${mode === 'view' ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label>站点 *</label>
                        <select name="site_id" ${mode === 'view' ? 'disabled' : ''} required>
                            <option value="">选择站点</option>
                            ${adminCore.sites.map(site => 
                                `<option value="${site.id}" ${orderData?.site_id === site.id ? 'selected' : ''}>${site.name} (${site.platform})</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div>
                        <label>平台 *</label>
                        <input type="text" name="platform" value="${orderData?.platform || ''}" ${mode === 'view' ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label>渠道</label>
                        <input type="text" name="channel" value="${orderData?.channel || ''}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>状态</label>
                        <select name="status" ${mode === 'view' ? 'disabled' : ''}>
                            <option value="pending" ${orderData?.status === 'pending' ? 'selected' : ''}>待处理</option>
                            <option value="confirmed" ${orderData?.status === 'confirmed' ? 'selected' : ''}>已确认</option>
                            <option value="shipped" ${orderData?.status === 'shipped' ? 'selected' : ''}>已发货</option>
                            <option value="delivered" ${orderData?.status === 'delivered' ? 'selected' : ''}>已送达</option>
                            <option value="completed" ${orderData?.status === 'completed' ? 'selected' : ''}>已完成</option>
                            <option value="cancelled" ${orderData?.status === 'cancelled' ? 'selected' : ''}>已取消</option>
                        </select>
                    </div>
                    <div>
                        <label>货币</label>
                        <select name="currency" ${mode === 'view' ? 'disabled' : ''}>
                            <option value="USD" ${orderData?.currency === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="EUR" ${orderData?.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                            <option value="CNY" ${orderData?.currency === 'CNY' ? 'selected' : ''}>CNY</option>
                        </select>
                    </div>
                    <div>
                        <label>小计</label>
                        <input type="number" name="subtotal" value="${orderData?.subtotal || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>折扣</label>
                        <input type="number" name="discount" value="${orderData?.discount || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>运费</label>
                        <input type="number" name="shipping_fee" value="${orderData?.shipping_fee || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>税费</label>
                        <input type="number" name="tax" value="${orderData?.tax || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>总金额</label>
                        <input type="number" name="total" value="${orderData?.total || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>商品成本</label>
                        <input type="number" name="cost_of_goods" value="${orderData?.cost_of_goods || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                </div>
                
                <div style="margin-top: 20px;">
                    <label>备注</label>
                    <textarea name="remark" rows="3" ${mode === 'view' ? 'readonly' : ''}>${orderData?.remark ? JSON.stringify(orderData.remark) : ''}</textarea>
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

    bindOrderModalEvents(modal, orderData, mode) {
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
            const form = modal.querySelector('#orderForm');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveOrder(form, orderData, mode);
            });
        }
    }

    async saveOrder(form, orderData, mode) {
        try {
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            // 转换数字字段
            ['subtotal', 'discount', 'shipping_fee', 'tax', 'total', 'cost_of_goods'].forEach(field => {
                data[field] = parseFloat(data[field]) || 0;
            });

            let response;
            if (mode === 'create') {
                response = await adminCore.apiRequest('/api/orders', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
            } else {
                response = await adminCore.apiRequest(`/api/orders?id=${orderData.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
            }

            if (response.success) {
                adminCore.showNotification('订单保存成功', 'success');
                document.body.removeChild(form.closest('.modal'));
                this.refreshTable();
            }
        } catch (error) {
            console.error('保存订单失败:', error);
        }
    }

    async updateStatus(orderId) {
        const statuses = [
            { value: 'pending', text: '待处理' },
            { value: 'confirmed', text: '已确认' },
            { value: 'shipped', text: '已发货' },
            { value: 'delivered', text: '已送达' },
            { value: 'completed', text: '已完成' },
            { value: 'cancelled', text: '已取消' }
        ];

        const newStatus = prompt('选择新状态:\n' + 
            statuses.map((s, i) => `${i + 1}. ${s.text}`).join('\n'));
        
        if (newStatus && newStatus >= 1 && newStatus <= statuses.length) {
            const selectedStatus = statuses[newStatus - 1];
            
            try {
                const response = await adminCore.apiRequest(`/api/orders?id=${orderId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: selectedStatus.value })
                });

                if (response.success) {
                    adminCore.showNotification('订单状态更新成功', 'success');
                    this.refreshTable();
                }
            } catch (error) {
                console.error('更新订单状态失败:', error);
            }
        }
    }
}

// 创建全局实例
window.ordersModule = new OrdersModule();
