// /api/ozon/import/index.js
import multiparty from 'multiparty';
import { createClient } from '@supabase/supabase-js';

// 关键：自己解析 multipart，防止 bodyParser 吃掉文件
export const config = { api: { bodyParser: false } };

function errRes(res, status, step, err, extra={}) {
  const msg = (err && (err.message || err.error || err.toString?.())) || String(err || 'Unknown');
  return res.status(status).json({ ok:false, step, msg, ...extra });
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!url) throw new Error('Missing SUPABASE_URL');
  if (!srk && !anon) throw new Error('Missing SERVICE_ROLE_KEY or ANON_KEY');
  return createClient(url, srk || anon, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errRes(res, 405, 'method', 'Method Not Allowed');
  }

  let supabase;
  try {
    supabase = getClient();
  } catch (e) {
    return errRes(res, 500, 'env', e);
  }

  // 解析 multipart
  try {
    const form = new multiparty.Form();
    const { fields, files } = await new Promise((resolve, reject) =>
      form.parse(req, (err, flds, fls) => err ? reject(err) : resolve({ fields: flds, files: fls }))
    );

    // 记录一下收到的字段名，方便定位
    const file =
      (files?.file && files.file[0]) ||
      (files?.upload && files.upload[0]) ||
      (files?.data && files.data[0]);

    if (!file) {
      return errRes(res, 400, 'parse', 'missing file (需要 form-data 字段名 "file")', {
        gotFileKeys: Object.keys(files || {}),
        gotFieldKeys: Object.keys(fields || {})
      });
    }

    // 仅做探测：把文件的基础信息、你传来的 type/period_end 回显出来，
    // 确认“请求形态”先是正确的
    const type = String(fields?.type?.[0] || '');
    const period_end = String(fields?.period_end?.[0] || '');
    const meta = {
      originalFilename: file.originalFilename,
      size: file.size,
      headers: file.headers,           // Content-Type、boundary 等
      fieldnameUsed: (files.file && 'file') || (files.upload && 'upload') || (files.data && 'data')
    };

    // —— 在这里做你原有的 Excel 解析 + 校验 + upsert —— //
    // 如果你暂时只想确认“能到这一步”，先直接 return：
    return res.status(200).json({ ok:true, step:'received', type, period_end, file: meta });

    // 之后再逐步把解析和入库放回去，并在 catch 里用 errRes 返回：
    // try { ...解析... } catch(e){ return errRes(res, 400, 'xlsx-parse', e); }
    // try { ...upsert...  } catch(e){ return errRes(res, 500, 'db-upsert', e, { from:i, to:i+CHUNK }); }

  } catch (e) {
    console.error(e);
    return errRes(res, 500, 'multipart', e);
  }
}
