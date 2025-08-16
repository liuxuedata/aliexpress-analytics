#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convert raw Excel (possibly with broken styles) into a clean 2-sheet file:
- Data (EN): two-row headers (original rows 8 & 9 as header levels), translated to English
- Descriptions (EN): meta fields above headers + row 9 explanations aggregated
Usage:
    python convert_to_multiheader.py input.xlsx output.xlsx
"""

import sys
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Tuple
import pandas as pd

def read_xlsx_lowlevel(path: str) -> pd.DataFrame:
    """Read an .xlsx without openpyxl by parsing sheet1.xml and sharedStrings.xml"""
    with zipfile.ZipFile(path, 'r') as z:
        # Shared strings
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
            ns = {'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in ss.findall('m:si', ns):
                texts = [t.text or '' for t in si.findall('.//m:t', ns)]
                shared.append(''.join(texts))
        # First sheet
        sheet_name = 'xl/worksheets/sheet1.xml'
        if sheet_name not in z.namelist():
            raise FileNotFoundError("Expected 'xl/worksheets/sheet1.xml' not found in workbook.")
        ws = ET.fromstring(z.read(sheet_name))

    def col_to_index(cell_ref: str) -> int:
        col = ''.join([c for c in cell_ref if c.isalpha()])
        n = 0
        for ch in col:
            n = n*26 + (ord(ch)-ord('A')+1)
        return n-1

    ns_ws = {'ws':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = []
    maxc = 0
    for row in ws.findall('ws:sheetData/ws:row', ns_ws):
        cells = {}
        for c in row.findall('ws:c', ns_ws):
            r = c.attrib.get('r')
            t = c.attrib.get('t')
            v = c.find('ws:v', ns_ws)
            is_node = c.find('ws:is', ns_ws)
            val = ''
            if is_node is not None:
                val = ''.join([(tn.text or '') for tn in is_node.findall('.//ws:t', ns_ws)])
            elif v is not None:
                raw = v.text or ''
                if t == 's' and raw.isdigit() and int(raw) < len(shared):
                    val = shared[int(raw)]
                else:
                    val = raw
            if r:
                idx = col_to_index(r)
                cells[idx] = val
                if idx > maxc: maxc = idx
        dense = [cells.get(i,'') for i in range(maxc+1)]
        rows.append(dense)

    width = max((len(r) for r in rows), default=0)
    norm = [r + ['']*(width-len(r)) for r in rows]
    return pd.DataFrame(norm)

# Translation dictionary (extend as needed)
REPL = {
    "Товары": "Product",
    "Категория 1 уровня": "Category L1",
    "Категория 2 уровня": "Category L2",
    "Категория 3 уровня": "Category L3",
    "Бренд": "Brand",
    "Модель": "Model",
    "Схема продаж": "Fulfillment (FBO/FBS)",
    "SKU": "SKU",
    "Артикул": "Vendor Code",
    "Продажи": "Sales",
    "ABC-анализ по сумме заказов": "ABC by Order Value",
    "ABC-анализ по количеству заказов": "ABC by Order Count",
    "ABC-анализ по\nсумме заказов": "ABC by Order Value",
    "ABC-анализ по\nколичеству заказов": "ABC by Order Count",
    "Заказано на сумму": "Order Value",
    "Заказано на\nсумму": "Order Value",
    "Динамика": "Change vs prior period",
    "Доля в общей сумме заказов": "Share of Total Order Value",
    "Доля в общей\nсумме заказов": "Share of Total Order Value",
    "Воронка продаж": "Funnel",
    "Позиция в поиске и каталоге": "Avg Listing Rank",
    "Позиция в поиске\nи каталоге": "Avg Listing Rank",
    "Клики/показы (CTR)": "CTR",
    "Клики/показы\n(CTR)": "CTR",
    "Доля показов": "Share of Impressions",
    "Просмотры карточки": "Product Page Views",
    "В корзине": "Added to Cart",
    "Добавили в корзину": "Add-to-Cart Users",
    "Конверсия в корзину": "Add-to-Cart Rate",
    "Конверсия в корзину\nиз просмотров": "Add-to-Cart Rate",
    "Заказы": "Orders",
    "Количество заказов": "Order Count",
    "Конверсия из корзины в заказ": "Cart-to-Order Conversion",
    "Конверсия из\nкорзины в заказ": "Cart-to-Order Conversion",
    "Процент отмен": "Cancel Rate",
    "Процент возврата": "Return Rate",
    "Факторы продаж": "Sales Factors",
    "Средняя цена": "Average Price",
    "Скидка от вашей\nцены": "Discount vs Your Price",
    "Индекс цен": "Price Index",
    "Дней в акциях": "Days on Promotion",
    "Общая ДРР": "Total ACoS (Ad Cost Ratio)",
    "Дней с\nпродвижением\n(трафареты)": "Days with Ads (Placements)",
    "Дней без остатка": "Days Out of Stock",
    "Дней без остатка\n19.07.2025 –\n15.08.2025": "Days Out of Stock",
    "Остаток на конец\nпериода": "Ending Inventory",
    "Рекомендация по поставке на FBO": "FBO Restock Recommendation",
    "Сколько товаров поставить": "Units to Restock",
    "Среднее время доставки": "Avg Delivery Time",
    "Среднее время\nдоставки\n19.07.2025 –\n15.08.2025": "Avg Delivery Time",
    "Отзывы": "Reviews",
    "Рейтинг товара": "Product Rating",
    # extra
    "Итого и среднее": "Total & Average",
    "–": "",
}

def tr(s: str) -> str:
    if s is None:
        return ""
    s = str(s).replace("\n"," ").strip()
    return REPL.get(s, s)

def build_multiheader(df_all: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Use original rows 8 & 9 (1-based) as header levels -> indices 7 & 8 (0-based).
    Return (data_frame_with_multiindex_columns, descriptions_df)
    """
    hdr_lvl1_raw = df_all.iloc[7].tolist()
    hdr_lvl2_raw = df_all.iloc[8].tolist()

    # Forward-fill level-1 titles to emulate merged cells
    hdr_lvl1_ff = []
    last = ""
    for v in hdr_lvl1_raw:
        s = str(v).strip()
        if s:
            last = s
            hdr_lvl1_ff.append(s)
        else:
            hdr_lvl1_ff.append(last)

    hdr1_en = [tr(x) for x in hdr_lvl1_ff]
    hdr2_en = [tr(x) for x in hdr_lvl2_raw]

    # Data block starts at row 10 (1-based) => index 9 or 10; we use 10 to skip divider lines
    data_block = df_all.iloc[10:].copy()

    # Keep columns that have headers or data
    keep = []
    for i,(a,b) in enumerate(zip(hdr1_en, hdr2_en)):
        has_header = (str(a).strip() != "") or (str(b).strip() != "")
        has_data = any(str(x).strip() != "" for x in data_block.iloc[:, i].tolist())
        if has_header or has_data:
            keep.append(i)

    hdr1_sel = [hdr1_en[i] for i in keep]
    hdr2_sel = [hdr2_en[i] for i in keep]
    multi_cols = pd.MultiIndex.from_arrays([hdr1_sel, hdr2_sel])

    data_rows = data_block.iloc[:, keep]

    # Drop leading noise rows (all dashes/empty)
    def row_is_noise(r):
        s = "".join(str(x).strip() for x in r.tolist())
        return (s == "") or set(s) <= {"-", "–"}

    while len(data_rows) > 0 and row_is_noise(data_rows.iloc[0]):
        data_rows = data_rows.iloc[1:]

    data_rows.columns = multi_cols
    data_rows.reset_index(drop=True, inplace=True)

    # Descriptions: all rows above row 8 (1-based), plus row 9 text
    meta_rows = df_all.iloc[0:7, 0].fillna("").tolist()  # 1..7
    desc_rows = df_all.iloc[8, :].astype(str).tolist()   # row 9
    desc_combined = " ".join([x for x in desc_rows if x and x not in ["", "–"]]).strip()

    meta_pairs = []
    for m in meta_rows:
        if ":" in m:
            k, v = m.split(":", 1)
            meta_pairs.append([tr(k.strip()), v.strip()])
        elif m.strip():
            meta_pairs.append(["Note", m.strip()])

    desc_pairs = []
    if desc_combined:
        desc_pairs.append(["Explanation", desc_combined])

    df_desc = pd.DataFrame(meta_pairs + desc_pairs, columns=["Field", "Value / Text"])

    return data_rows, df_desc

def convert(input_path: str, output_path: str) -> None:
    df_all = read_xlsx_lowlevel(input_path)
    df_data, df_desc = build_multiheader(df_all)

    # Save to Excel (note: MultiIndex requires index=True for xlsxwriter)
    df_out = df_data.copy()
    df_out.index.name = ""  # cosmetic empty index header
    with pd.ExcelWriter(output_path, engine="xlsxwriter") as writer:
        df_out.to_excel(writer, index=True, sheet_name="Data (EN)")
        df_desc.to_excel(writer, index=False, sheet_name="Descriptions (EN)")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python convert_to_multiheader.py input.xlsx output.xlsx")
        sys.exit(1)
    inp = sys.argv[1]
    out = sys.argv[2]
    convert(inp, out)
    print(f"Saved -> {out}")
