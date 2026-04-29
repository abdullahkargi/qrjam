import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://lbavgloyqlsuwxicnteu.supabase.co";
const supabaseKey = "sb_publishable_jpt3joLzSXVeUTgJ2V89rg__aGa5iCC";

export const supabase = createClient(supabaseUrl, supabaseKey);