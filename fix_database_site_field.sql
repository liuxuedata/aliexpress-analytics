-- 修复数据库站点字段脚本
-- 这个脚本会检查并修复 ae_self_operated_daily 表的站点字段问题

-- 1. 检查当前表结构
DO $$
BEGIN
    RAISE NOTICE '=== 检查当前表结构 ===';
END $$;

-- 检查表是否存在
SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ae_self_operated_daily') 
        THEN 'Table exists' 
        ELSE 'Table does not exist' 
    END as table_status;

-- 检查字段
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'ae_self_operated_daily'
ORDER BY ordinal_position;

-- 2. 如果表存在但没有 site 字段，添加它
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ae_self_operated_daily') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ae_self_operated_daily' AND column_name = 'site') THEN
            RAISE NOTICE 'Adding site column to ae_self_operated_daily table...';
            
            -- 添加 site 字段
            ALTER TABLE public.ae_self_operated_daily ADD COLUMN site text NOT NULL DEFAULT 'A站';
            
            -- 更新主键约束
            ALTER TABLE public.ae_self_operated_daily DROP CONSTRAINT IF EXISTS ae_self_operated_daily_pkey;
            ALTER TABLE public.ae_self_operated_daily ADD CONSTRAINT ae_self_operated_daily_pkey PRIMARY KEY (site, product_id, stat_date);
            
            -- 创建索引
            CREATE INDEX IF NOT EXISTS idx_ae_self_operated_daily_site ON public.ae_self_operated_daily(site);
            
            RAISE NOTICE 'Site column added successfully';
        ELSE
            RAISE NOTICE 'Site column already exists';
        END IF;
    ELSE
        RAISE NOTICE 'Table ae_self_operated_daily does not exist';
    END IF;
END $$;

-- 3. 确保 sites 表存在并正确配置
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sites') THEN
        RAISE NOTICE 'Creating sites table...';
        
        CREATE TABLE public.sites (
            id          text primary key,
            name        text not null,
            platform    text not null,
            display_name text not null,
            is_active   boolean default true,
            created_at  timestamptz not null default now(),
            updated_at  timestamptz not null default now()
        );
        
        RAISE NOTICE 'Sites table created successfully';
    ELSE
        RAISE NOTICE 'Sites table already exists';
    END IF;
END $$;

-- 4. 初始化默认站点数据
INSERT INTO public.sites (id, name, platform, display_name) VALUES
    ('ae_self_operated_a', 'A站', 'ae_self_operated', '速卖通自运营 A站'),
    ('ae_self_operated_poolslab', 'poolslab', 'ae_self_operated', 'Poolslab运动娱乐'),
    ('ae_managed', '全托管', 'ae_managed', '速卖通全托管'),
    ('independent_poolsvacuum', 'poolsvacuum.com', 'independent', '独立站 poolsvacuum.com'),
    ('independent_icyberite', 'icyberite.com', 'independent', '独立站 icyberite.com')
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    updated_at = now();

-- 5. 更新现有数据的站点标识
-- 将所有现有数据标记为 'A站'（如果还没有设置）
UPDATE public.ae_self_operated_daily 
SET site = 'A站' 
WHERE site IS NULL OR site = '';

-- 6. 重新创建视图
DROP VIEW IF EXISTS public.v_ae_self_operated_weekly;
CREATE OR REPLACE VIEW public.v_ae_self_operated_weekly AS
SELECT
    site,
    product_id,
    date_trunc('week', stat_date)::date as bucket,
    sum(exposure)   as exposure,
    sum(visitors)   as visitors,
    sum(views)      as views,
    sum(add_people) as add_people,
    sum(add_count)  as add_count,
    sum(pay_items)  as pay_items,
    sum(pay_orders) as pay_orders,
    sum(pay_buyers) as pay_buyers
FROM public.ae_self_operated_daily
GROUP BY 1,2,3;

DROP VIEW IF EXISTS public.v_ae_self_operated_monthly;
CREATE OR REPLACE VIEW public.v_ae_self_operated_monthly AS
SELECT
    site,
    product_id,
    date_trunc('month', stat_date)::date as bucket,
    sum(exposure)   as exposure,
    sum(visitors)   as visitors,
    sum(views)      as views,
    sum(add_people) as add_people,
    sum(add_count)  as add_count,
    sum(pay_items)  as pay_items,
    sum(pay_orders) as pay_orders,
    sum(pay_buyers) as pay_buyers
FROM public.ae_self_operated_daily
GROUP BY 1,2,3;

-- 7. 设置 RLS 策略
ALTER TABLE public.ae_self_operated_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- 清理旧策略
DROP POLICY IF EXISTS p_ins_all ON public.ae_self_operated_daily;
DROP POLICY IF EXISTS p_upd_all ON public.ae_self_operated_daily;
DROP POLICY IF EXISTS p_sel_all ON public.ae_self_operated_daily;

-- 创建新策略
CREATE POLICY p_sel_all ON public.ae_self_operated_daily
FOR SELECT TO anon USING (true);

CREATE POLICY p_ins_all ON public.ae_self_operated_daily
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY p_upd_all ON public.ae_self_operated_daily
FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 站点表策略
DROP POLICY IF EXISTS p_sites_sel_all ON public.sites;
DROP POLICY IF EXISTS p_sites_ins_all ON public.sites;
DROP POLICY IF EXISTS p_sites_upd_all ON public.sites;

CREATE POLICY p_sites_sel_all ON public.sites
FOR SELECT TO anon USING (true);

CREATE POLICY p_sites_ins_all ON public.sites
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY p_sites_upd_all ON public.sites
FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 8. 验证修复结果
DO $$
BEGIN
    RAISE NOTICE '=== 验证修复结果 ===';
    RAISE NOTICE 'Database structure fix completed successfully!';
END $$;

-- 检查最终表结构
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'ae_self_operated_daily'
ORDER BY ordinal_position;

-- 检查主键
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public' 
  AND tc.table_name = 'ae_self_operated_daily'
  AND tc.constraint_type = 'PRIMARY KEY';

-- 检查数据
SELECT 
    site,
    COUNT(*) as record_count
FROM ae_self_operated_daily 
GROUP BY site
ORDER BY record_count DESC;

-- 检查站点配置
SELECT * FROM sites ORDER BY created_at;
