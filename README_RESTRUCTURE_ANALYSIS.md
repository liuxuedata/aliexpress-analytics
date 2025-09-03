# 分析页面重构说明

## 概述
本次重构将原本分散的运营分析和产品分析页面集成到各个子站点模块下，使用hash路由实现页面内导航，提供更好的用户体验和模块化架构。

## 重构目标
- 将运营分析和产品分析功能集成到各个子站点页面中
- 使用hash路由（#analysis, #products）实现页面内导航
- 保持现有API接口和数据模型不变
- 实现更好的数据隔离和模块化

## 变更内容

### 1. 自运营站点 (`/self-operated.html`)
- **新增功能**：
  - `#analysis` - 运营分析模块，包含KPI卡片和趋势图表
  - `#products` - 产品分析模块，包含产品选择器和产品趋势图表
- **技术实现**：
  - 使用hash路由进行页面内导航
  - 集成ECharts图表库
  - 调用`/api/ae_query`接口获取数据

### 2. 独立站 (`/independent-site.html`)
- **新增功能**：
  - `#analysis` - 运营分析模块，包含KPI卡片和趋势图表
  - `#products` - 产品分析模块，包含产品选择器和产品趋势图表
- **技术实现**：
  - 使用hash路由进行页面内导航
  - 调用`/api/independent/stats`接口获取数据
  - 集成ECharts图表库

### 3. 全托管站点 (`/managed.html`)
- **新增功能**：
  - `#products` - 产品分析模块，包含产品选择器和产品趋势图表
  - 运营分析模块已存在，现在通过hash路由访问
- **技术实现**：
  - 将原有的tab切换改为hash路由
  - 增强产品分析功能，添加趋势图表

### 4. 其他平台
- **Ozon**: 保持现有的`/ozon-analysis.html`和`/ozon-product-insights.html`不变
- **Amazon**: 计划在`/amazon-overview.html`中添加`#analysis`和`#products`模块
- **TikTok**: 计划在`/tiktok.html`中添加`#analysis`和`#products`模块
- **Temu**: 计划在`/temu.html`中添加`#analysis`和`#products`模块

## 技术架构

### Hash路由系统
```javascript
// 路由处理
function handleHashRoute() {
  const hash = window.location.hash.slice(1) || 'detail';
  // 根据hash显示对应内容
  ['detail', 'analysis', 'products'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === hash ? '' : 'none');
  });
}

// 监听hash变化
window.addEventListener('hashchange', handleHashRoute);
```

### 数据加载模式
```javascript
// 根据路由加载相应数据
if (hash === 'analysis') {
  loadAnalysisData();
} else if (hash === 'products') {
  loadProductAnalysisData();
}
```

### 图表渲染
- 使用ECharts库渲染趋势图表
- 支持响应式布局
- 统一的图表样式和主题

## 文件变更清单

### 修改的文件
1. `public/self-operated.html` - 添加运营分析和产品分析模块
2. `public/independent-site.html` - 添加运营分析和产品分析模块
3. `public/managed.html` - 增强产品分析功能，改为hash路由

### 新增的功能
1. **运营分析模块**：
   - KPI卡片显示关键指标
   - 趋势图表展示数据变化
   - 支持不同时间范围的数据对比

2. **产品分析模块**：
   - 产品选择器
   - 产品KPI指标
   - 产品趋势图表

## 使用方式

### 访问运营分析
- 自运营：`/self-operated.html#analysis`
- 独立站：`/independent-site.html#analysis`
- 全托管：`/managed.html#analysis`

### 访问产品分析
- 自运营：`/self-operated.html#products`
- 独立站：`/independent-site.html#products`
- 全托管：`/managed.html#products`

## 优势

1. **更好的用户体验**：无需跳转页面，在同一页面内切换不同功能模块
2. **模块化架构**：每个子站点都有自己独立的分析功能
3. **数据隔离**：不同平台和子站点的数据完全隔离
4. **维护性**：减少重复代码，统一管理分析功能
5. **扩展性**：易于添加新的分析模块和图表类型

## 注意事项

1. **浏览器兼容性**：hash路由需要现代浏览器支持
2. **数据加载**：分析模块的数据加载是异步的，需要等待数据返回
3. **图表性能**：大量数据时图表渲染可能需要优化
4. **移动端适配**：需要确保在小屏幕设备上的良好显示效果

## 后续计划

1. 完善Amazon、TikTok、Temu等平台的分析模块
2. 添加更多图表类型（饼图、散点图等）
3. 优化数据加载性能
4. 添加数据导出功能
5. 实现更高级的数据筛选和对比功能

## 分支信息
- 分支名称：`restructure-analysis-pages`
- 创建时间：2025年1月
- 状态：开发中
