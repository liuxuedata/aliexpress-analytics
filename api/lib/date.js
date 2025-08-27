const XLSX = require('xlsx');

function parseDay(dayRaw) {
  if (dayRaw === null || dayRaw === undefined || dayRaw === '') return null;

  if (typeof dayRaw === 'number') {
    const s = String(dayRaw);
    if (/^\d{8}$/.test(s)) {
      return new Date(Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8)));
    }
    const parsed = XLSX.SSF && XLSX.SSF.parse_date_code(dayRaw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return new Date(Date.UTC(parsed.y, parsed.m-1, parsed.d));
    }
    return null;
  }

  const s = String(dayRaw).trim();
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  if (/^\d{8}$/.test(s)) {
    return new Date(Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8)));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = { parseDay };
