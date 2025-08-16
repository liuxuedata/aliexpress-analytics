# Ozon 报表解析与入库说明

`analytics_report_2025-08-16_02_07.xlsx` 等 Ozon 报表的前几行包含说明文本，实际表头通常位于第 8~10 行。解析流程如下：

1. **列名映射**
   - 先对列名做 `norm()` 规范化（小写、去空白、特殊符号改为 `_`）。
   - 使用内置词典匹配到标准字段：`day`、`product_id`、`product_title`、`category_name`、`exposure`、`uv`、`pv`、`add_to_cart_users`、`add_to_cart_qty`、`pay_items`、`pay_orders`、`pay_buyers`。
   - 首列若包含 “Товар: / Категория: / Цена: ...” 等说明，整行丢弃。

2. **结构识别**
   - 扫描前 30 行，选取“非空≥4、可映射字段≥3”的行作为表头。
   - 若上一行是分组标题，则与表头合并为 `上层_下层` 形式后再做映射。
   - 表头下一行往往是字段说明，不参与数据解析，可另存至词典（可选）。

3. **值清洗**
   - 百分比统一转为小数；数字字符串去空格、替换逗号。
   - `product_id` 如果只有 URL，提取其中的数字部分。
   - 若缺少 `day`，使用报表顶部的“Период”结束日期。

4. **入库**
   - 清洗后的记录 UPSERT 到 `public.ozon_daily_product_metrics`，主键 `(store_id, day, product_id)`。
   - 原始行同时写入 `public.ozon_raw_analytics`，保留 `raw_row` 与 `import_batch`（文件名）。
   - 导入完调用 `refresh_ozon_first_seen(start,end)` 更新新品首登。

该流程无需在线翻译，完全依赖映射词典与规则即可稳定解析 Ozon 报表。
