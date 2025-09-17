/**
 * 库存管理模块
 * 提供库存的查询、管理和变动记录功能
 */

class InventoryModule {
    constructor() {
        this.table = null;
        this.currentFilters = {};
        this.init();
    }

    init() {
        console.log('InventoryModule: 初始化库存管理模块');
        this.initTable();
        this.initFilters();
    }

    initTable() {
        if ($.fn.DataTable) {
            this.table = $('#inventory-table').DataTable({
                processing: true,
                serverSide: false,
                ajax: {
                    url: '/api/inventory',
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
                            console.error('获取库存数据失败:', json.message);
                            return [];
                        }
                    }
                },
                columns: [
                    {
                        data: 'products.sku',
                        title: 'SKU',
                        render: (data, type, row) => {
                            return data || '-';
                        }
                    },
                    {
                        data: 'products.name',
                        title: '商品名称',
                        render: (data, type, row) => {
                            return data || '-';
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
                        data: 'available_qty',
                        title: '可用库存',
                        render: (data, type, row) => {
                            const isLowStock = data < row.min_stock_level;
                            const className = isLowStock ? 'text-red-600 font-bold' : '';
                            return `<span class="${className}">${data}</span>`;
                        }
                    },
                    {
                        data: 'cost_price',
                        title: '成本价',
                        render: (data, type, row) => {
                            return data ? adminCore.formatCurrency(data) : '-';
                        }
                    },
                    {
                        data: 'selling_price',
                        title: '售价',
                        render: (data, type, row) => {
                            return data ? adminCore.formatCurrency(data) : '-';
                        }
                    },
                    {
                        data: null,
                        title: '操作',
                        orderable: false,
                        render: (data, type, row) => {
                            return `
                                <button class="btn btn-sm" onclick="inventoryModule.viewInventory('${row.id}')">查看</button>
                                <button class="btn btn-sm" onclick="inventoryModule.editInventory('${row.id}')">编辑</button>
                                <button class="btn btn-sm" onclick="inventoryModule.adjustStock('${row.id}')">调库存</button>
                            `;
                        }
                    }
                ],
                order: [[3, 'desc']], // 默认按可用库存倒序
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
        const siteFilter = document.getElementById('inventorySiteFilter');
        if (siteFilter) {
            siteFilter.addEventListener('change', (e) => {
                this.currentFilters.site_id = e.target.value || undefined;
                this.refreshTable();
            });
        }

        // 搜索筛选
        const searchInput = document.getElementById('inventorySearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentFilters.search = e.target.value || undefined;
                this.refreshTable();
            });
        }
    }

    refreshTable() {
        if (this.table) {
            this.table.ajax.reload();
        }
    }

    async viewInventory(inventoryId) {
        try {
            const response = await adminCore.apiRequest(`/api/inventory?id=${inventoryId}`);
            if (response.success) {
                this.showInventoryModal(response.data, 'view');
            }
        } catch (error) {
            console.error('获取库存详情失败:', error);
        }
    }

    async editInventory(inventoryId) {
        try {
            const response = await adminCore.apiRequest(`/api/inventory?id=${inventoryId}`);
            if (response.success) {
                this.showInventoryModal(response.data, 'edit');
            }
        } catch (error) {
            console.error('获取库存详情失败:', error);
        }
    }

    async addProduct() {
        this.showInventoryModal(null, 'create');
    }

    async importInventory() {
        adminCore.showNotification('批量导入功能开发中', 'info');
    }

    showInventoryModal(inventoryData, mode) {
        const modal = this.createInventoryModal(inventoryData, mode);
        document.body.appendChild(modal);
        
        // 显示模态框
        modal.style.display = 'block';
        
        // 绑定事件
        this.bindInventoryModalEvents(modal, inventoryData, mode);
    }

    createInventoryModal(inventoryData, mode) {
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

        const title = mode === 'create' ? '添加商品' : 
                     mode === 'edit' ? '编辑库存' : '查看库存';
        
        modalContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>${title}</h3>
                <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
            </div>
            
            <form id="inventoryForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <label>商品SKU *</label>
                        <input type="text" name="sku" value="${inventoryData?.products?.sku || ''}" ${mode === 'view' ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label>站点 *</label>
                        <select name="site_id" ${mode === 'view' ? 'disabled' : ''} required>
                            <option value="">选择站点</option>
                            ${adminCore.sites.map(site => 
                                `<option value="${site.id}" ${inventoryData?.site_id === site.id ? 'selected' : ''}>${site.name} (${site.platform})</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div>
                        <label>可用库存</label>
                        <input type="number" name="available_qty" value="${inventoryData?.available_qty || 0}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>预留库存</label>
                        <input type="number" name="reserved_qty" value="${inventoryData?.reserved_qty || 0}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>最低库存</label>
                        <input type="number" name="min_stock_level" value="${inventoryData?.min_stock_level || 0}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>最高库存</label>
                        <input type="number" name="max_stock_level" value="${inventoryData?.max_stock_level || 0}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>成本价</label>
                        <input type="number" name="cost_price" value="${inventoryData?.cost_price || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>售价</label>
                        <input type="number" name="selling_price" value="${inventoryData?.selling_price || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
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

    bindInventoryModalEvents(modal, inventoryData, mode) {
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
            const form = modal.querySelector('#inventoryForm');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveInventory(form, inventoryData, mode);
            });
        }
    }

    async saveInventory(form, inventoryData, mode) {
        try {
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            // 转换数字字段
            ['available_qty', 'reserved_qty', 'min_stock_level', 'max_stock_level', 'cost_price', 'selling_price'].forEach(field => {
                data[field] = parseFloat(data[field]) || 0;
            });

            let response;
            if (mode === 'create') {
                response = await adminCore.apiRequest('/api/inventory', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
            } else {
                response = await adminCore.apiRequest(`/api/inventory?id=${inventoryData.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
            }

            if (response.success) {
                adminCore.showNotification('库存保存成功', 'success');
                document.body.removeChild(form.closest('.modal'));
                this.refreshTable();
            }
        } catch (error) {
            console.error('保存库存失败:', error);
        }
    }

    async adjustStock(inventoryId) {
        const adjustment = prompt('请输入库存调整数量（正数为增加，负数为减少）:');
        
        if (adjustment && !isNaN(adjustment)) {
            const quantity = parseInt(adjustment);
            
            try {
                const response = await adminCore.apiRequest(`/api/inventory?id=${inventoryId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ 
                        available_qty: quantity > 0 ? `+${quantity}` : quantity.toString()
                    })
                });

                if (response.success) {
                    adminCore.showNotification('库存调整成功', 'success');
                    this.refreshTable();
                }
            } catch (error) {
                console.error('调整库存失败:', error);
            }
        }
    }
}

// 创建全局实例
window.inventoryModule = new InventoryModule();
