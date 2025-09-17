/**
 * 运营分析模块
 * 提供运营数据的查询、展示和分析功能
 */

class AnalyticsModule {
    constructor() {
        this.chart = null;
        this.currentFilters = {};
        this.init();
    }

    init() {
        console.log('AnalyticsModule: 初始化运营分析模块');
        this.initChart();
        this.initFilters();
    }

    initChart() {
        // 初始化ECharts图表
        const chartContainer = document.getElementById('analyticsChart');
        if (chartContainer && echarts) {
            this.chart = echarts.init(chartContainer);
            this.loadAnalyticsData();
        }
    }

    initFilters() {
        // 站点筛选
        const siteFilter = document.getElementById('analyticsSiteSelect');
        if (siteFilter) {
            siteFilter.addEventListener('change', (e) => {
                this.currentFilters.site_id = e.target.value || undefined;
                this.loadAnalyticsData();
            });
        }

        // 日期范围筛选
        const dateRange = document.getElementById('analyticsDateRange');
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
                    this.loadAnalyticsData();
                }
            });
        }
    }

    async loadAnalyticsData() {
        try {
            // 这里应该调用实际的API获取运营数据
            // 暂时使用模拟数据
            const mockData = this.generateMockData();
            this.updateChart(mockData);
        } catch (error) {
            console.error('加载运营数据失败:', error);
            adminCore.showNotification('加载运营数据失败', 'error');
        }
    }

    generateMockData() {
        // 生成模拟数据
        const dates = [];
        const sales = [];
        const orders = [];
        const visitors = [];

        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
            
            sales.push(Math.floor(Math.random() * 10000) + 5000);
            orders.push(Math.floor(Math.random() * 100) + 20);
            visitors.push(Math.floor(Math.random() * 500) + 100);
        }

        return {
            dates,
            sales,
            orders,
            visitors
        };
    }

    updateChart(data) {
        if (!this.chart) return;

        const option = {
            title: {
                text: '运营数据分析',
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross'
                }
            },
            legend: {
                data: ['销售额', '订单数', '访客数'],
                top: 30
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: data.dates
            },
            yAxis: [
                {
                    type: 'value',
                    name: '销售额',
                    position: 'left'
                },
                {
                    type: 'value',
                    name: '订单数/访客数',
                    position: 'right'
                }
            ],
            series: [
                {
                    name: '销售额',
                    type: 'line',
                    yAxisIndex: 0,
                    data: data.sales,
                    smooth: true,
                    itemStyle: {
                        color: '#3b82f6'
                    }
                },
                {
                    name: '订单数',
                    type: 'line',
                    yAxisIndex: 1,
                    data: data.orders,
                    smooth: true,
                    itemStyle: {
                        color: '#10b981'
                    }
                },
                {
                    name: '访客数',
                    type: 'line',
                    yAxisIndex: 1,
                    data: data.visitors,
                    smooth: true,
                    itemStyle: {
                        color: '#f59e0b'
                    }
                }
            ]
        };

        this.chart.setOption(option);
    }
}

// 创建全局实例
window.analyticsModule = new AnalyticsModule();
