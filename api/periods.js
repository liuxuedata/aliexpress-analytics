
const { createClient } = require("@supabase/supabase-js");
function supa(){
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY, { auth:{persistSession:false} });
}

module.exports = async (req, res) => {
  try{
    const supabase = supa();
    const { data: weeks, error: e1 } = await supabase
      .from("managed_stats")
      .select("period_end")
      .eq("period_type","week")
      .order("period_end", { ascending: false });
    if (e1) throw e1;

    const { data: months, error: e2 } = await supabase
      .from("managed_stats")
      .select("period_end")
      .eq("period_type","month")
      .order("period_end", { ascending: false });
    if (e2) throw e2;

    const uniq = (arr) => Array.from(new Set(arr.map(x=>x.period_end)));
    res.status(200).json({ ok:true, weeks: uniq(weeks||[]), months: uniq(months||[]) });
  } catch(e){
    res.status(500).json({ ok:false, msg:e.message });
  }
};
