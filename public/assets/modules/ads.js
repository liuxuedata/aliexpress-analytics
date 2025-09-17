/**
 * 广告管理模块
 * 提供广告活动的查询、管理和数据分析功能
 */

class AdsModule {
    constructor() {
        this.table = null;
        this.currentFilters = {};
        this.init();
    }

    init() {
        console.log('AdsModule: 初始化广告管理模块');
        this.initTable();
        this.initFilters();
    }

    initTable() {
        if ($.fn.DataTable) {
            this.table = $('#ads-table').DataTable({
                processing: true,
                serverSide: false,
                ajax: {
                    url: '/api/ads',
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
                            console.error('获取广告数据失败:', json.message);
                            return [];
                        }
                    }
                },
                columns: [
                    {
                        data: 'campaign_name',
                        title: '广告名称',
                        render: (data, type, row) => {
                            return `<a href="#" onclick="adsModule.viewCampaign('${row.id}')">${data}</a>`;
                        }
                    },
                    {
                        data: 'platform',
                        title: '平台',
                        render: (data, type, row) => {
                            const platformMap = {
                                'facebook': 'Facebook',
                                'google': 'Google',
                                'tiktok': 'TikTok'
                            };
                            return platformMap[data] || data;
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
                        data: 'status',
                        title: '状态',
                        render: (data, type, row) => {
                            const statusMap = {
                                'active': { text: '活跃', class: 'badge-success' },
                                'paused': { text: '暂停', class: 'badge-warning' },
                                'archived': { text: '归档', class: 'badge-danger' }
                            };
                            const status = statusMap[data] || { text: data, class: 'badge-secondary' };
                            return `<span class="badge ${status.class}">${status.text}</span>`;
                        }
                    },
                    {
                        data: 'summary_metrics.total_spend',
                        title: '花费',
                        render: (data, type, row) => {
                            return data ? adminCore.formatCurrency(data) : '-';
                        }
                    },
                    {
                        data: 'summary_metrics.roas',
                        title: 'ROI',
                        render: (data, type, row) => {
                            if (!data) return '-';
                            const roi = parseFloat(data).toFixed(2);
                            const className = roi >= 3 ? 'text-green-600' : roi >= 2 ? 'text-yellow-600' : 'text-red-600';
                            return `<span class="${className}">${roi}</span>`;
                        }
                    },
                    {
                        data: null,
                        title: '操作',
                        orderable: false,
                        render: (data, type, row) => {
                            return `
                                <button class="btn btn-sm" onclick="adsModule.viewCampaign('${row.id}')">查看</button>
                                <button class="btn btn-sm" onclick="adsModule.editCampaign('${row.id}')">编辑</button>
                                <button class="btn btn-sm" onclick="adsModule.updateStatus('${row.id}')">更新状态</button>
                            `;
                        }
                    }
                ],
                order: [[4, 'desc']], // 默认按花费倒序
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
        const siteFilter = document.getElementById('adsSiteFilter');
        if (siteFilter) {
            siteFilter.addEventListener('change', (e) => {
                this.currentFilters.site_id = e.target.value || undefined;
                this.refreshTable();
            });
        }

        // 平台筛选
        const platformFilter = document.getElementById('adsPlatformFilter');
        if (platformFilter) {
            platformFilter.addEventListener('change', (e) => {
                this.currentFilters.platform = e.target.value || undefined;
                this.refreshTable();
            });
        }
    }

    refreshTable() {
        if (this.table) {
            this.table.ajax.reload();
        }
    }

    async viewCampaign(campaignId) {
        try {
            const response = await adminCore.apiRequest(`/api/ads?id=${campaignId}`);
            if (response.success) {
                this.showCampaignModal(response.data, 'view');
            }
        } catch (error) {
            console.error('获取广告活动详情失败:', error);
        }
    }

    async editCampaign(campaignId) {
        try {
            const response = await adminCore.apiRequest(`/api/ads?id=${campaignId}`);
            if (response.success) {
                this.showCampaignModal(response.data, 'edit');
            }
        } catch (error) {
            console.error('获取广告活动详情失败:', error);
        }
    }

    async createCampaign() {
        this.showCampaignModal(null, 'create');
    }

    showCampaignModal(campaignData, mode) {
        const modal = this.createCampaignModal(campaignData, mode);
        document.body.appendChild(modal);
        
        // 显示模态框
        modal.style.display = 'block';
        
        // 绑定事件
        this.bindCampaignModalEvents(modal, campaignData, mode);
    }

    createCampaignModal(campaignData, mode) {
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

        const title = mode === 'create' ? '新建广告活动' : 
                     mode === 'edit' ? '编辑广告活动' : '查看广告活动';
        
        modalContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>${title}</h3>
                <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
            </div>
            
            <form id="campaignForm">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <label>广告活动ID *</label>
                        <input type="text" name="campaign_id" value="${campaignData?.campaign_id || ''}" ${mode === 'view' ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label>广告活动名称 *</label>
                        <input type="text" name="campaign_name" value="${campaignData?.campaign_name || ''}" ${mode === 'view' ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label>站点 *</label>
                        <select name="site_id" ${mode === 'view' ? 'disabled' : ''} required>
                            <option value="">选择站点</option>
                            ${adminCore.sites.map(site => 
                                `<option value="${site.id}" ${campaignData?.site_id === site.id ? 'selected' : ''}>${site.name} (${site.platform})</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div>
                        <label>平台 *</label>
                        <select name="platform" ${mode === 'view' ? 'disabled' : ''} required>
                            <option value="">选择平台</option>
                            <option value="facebook" ${campaignData?.platform === 'facebook' ? 'selected' : ''}>Facebook</option>
                            <option value="google" ${campaignData?.platform === 'google' ? 'selected' : ''}>Google</option>
                            <option value="tiktok" ${campaignData?.platform === 'tiktok' ? 'selected' : ''}>TikTok</option>
                        </select>
                    </div>
                    <div>
                        <label>目标</label>
                        <input type="text" name="objective" value="${campaignData?.objective || ''}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>状态</label>
                        <select name="status" ${mode === 'view' ? 'disabled' : ''}>
                            <option value="active" ${campaignData?.status === 'active' ? 'selected' : ''}>活跃</option>
                            <option value="paused" ${campaignData?.status === 'paused' ? 'selected' : ''}>暂停</option>
                            <option value="archived" ${campaignData?.status === 'archived' ? 'selected' : ''}>归档</option>
                        </select>
                    </div>
                    <div>
                        <label>日预算</label>
                        <input type="number" name="budget_daily" value="${campaignData?.budget_daily || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>总预算</label>
                        <input type="number" name="budget_total" value="${campaignData?.budget_total || 0}" step="0.01" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>开始日期</label>
                        <input type="date" name="start_date" value="${campaignData?.start_date || ''}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                    <div>
                        <label>结束日期</label>
                        <input type="date" name="end_date" value="${campaignData?.end_date || ''}" ${mode === 'view' ? 'readonly' : ''}>
                    </div>
                </div>
                
                <div style="margin-top: 20px;">
                    <label>目标受众</label>
                    <textarea name="target_audience" rows="3" ${mode === 'view' ? 'readonly' : ''}>${campaignData?.target_audience ? JSON.stringify(campaignData.target_audience) : ''}</textarea>
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

    bindCampaignModalEvents(modal, campaignData, mode) {
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
            const form = modal.querySelector('#campaignForm');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveCampaign(form, campaignData, mode);
            });
        }
    }

    async saveCampaign(form, campaignData, mode) {
        try {
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            // 转换数字字段
            ['budget_daily', 'budget_total'].forEach(field => {
                data[field] = parseFloat(data[field]) || 0;
            });

            // 处理目标受众JSON
            if (data.target_audience) {
                try {
                    data.target_audience = JSON.parse(data.target_audience);
                } catch (e) {
                    data.target_audience = {};
                }
            }

            let response;
            if (mode === 'create') {
                response = await adminCore.apiRequest('/api/ads', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
            } else {
                response = await adminCore.apiRequest(`/api/ads?id=${campaignData.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
            }

            if (response.success) {
                adminCore.showNotification('广告活动保存成功', 'success');
                document.body.removeChild(form.closest('.modal'));
                this.refreshTable();
            }
        } catch (error) {
            console.error('保存广告活动失败:', error);
        }
    }

    async updateStatus(campaignId) {
        const statuses = [
            { value: 'active', text: '活跃' },
            { value: 'paused', text: '暂停' },
            { value: 'archived', text: '归档' }
        ];

        const newStatus = prompt('选择新状态:\n' + 
            statuses.map((s, i) => `${i + 1}. ${s.text}`).join('\n'));
        
        if (newStatus && newStatus >= 1 && newStatus <= statuses.length) {
            const selectedStatus = statuses[newStatus - 1];
            
            try {
                const response = await adminCore.apiRequest(`/api/ads?id=${campaignId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: selectedStatus.value })
                });

                if (response.success) {
                    adminCore.showNotification('广告活动状态更新成功', 'success');
                    this.refreshTable();
                }
            } catch (error) {
                console.error('更新广告活动状态失败:', error);
            }
        }
    }
}

// 创建全局实例
window.adsModule = new AdsModule();
