-- 修复 independent_first_seen 表结构不一致问题
-- 统一使用 product_identifier 列名

-- 1. 检查当前表结构
SELECT '=== 当前表结构检查 ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'independent_first_seen' 
ORDER BY ordinal_position;

-- 2. 如果存在 landing_path 列，重命名为 product_identifier
DO $$
BEGIN
    -- 检查是否存在 landing_path 列
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'independent_first_seen' 
        AND column_name = 'landing_path'
    ) THEN
        -- 如果不存在 product_identifier 列，重命名 landing_path
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'independent_first_seen' 
            AND column_name = 'product_identifier'
        ) THEN
            ALTER TABLE independent_first_seen 
            RENAME COLUMN landing_path TO product_identifier;
            RAISE NOTICE '已重命名 landing_path 列为 product_identifier';
        ELSE
            -- 如果两个列都存在，需要合并数据
            RAISE NOTICE 'landing_path 和 product_identifier 列都存在，需要手动处理';
        END IF;
    END IF;
END $$;

-- 3. 确保表结构正确
CREATE TABLE IF NOT EXISTS independent_first_seen (
    id SERIAL PRIMARY KEY,
    site TEXT NOT NULL,
    product_identifier TEXT NOT NULL,
    first_seen_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(site, product_identifier)
);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_independent_first_seen_site 
ON independent_first_seen(site);

CREATE INDEX IF NOT EXISTS idx_independent_first_seen_product 
ON independent_first_seen(product_identifier);

CREATE INDEX IF NOT EXISTS idx_independent_first_seen_date 
ON independent_first_seen(first_seen_date);

-- 5. 验证修复结果
SELECT '=== 修复后表结构 ===' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'independent_first_seen' 
ORDER BY ordinal_position;

-- 6. 检查数据
SELECT '=== 数据检查 ===' as info;
SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT site) as unique_sites,
    COUNT(DISTINCT product_identifier) as unique_products
FROM independent_first_seen;
