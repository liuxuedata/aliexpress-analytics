const { createClient } = require('@supabase/supabase-js');

/**
 * Vercel serverless function to accept product analytics data and persist it to a Supabase table.
 *
 * To use this function:
 * 1. Sign up for a free Supabase account at https://supabase.com and create a new project.
 * 2. In the project, create a table (for example `analytics`) with columns matching the JSON fields
 *    you intend to store (product_id, visitors, add_to_cart, checkout, etc.).
 * 3. Generate an API key (Anon key) and find your Supabase URL in the project settings.
 * 4. In your Vercel dashboard, set environment variables `SUPABASE_URL` and `SUPABASE_KEY` with the
 *    corresponding values from Supabase. These variables will be available at runtime in this function.
 *
 * The front‑end can send a POST request containing JSON data to `/api/submitData` and this function
 * will insert the records into Supabase.
 */

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res
      .status(500)
      .json({ error: 'Supabase environment variables are not configured' });
  }

  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const data = req.body;
    // Validate payload (basic example)
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Payload must be an array of records' });
    }
    // Insert into table named "analytics"; adjust table name as needed
    const { error } = await supabase.from('analytics').insert(data);
    if (error) {
      throw error;
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};