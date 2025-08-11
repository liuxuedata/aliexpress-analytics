# 新品 KPI 已内嵌版本（可直接替换）

- index.html（全托管，已内置“本周期新品数”KPI + 点击过滤）
- self-operated.html（自运营，已内置“本周期新品数”KPI + 点击过滤）

使用：把这两份直接覆盖你项目里的同名文件即可。
要求：后端存在 `/api/new-products` 接口；数据库视图：
- 全托管：`managed_new_products(product_id, first_seen)`
- 自运营：`ae_self_new_products(product_id, first_seen)`