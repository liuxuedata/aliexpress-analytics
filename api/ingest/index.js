// pages/api/ingest/index.js
import formidable from "formidable";
import fs from "fs";
import { handleManagedXlsx } from "../../../lib/ingest_managed_common.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "Use POST with form-data: file + period_end(optional)" });
  }
  try {
    const form = formidable({ multiples: false, keepExtensions: true });
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });

    const f = files.file || files.excel || files.upload;
    if (!f) return res.status(400).json({ ok: false, msg: "缺少文件字段(file/excel/upload)" });

    const filePath = Array.isArray(f) ? f[0].filepath : f.filepath;
    const originalFilename = Array.isArray(f) ? f[0].originalFilename : f.originalFilename;
    const period_end = (fields.period_end && String(fields.period_end)) || null;

    const result = await handleManagedXlsx(filePath, originalFilename, period_end);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    console.error("[ingest] fatal", e);
    return res.status(500).json({ ok: false, msg: e.message });
  }
}