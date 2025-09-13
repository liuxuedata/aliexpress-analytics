# Amazon 模块部署与调试指南

本文件说明如何在本项目中部署、调试 Amazon 模块。

## 一、功能概览
- 新增页面：`/public/amazon-overview.html`（数据总览）、`/public/amazon-ads.html`（广告，可先 CSV 占位）。
- 新增 API：`/api/amazon/report-create`、`report-poll`、`report-download`、`upsert`、`query`、`cron-daily`。
- 数据表：`amazon_daily_by_asin`（主表），可选 `amazon_product_catalog`。
- 定时任务：每日 SGT 08:00 拉取 T-1 日数据。

## 二、项目状态更新记录
- **2025-01-XX**: 项目启动，创建amazon-api-integration分支
- **2025-01-XX**: 确认数据库表已创建，环境变量已配置
- **2025-01-XX**: 确认SP-API权限范围（USA marketplace，基础seller数据权限）
- **2025-01-XX**: 确认数据拉取频率（每日拉取前一天数据）
- **2025-01-XX**: 确认UI风格要求（与整个站点保持一致）
- **2025-01-XX**: ✅ 完成SP-API核心功能实现（report-create, report-poll, report-download）
- **2025-01-XX**: ✅ 完成定时任务配置（vercel.json cron配置）
- **2025-01-XX**: ✅ 完成前端页面完善（amazon-overview.html）
- **2025-01-XX**: ✅ 完成API集成测试
- **2025-01-XX**: 🔧 修复Vercel API路由结构问题

## 二、环境变量配置（Vercel → Project → Settings → Environment Variables）
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
AMZ_LWA_CLIENT_ID=...
AMZ_LWA_CLIENT_SECRET=...
AMZ_SP_REFRESH_TOKEN=...
AMZ_ROLE_ARN=...
AMZ_APP_REGION=us-east-1
AMZ_MARKETPLACE_IDS=ATVPDKIKX0DER,A1PA6795UKMFR9,...
AMZ_SELLER_ID=...
```

## 三、数据库结构
```sql
create table if not exists amazon_daily_by_asin (
  marketplace_id text not null,
  asin text not null,
  stat_date date not null,
  sessions bigint default 0,
  page_views bigint default 0,
  units_ordered bigint default 0,
  ordered_product_sales numeric default 0,
  buy_box_pct numeric default 0,
  session_to_order_rate numeric generated always as (case when sessions>0 then units_ordered::numeric/sessions else 0 end) stored,
  inserted_at timestamptz default now(),
  primary key (asin, stat_date, marketplace_id)
);
```

## 四、开发与调试

### 实施计划（按优先级排序）

#### 阶段1：SP-API核心功能实现 ✅ 进行中
1. **实现 report-create.js** - 创建Amazon报表请求
2. **实现 report-poll.js** - 轮询报表处理状态  
3. **实现 report-download.js** - 下载并解析报表数据
4. **测试完整流程** - create→poll→download→upsert

#### 阶段2：定时任务配置
1. **更新 vercel.json** - 添加Amazon cron配置
2. **实现 cron-daily.js** - 串行调度完整流程
3. **测试定时任务** - 验证每日自动拉取

#### 阶段3：前端页面完善
1. **完善 amazon-overview.html** - 基于self-operated.html
2. **实现数据展示** - KPI、图表、表格
3. **测试前端功能** - 确保数据正确显示

#### 阶段4：生产部署
1. **环境测试** - 验证所有功能正常
2. **性能优化** - 确保API响应速度
3. **监控配置** - 设置错误告警

### 开发调试步骤
1. **本地 CSV 测试**
   - 准备包含 asin/stat_date/sessions/page_views/units_ordered 等字段的 CSV。
   - POST 至 `/api/amazon/upsert` → 数据入库 Supabase。
   - GET `/api/amazon/query?start=2025-01-01&end=2025-01-07&granularity=day` → 返回聚合结果。

2. **对接 SP‑API**
   - 调用 `/api/amazon/report-create` → 获取 reportId。
   - 轮询 `/api/amazon/report-poll?reportId=...` → 获取 documentId。
   - 调用 `/api/amazon/report-download?documentId=...` → 返回 rows。
   - 将 rows 提交至 `/api/amazon/upsert`。

3. **定时任务**
   - Vercel `vercel.json` 中已添加：
   ```json
   "crons": [
     { "path": "/api/amazon/cron-daily", "schedule": "0 0 * * *" }
   ]
   ```
   - 日志中可查看执行结果。

## 五、测试与验证

### 集成测试
运行完整的集成测试来验证所有组件：
```bash
# 访问测试端点
GET /api/amazon/test-integration
```

测试内容包括：
- ✅ 环境变量检查
- ✅ 数据库连接测试
- ✅ API端点功能测试
- ✅ SP-API认证测试

### 手动测试步骤
1. **数据库测试**
   ```bash
   # 测试数据入库
   curl -X POST /api/amazon/upsert \
     -H 'Content-Type: application/json' \
     -d '{"rows":[{"marketplace_id":"ATVPDKIKX0DER","asin":"TEST123","stat_date":"2025-01-01","sessions":100,"page_views":250,"units_ordered":5,"ordered_product_sales":99.99,"buy_box_pct":0.85}]}'
   ```

2. **数据查询测试**
   ```bash
   # 测试数据查询
   curl "/api/amazon/query?start=2025-01-01&end=2025-01-07&granularity=day"
   ```

3. **前端页面测试**
   - 打开 `amazon-overview.html`
   - 选择日期范围，验证 KPI、图表、表格是否能正确展示
   - 明细表第一列 ASIN 链接跳转到 Amazon 商品页

### SP-API 完整流程测试
```bash
# 1. 创建报表
curl -X POST /api/amazon/report-create \
  -H 'Content-Type: application/json' \
  -d '{"dataStartTime":"2025-01-01T00:00:00Z","dataEndTime":"2025-01-01T23:59:59Z"}'

# 2. 轮询状态（使用返回的reportId）
curl "/api/amazon/report-poll?reportId=YOUR_REPORT_ID"

# 3. 下载数据（使用返回的documentId）
curl "/api/amazon/report-download?documentId=YOUR_DOCUMENT_ID" # 返回解密后的 JSON 或文本
```

## 六、常见问题与故障排除

### 6.1 重要：Vercel API路由结构要求
**问题**: API返回HTML页面而不是JSON，错误信息如 "Unexpected token 'T', 'The page c'..."

**原因**: Vercel要求每个API端点必须是一个目录，包含`index.js`文件，不能直接使用`.js`文件

**错误结构**:
```
api/amazon/
├── query.js          ❌ 错误
├── report-create.js  ❌ 错误
└── report-poll.js    ❌ 错误
```

**正确结构**:
```
api/amazon/
├── query/index.js          ✅ 正确
├── report-create/index.js  ✅ 正确
└── report-poll/index.js    ✅ 正确
```

**解决方案**: 将`.js`文件移动到对应的目录中，并重命名为`index.js`

### 6.2 其他常见问题
- **报错 Missing SUPABASE_URL**：请确认 Vercel 环境变量已配置。
- **SP‑API 报错 Unauthorized**：检查 IAM 角色、Refresh Token 是否正确。
- **重复入库**：`upsert` 使用 `(asin, stat_date, marketplace_id)` 主键，确保幂等。
- **数据库表不存在**：确认 `amazon_daily_by_asin` 表已创建。
- **环境变量缺失**：使用 `/api/amazon/debug` 端点检查环境变量配置。

## 七、部署指南

### 生产环境部署
1. **代码部署**
   ```bash
   # 提交代码到主分支
   git add .
   git commit -m "feat: Amazon API integration complete"
   git push origin amazon-api-integration
   
   # 合并到主分支
   git checkout main
   git merge amazon-api-integration
   git push origin main
   ```

2. **Vercel自动部署**
   - 代码推送到main分支后，Vercel会自动触发部署
   - 检查Vercel Dashboard确认部署状态
   - 验证环境变量是否正确配置

3. **功能验证**
   ```bash
   # 部署后运行集成测试
   curl https://your-domain.vercel.app/api/amazon/test-integration
   
   # 测试前端页面
   https://your-domain.vercel.app/amazon-overview.html
   ```

### 监控与维护
- **定时任务监控**: 检查Vercel Functions日志，确认每日定时任务执行情况
- **数据质量监控**: 定期检查数据库中的数据完整性
- **API性能监控**: 监控SP-API调用频率和响应时间

## 八、回滚与禁用
- **临时禁用定时**: 在 `vercel.json` 中移除/注释掉 `cron-daily`
- **禁用预聚合**: 设置 `AMZ_PRECOMPUTE=false`，只保留手动查询
- **完全禁用**: 删除相关环境变量或注释掉相关代码
```


---

### 写入位置说明
- 上一段「贡献 & 反馈」块 **是写入主仓库的 `README.md`**（建议放在文末一个新章节）。
- 同时新增一份模块专用说明 **`README_AMAZON.md`**（放在仓库根目录）。

---

### `README_AMAZON.md`

```md
# Amazon 模块部署与调试手册

> 目标：在本项目中接入 Amazon Selling Partner API（SP‑API），自动拉取“Sales & Traffic by ASIN”按日数据，入库 Supabase，前端页面 `amazon-overview.html` 展示 KPI/图表/明细；每日定时任务在 SGT 08:00 抓取 T-1 天数据。

## 1. 前置条件
- GitHub 仓库：`liuxuedata/aliexpress-analytics`
- Vercel 项目已连接该仓库
- Supabase 实例（Postgres）
- 已创建 LWA 应用 & 完成卖家授权（拿到 Refresh Token）
- AWS 账户中配置了可被 SP‑API 扮演的 IAM Role（`AMZ_ROLE_ARN`）

## 2. 数据库表结构（Supabase）
在 Supabase SQL Editor 执行：

```sql
create table if not exists amazon_daily_by_asin (
  marketplace_id text not null,
  asin           text not null,
  stat_date      date not null,
  sessions       bigint default 0,
  page_views     bigint default 0,
  units_ordered  bigint default 0,
  ordered_product_sales numeric default 0,
  buy_box_pct    numeric default 0,
  session_to_order_rate numeric generated always as
    (case when sessions>0 then (units_ordered::numeric/sessions) else 0 end) stored,
  inserted_at    timestamptz default now(),
  primary key (asin, stat_date, marketplace_id)
);

create table if not exists amazon_product_catalog (
  asin text primary key,
  sku  text,
  title text,
  product_link text
);
```

## 3. 环境变量（Vercel → Project → Settings → Environment Variables）
```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

AMZ_LWA_CLIENT_ID=...
AMZ_LWA_CLIENT_SECRET=...
AMZ_SP_REFRESH_TOKEN=...
AMZ_ROLE_ARN=...
AMZ_APP_REGION=us-east-1
AMZ_MARKETPLACE_IDS=ATVPDKIKX0DER,A1PA6795UKMFR9,...
AMZ_SELLER_ID=...            # 可选
AMZ_PRECOMPUTE=false         # 可选：是否启用预聚合
```
> **安全提示**：仅在服务器侧使用 Service Role Key；前端不可暴露任何密钥。

## 4. 目录与文件
```
/public
  amazon-overview.html      # 总览页（从 self-operated.html 克隆并改字段映射）
/api/amazon
  report-create.js          # 创建报表（Sales & Traffic by ASIN）
  report-poll.js            # 轮询报表状态
  report-download.js        # 下载/解密/解压 → JSON 行
  upsert.js                 # 分片 upsert（key: asin+stat_date+marketplace_id）
  query.js                  # 聚合查询（day|week|month）
  cron-daily.js             # 串行调度（create→poll→download→upsert）
vercel.json                 # 增加 crons（UTC 00:00）
```

## 5. 本地开发
```bash
# 1) 拉代码并安装依赖
npm i

# 2) 启动本地（若使用 vercel dev）
vercel dev

# 3) 造数（CSV 引导入库）
# 组织示例列：asin,stat_date,sessions,page_views,units_ordered,ordered_product_sales,buy_box_pct
curl -X POST http://localhost:3000/api/amazon/upsert \
  -H 'Content-Type: application/json' \
  -d '{"rows":[{"asin":"B0EXXXXXXX","stat_date":"2025-08-20","sessions":100,"page_views":250,"units_ordered":12,"ordered_product_sales":399.99,"buy_box_pct":85.5}]}'

# 4) 打开页面调试
# http://localhost:3000/amazon-overview.html
```

## 6. 接口契约
- `POST /api/amazon/report-create` → `{ reportId }`
- `GET  /api/amazon/report-poll?reportId=...` → `{ processingStatus, documentId? }`
- `GET  /api/amazon/report-download?documentId=...` → `{ ok:true, rows:[...] }` 或原始文本
- `POST /api/amazon/upsert` → `{ ok:true, upserted }`
- `GET  /api/amazon/query?start=YYYY-MM-DD&end=YYYY-MM-DD&granularity=day|week|month` → `{ ok:true, rows:[...] }`
- `GET  /api/amazon/healthz` → `{ ok:true, time }`

## 7. 定时任务（Vercel Cron）
在 `vercel.json` 增加：
```json
{
  "crons": [
    { "path": "/api/amazon/cron-daily", "schedule": "0 0 * * *" }
  ]
}
```
> 说明：UTC 00:00 = SGT 08:00。`cron-daily` 内部串起 create→poll→download→upsert，并打印日志。

## 8. 页面接入要点（amazon-overview.html）
- 复用 `self-operated.html` 的布局/组件（日期范围、Tabs、KPI、ECharts+DataTables）。
- 字段映射：
  - 曝光 ≈ `page_views`
  - 访客 = `sessions`
  - 下单 ≈ `units_ordered`
  - GMV = `ordered_product_sales`
  - Buy Box = `buy_box_pct`
- ASIN 列生成外链：`https://www.amazon.com/dp/<ASIN>`。

## 9. 验收清单（DoD）
- [ ] Upsert 幂等；重复写入不放大
- [ ] `/api/amazon/query` 支撑 KPI/图表/表格
- [ ] `amazon-overview.html` 能显示最近 7 天数据
- [ ] Vercel Cron 在 SGT 08:00 成功跑通一轮（有日志）
- [ ] README_AMAZON.md / 运营文档已更新

## 10. 常见问题排查（FAQ）
**Q1: SP‑API 报 401/403？**  
- 检查 LWA 凭据、Refresh Token 是否对应同一应用；IAM Role 权限是否正确；Marketplaces 是否在授权范围。

**Q2: 下载报表失败或内容为空？**  
- 确认 `dataStartTime`/`dataEndTime` 覆盖 T-1 天完整 UTC 窗口；若卖家无数据则行数为 0。

**Q3: 指标和页面漏斗口径不一致？**  
- 明确当前阶段“加购”口径：Amazon 不直接提供加购，先用 `units_ordered/sessions` 近似转化率；如需严格口径，请后续接 Amazon Ads/Attribution。

**Q4: 表格/图表样式不一致？**  
- 统一替换 `assets/theme.css` 为团队版浅色主题（theme_unified_0811b.css 的内容）。

## 11. 安全与合规
- 所有密钥仅存储在 Vercel 环境变量；严禁提交到代码仓库。
- 访问日志中避免打印完整凭据；必要时做哈希或掩码。
```
```md
report-poll.js # 轮询报表状态
report-download.js # 下载/解密/解压 → JSON 行
upsert.js # 分片 upsert（key: asin+stat_date+marketplace_id）
query.js # 聚合查询（day|week|month）
cron-daily.js # 串行调度（create→poll→download→upsert）
vercel.json # 增加 crons（UTC 00:00）
```


## 5. 本地开发
```bash
# 1) 拉代码并安装依赖
npm i


# 2) 启动本地（若使用 vercel dev）
vercel dev


# 3) 造数（CSV 引导入库）
# 组织示例列：asin,stat_date,sessions,page_views,units_ordered,ordered_product_sales,buy_box_pct
curl -X POST http://localhost:3000/api/amazon/upsert \
-H 'Content-Type: application/json' \
-d '{"rows":[{"asin":"B0EXXXXXXX","stat_date":"2025-08-20","sessions":100,"page_views":250,"units_ordered":12,"ordered_product_sales":399.99,"buy_box_pct":85.5}]}'


# 4) 打开页面调试
# http://localhost:3000/amazon-overview.html
```


## 6. 接口契约
- `POST /api/amazon/report-create` → `{ reportId }`
- `GET /api/amazon/report-poll?reportId=...` → `{ processingStatus, documentId? }`
- `GET /api/amazon/report-download?documentId=...` → `{ rows:[...] }`
- `POST /api/amazon/upsert` → `{ ok:true, upserted }`
- `GET /api/amazon/query?start=YYYY-MM-DD&end=YYYY-MM-DD&granularity=day|week|month` → `{ ok:true, rows:[...] }`
- `GET /api/amazon/healthz` → `{ ok:true, time }`


## 7. 定时任务（Vercel Cron）
在 `vercel.json` 增加：
```json
{
"crons": [
{ "path": "/api/amazon/cron-daily", "schedule": "0 0 * * *" }
]
}
```
> 说明：UTC 00:00 = SGT 08:00。`cron-daily` 内部串起 create→poll→download→upsert，并打印日志。


## 8. 页面接入要点（amazon-overview.html）
- 复用 `self-operated.html` 的布局/组件（日期范围、Tabs、KPI、ECharts+DataTables）。
- 字段映射：
- 曝光 ≈ `page_views`
- 访客 = `sessions`
- 下单 ≈ `units_ordered`
- GMV = `ordered_product_sales`
- Buy Box = `buy_box_pct`
- ASIN 列生成外链：`https://www.amazon.com/dp/<ASIN>`。


## 9. 验收清单（DoD）
- [ ] Upsert 幂等；重复写入不放大
- [ ] `/api/amazon/query` 支撑 KPI/图表/表格
- [ ] `amazon-overview.html` 能显示最近 7 天数据
- [ ] Vercel Cron 在 SGT 08:00 成功跑通一轮（有日志）
- [ ] README_AMAZON.md / 运营文档已更新


## 10. 常见问题排查（FAQ）
**Q1: SP‑API 报 401/403？**
- 检查 LWA 凭据、Refresh Token 是否对应同一应用；IAM Role 权限是否正确；Marketplaces 是否在授权范围。


**Q2: 下载报表失败或内容为空？**
- 确认 `dataStartTime`/`dataEndTime` 覆盖 T-1 天完整 UTC 窗口；若卖家无数据则行数为 0。


**Q3: 指标和页面漏斗口径不一致？**
- 明确当前阶段“加购”口径：Amazon 不直接提供加购，先用 `units_ordered/sessions` 近似转化率；如需严格口径，请后续接 Amazon Ads/Attribution。


**Q4: 表格/图表样式不一致？**
- 统一替换 `assets/theme.css` 为团队版浅色主题（theme_unified_0811b.css 的内容）。


## 11. 安全与合规
- 所有密钥仅存储在 Vercel 环境变量；严禁提交到代码仓库。
- 访问日志中避免打印完整凭据；必要时做哈希或掩码。
```
