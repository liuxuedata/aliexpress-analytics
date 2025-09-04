# 跨境电商数据分析平台 - 系统架构文档

## 🏗️ 系统概述

本系统是一个基于Web的跨境电商数据分析平台，支持多个电商平台（速卖通、亚马逊、TikTok、Temu、Ozon）和独立站点的数据分析和可视化。

## 📁 文件结构

```
public/
├── assets/                    # 静态资源
│   ├── global-theme.css      # 全局UI主题系统
│   ├── page-template.js      # 统一页面模板系统
│   ├── site-nav.js          # 站点导航管理
│   ├── self-operated.js     # 自运营页面专用逻辑
│   └── independent-site.js  # 独立站页面专用逻辑
├── self-operated.html        # 自运营页面（#analysis / #products）
├── independent-site.html     # 独立站页面（?site=... #analysis / #products）
├── managed.html              # 全托管页面（#analysis / #products）
└── [其他平台页面]
```

## 🎯 架构设计原则

### 1. 统一性 (Unified)
- 所有页面使用相同的UI设计系统
- 统一的代码结构和命名规范
- 一致的用户体验和交互模式

### 2. 模块化 (Modular)
- 功能按模块分离，便于维护和扩展
- 页面逻辑与UI组件分离
- 可复用的组件和工具函数

### 3. 可扩展性 (Extensible)
- 支持新平台和站点的快速接入
- 插件化的功能模块
- 灵活的配置系统

### 4. 稳定性 (Stable)
- 统一的错误处理机制
- 安全的DOM操作和API调用
- 完善的加载状态管理

## 🔧 核心组件

### 1. 页面模板系统 (Page Template System)

**文件**: `assets/page-template.js`

**功能**:
- 统一的页面初始化流程
- 通用的UI组件管理
- 标准的事件处理机制
- 错误处理和状态管理

**核心类**: `PageManager`
```javascript
class PageManager {
  constructor() {
    this.currentPage = this.detectPageType();
    this.currentSite = null;
    this.currentSiteName = null;
  }
  
  async init() {
    // 统一的初始化流程
  }
  
  initUIComponents() {
    // 初始化KPI卡片、日期选择器等
  }
  
  initEventListeners() {
    // 设置事件监听器
  }
}
```

### 2. 全局UI主题系统 (Global UI Theme)

**文件**: `assets/global-theme.css`

**功能**:
- 统一的颜色系统
- 标准化的组件样式
- 响应式设计支持
- 深色模式支持

**核心组件**:
- `.kpi-card` - KPI卡片组件
- `.chart-container` - 图表容器
- `.data-table` - 数据表格
- `.loading-state` - 加载状态
- `.btn` - 按钮组件

### 3. 站点导航管理 (Site Navigation)

**文件**: `assets/site-nav.js`

**功能**:
- 多平台站点管理
- 动态菜单生成
- 站点切换逻辑
- 全局导航状态

### 4. 页面专用逻辑 (Page-Specific Logic)

**文件**: `assets/[page-name].js`

**功能**:
- 继承自页面模板系统
- 实现页面特定的业务逻辑
- 处理页面专用的API调用
- 管理页面状态和数据

## 🔄 页面生命周期

```
页面加载 → 检测页面类型 → 初始化页面管理器 → 设置UI组件 → 绑定事件 → 加载数据 → 页面就绪
    ↓
触发页面就绪事件 → 执行页面特定逻辑 → 渲染内容 → 用户交互
```

## 📊 数据流

```
用户操作 → 事件触发 → 页面管理器 → API调用 → 数据处理 → UI更新 → 用户反馈
```

## 🎨 UI组件系统

### KPI卡片 (KPI Cards)
```html
<div class="kpi-grid">
  <div class="kpi-card info">
    <h4>平均访客比</h4>
    <p>7.38%</p>
  </div>
  <div class="kpi-card success">
    <h4>平均加购比</h4>
    <p>3.33%</p>
  </div>
</div>
```

### 图表容器 (Chart Containers)
```html
<div class="chart-container">
  <h3>数据明细</h3>
  <div class="chart-content">
    <!-- 图表内容 -->
  </div>
</div>
```

### 加载状态 (Loading States)
```html
<div class="loading-state">
  <div class="loading-spinner"></div>
  <p class="loading-text">努力加载中,请等待片刻。。。</p>
</div>
```

## 🔌 扩展机制

### 添加新平台
1. 在 `CONFIG.PAGE_TYPES` 中添加平台类型
2. 创建平台专用页面文件
3. 实现平台特定的数据逻辑
4. 更新导航菜单

### 添加新功能
1. 在页面模板系统中添加通用功能
2. 在专用页面中实现具体逻辑
3. 更新UI组件和样式
4. 添加相应的配置选项

## 🚀 性能优化

### 1. 代码分割
- 按页面类型加载专用逻辑
- 延迟加载非关键功能
- 模块化的组件系统

### 2. 缓存策略
- 本地存储站点配置
- 缓存API响应数据
- 复用DOM元素和组件

### 3. 异步处理
- 非阻塞的数据加载
- 渐进式UI更新
- 后台数据处理

## 🛡️ 安全考虑

### 1. 输入验证
- 安全的DOM操作
- 参数类型检查
- XSS防护

### 2. API安全
- 请求参数验证
- 错误信息过滤
- 权限控制

### 3. 数据安全
- 本地存储加密
- 敏感信息保护
- 安全的数据传输

## 📱 响应式设计

### 断点系统
- 移动端: < 768px
- 平板端: 768px - 1024px
- 桌面端: > 1024px

### 适配策略
- 弹性布局
- 自适应组件
- 触摸友好的交互

## 🔄 版本管理

### 文件命名规范
- 功能更新: `v20250812-feature`
- 修复更新: `v20250812-fix`
- 样式更新: `v20250812-style`

### 兼容性
- 支持现代浏览器
- 渐进式增强
- 向后兼容

## 📋 开发指南

### 1. 添加新页面
```javascript
// 1. 继承PageManager
class NewPageManager extends PageManager {
  constructor() {
    super();
    // 页面特定初始化
  }
  
  // 2. 重写必要方法
  async loadData() {
    // 实现数据加载逻辑
  }
}

// 3. 在HTML中引入
<script src="assets/new-page.js"></script>
```

### 2. 添加新组件
```css
/* 1. 在global-theme.css中定义样式 */
.new-component {
  /* 组件样式 */
}

/* 2. 在页面中使用 */
<div class="new-component">
  <!-- 组件内容 -->
</div>
```

### 3. 添加新API
```javascript
// 1. 在CONFIG中添加端点
API_ENDPOINTS: {
  new_api: '/api/new-endpoint'
}

// 2. 实现API调用方法
async callNewAPI(params) {
  const response = await fetch(CONFIG.API_ENDPOINTS.new_api, {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return response.json();
}
```

## 🎯 未来规划

### 短期目标
- [ ] 完善错误处理机制
- [ ] 优化加载性能
- [ ] 增强移动端体验

### 中期目标
- [ ] 添加更多图表类型
- [ ] 实现数据导出功能
- [ ] 支持多语言

### 长期目标
- [ ] 微前端架构改造
- [ ] 实时数据更新
- [ ] AI驱动的数据分析

---

*本文档持续更新，反映系统的最新架构设计*
