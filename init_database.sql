-- 数据库初始化脚本
-- 这个脚本用于初始化站点配置系统所需的所有数据

-- 1. 确保模板表存在并插入基础模板
DO $$
BEGIN
  -- 删除现有模板（如果存在）
  DELETE FROM public.data_source_templates WHERE id IN (
    'facebook_ads_template',
    'google_ads_template',
    'ae_api_template'
  );

  -- 插入Facebook Ads模板
  INSERT INTO public.data_source_templates (
    id, name, platform, source_type, fields_json, sample_file, created_at, updated_at
  ) VALUES (
    'facebook_ads_template',
    'Facebook Ads 标准模板',
    'independent',
    'facebook_ads',
    '{
      "mappings": {
        "campaign_name": "Campaign Name",
        "adset_name": "Ad Set Name", 
        "level": "Level",
        "product_identifier": "Product ID",
        "reach": "Reach",
        "impressions": "Impressions",
        "frequency": "Frequency",
        "link_clicks": "Link Clicks",
        "all_clicks": "All Clicks",
        "all_ctr": "All CTR",
        "link_ctr": "Link CTR",
        "cpc_link": "CPC (Link)",
        "spend_usd": "Spend (USD)",
        "atc_total": "ATC Total",
        "atc_web": "ATC Web",
        "atc_meta": "ATC Meta",
        "ic_total": "IC Total",
        "ic_web": "IC Web",
        "ic_meta": "IC Meta",
        "purchase_web": "Purchase Web",
        "purchase_meta": "Purchase Meta",
        "row_start_date": "Row Start Date",
        "row_end_date": "Row End Date",
        "landing_url": "Landing URL",
        "creative_name": "Creative Name",
        "cpm": "CPM",
        "cpc_all": "CPC (All)",
        "cpa_purchase_web": "CPA Purchase Web"
      },
      "required_fields": ["campaign_name", "adset_name", "row_start_date"],
      "date_fields": ["row_start_date", "row_end_date"],
      "numeric_fields": ["reach", "impressions", "frequency", "link_clicks", "all_clicks", "spend_usd", "atc_total", "atc_web", "atc_meta", "ic_total", "ic_web", "ic_meta", "purchase_web", "purchase_meta", "cpm", "cpc_all", "cpa_purchase_web"],
      "percentage_fields": ["all_ctr", "link_ctr", "cpc_link"]
    }',
    'facebook_ads_sample.xlsx',
    NOW(),
    NOW()
  );

  -- 插入Google Ads模板
  INSERT INTO public.data_source_templates (
    id, name, platform, source_type, fields_json, sample_file, created_at, updated_at
  ) VALUES (
    'google_ads_template',
    'Google Ads 标准模板',
    'independent',
    'google_ads',
    '{
      "mappings": {
        "landing_url": "Landing page",
        "campaign": "Campaign",
        "day": "Day",
        "network": "Network",
        "device": "Device",
        "clicks": "Clicks",
        "impr": "Impressions",
        "ctr": "CTR",
        "avg_cpc": "Avg. CPC",
        "cost": "Cost",
        "conversions": "Conversions",
        "cost_per_conv": "Cost per conversion"
      },
      "required_fields": ["landing_url", "campaign", "day"],
      "date_fields": ["day"],
      "numeric_fields": ["clicks", "impr", "cost", "conversions", "cost_per_conv"],
      "percentage_fields": ["ctr", "avg_cpc"]
    }',
    'google_ads_sample.xlsx',
    NOW(),
    NOW()
  );

  -- 插入速卖通API模板
  INSERT INTO public.data_source_templates (
    id, name, platform, source_type, fields_json, sample_file, created_at, updated_at
  ) VALUES (
    'ae_api_template',
    '速卖通API 标准模板',
    'ae_self_operated',
    'ae_api',
    '{
      "mappings": {
        "product_id": "Product ID",
        "date": "Date",
        "visitor_ratio": "Visitor Ratio",
        "add_to_cart_ratio": "Add to Cart Ratio",
        "payment_ratio": "Payment Ratio",
        "impressions": "Impressions",
        "visitors": "Visitors",
        "page_views": "Page Views",
        "add_to_cart_users": "Add to Cart Users",
        "ordered_items": "Ordered Items",
        "paid_items": "Paid Items",
        "paid_buyers": "Paid Buyers",
        "search_ctr": "Search CTR",
        "avg_stay_duration": "Avg Stay Duration"
      },
      "required_fields": ["product_id", "date"],
      "date_fields": ["date"],
      "numeric_fields": ["impressions", "visitors", "page_views", "add_to_cart_users", "ordered_items", "paid_items", "paid_buyers", "avg_stay_duration"],
      "percentage_fields": ["visitor_ratio", "add_to_cart_ratio", "payment_ratio", "search_ctr"]
    }',
    'ae_api_sample.xlsx',
    NOW(),
    NOW()
  );

  RAISE NOTICE 'Templates initialized successfully';
END $$;

-- 2. 检查并显示现有数据
SELECT '=== 数据源模板 ===' as section;
SELECT id, name, platform, source_type, created_at FROM public.data_source_templates ORDER BY created_at;

SELECT '=== 站点配置 ===' as section;
SELECT id, name, platform, display_name, data_source, created_at FROM public.site_configs ORDER BY created_at;

SELECT '=== 动态表 ===' as section;
SELECT id, site_id, table_name, created_at FROM public.dynamic_tables ORDER BY created_at;
