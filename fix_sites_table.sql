-- 修复sites表id字段类型问题
-- 这个脚本专门处理sites表的id字段类型错误

-- 1. 检查sites表是否存在
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sites') THEN
        RAISE NOTICE 'Sites table does not exist, creating new one';
        
        CREATE TABLE public.sites (
            id          text primary key,
            name        text not null,
            platform    text not null,
            display_name text not null,
            is_active   boolean default true,
            created_at  timestamptz not null default now(),
            updated_at  timestamptz not null default now()
        );
        
        -- 初始化默认站点
        INSERT INTO public.sites (id, name, platform, display_name) VALUES
            ('ae_self_operated_a', 'A站', 'ae_self_operated', '速卖通自运营 A站'),
            ('independent_poolsvacuum', 'poolsvacuum', 'independent', '独立站 poolsvacuum.com');
            
        RAISE NOTICE 'Created sites table with default data';
    ELSE
        -- 检查id字段类型
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'sites' 
            AND column_name = 'id' 
            AND data_type = 'integer'
        ) THEN
            RAISE NOTICE 'Sites table has integer id field, fixing...';
            
            -- 备份现有数据
            CREATE TABLE sites_backup AS SELECT * FROM public.sites;
            RAISE NOTICE 'Backed up existing sites data';
            
            -- 删除旧表
            DROP TABLE public.sites;
            
            -- 创建新表
            CREATE TABLE public.sites (
                id          text primary key,
                name        text not null,
                platform    text not null,
                display_name text not null,
                is_active   boolean default true,
                created_at  timestamptz not null default now(),
                updated_at  timestamptz not null default now()
            );
            
            RAISE NOTICE 'Recreated sites table with text id field';
            
            -- 初始化默认站点
            INSERT INTO public.sites (id, name, platform, display_name) VALUES
                ('ae_self_operated_a', 'A站', 'ae_self_operated', '速卖通自运营 A站'),
                ('independent_poolsvacuum', 'poolsvacuum', 'independent', '独立站 poolsvacuum.com');
                
            RAISE NOTICE 'Initialized default sites';
        ELSE
            RAISE NOTICE 'Sites table already has correct text id field';
        END IF;
    END IF;
END $$;

-- 2. 设置RLS策略
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- 清理旧策略
DROP POLICY IF EXISTS p_sites_sel_all ON public.sites;
DROP POLICY IF EXISTS p_sites_ins_all ON public.sites;
DROP POLICY IF EXISTS p_sites_upd_all ON public.sites;

-- 创建新策略
CREATE POLICY p_sites_sel_all ON public.sites
FOR SELECT TO anon USING (true);

CREATE POLICY p_sites_ins_all ON public.sites
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY p_sites_upd_all ON public.sites
FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 3. 验证结果
SELECT 'Sites table fixed successfully' as status;
SELECT COUNT(*) as total_sites FROM sites;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'sites'
ORDER BY ordinal_position;
