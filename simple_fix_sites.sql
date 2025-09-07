-- 简化修复sites表脚本
-- 避免复杂的DO块，直接执行SQL命令

-- 1. 删除现有的sites表（如果存在）
DROP TABLE IF EXISTS public.sites CASCADE;

-- 2. 创建新的sites表
CREATE TABLE public.sites (
    id          text primary key,
    name        text not null,
    platform    text not null,
    display_name text not null,
    is_active   boolean default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- 3. 插入默认站点数据
INSERT INTO public.sites (id, name, platform, display_name) VALUES
    ('ae_self_operated_a', 'A站', 'ae_self_operated', '速卖通自运营 A站'),
    ('independent_poolsvacuum', 'poolsvacuum', 'independent', '独立站 poolsvacuum.com');

-- 4. 启用RLS
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- 5. 创建RLS策略
CREATE POLICY p_sites_sel_all ON public.sites FOR SELECT TO anon USING (true);
CREATE POLICY p_sites_ins_all ON public.sites FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY p_sites_upd_all ON public.sites FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 6. 验证结果
SELECT 'Sites table created successfully' as status;
SELECT COUNT(*) as total_sites FROM sites;
SELECT * FROM sites;
