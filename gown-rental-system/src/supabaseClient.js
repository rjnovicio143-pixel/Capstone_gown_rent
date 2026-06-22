import { createClient } from '@supabase/supabase-js';

// Kopyaha ang Project URL gikan sa imong settings sa Supabase
const supabaseUrl = 'https://orriybsghzikjdyvjqwy.supabase.co'; 

// I-paste dinhi ang imong PUBLISHABLE KEY (katong nagsugod sa "sb_publishable_...")
const supabaseAnonKey = 'sb_publishable_OeEBZ52JxbeVwDC0WCKrlQ_Pdvbs9CL'; 

export const supabase = createClient(supabaseUrl, supabaseAnonKey);