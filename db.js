// C:\lost_and_found\db.js
function hasSupabaseConfig() {
  const url = CONFIG.SUPABASE_URL;
  const key = CONFIG.SUPABASE_KEY;
  if (!url || !key || url.includes('YOUR_SUPABASE') || key.includes('PASTE-YOUR-')) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.includes('.') &&
      parsed.pathname === '/';
  } catch (e) {
    return false;
  }
}

const SUPABASE_CONFIGURED = hasSupabaseConfig();
const SUPABASE_SDK_AVAILABLE = Boolean(window.supabase && window.supabase.createClient);
const OFFLINE = !SUPABASE_CONFIGURED || !SUPABASE_SDK_AVAILABLE;
const OFFLINE_KEY = 'wanderback_offline_v1';
if (SUPABASE_CONFIGURED && !SUPABASE_SDK_AVAILABLE) {
  console.error('Supabase is configured, but the Supabase browser SDK did not load.');
}
const sb = OFFLINE ? null : window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
let currentUser = null;
let authReady = Promise.resolve(null);

if (!OFFLINE) {
  authReady = sb.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    currentUser = data.session ? data.session.user : null;
    return currentUser;
  });
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    document.dispatchEvent(new CustomEvent('wanderback-auth-change', { detail: currentUser }));
  });
}

function offlineDate(plusDays) {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function offlineRow(n, f) {
  return Object.assign({
    id: 'offline-' + n,
    created_at: new Date().toISOString(),
    title: null, public_details: null, hidden_details: null,
    lat: null, lng: null, location_name: null, place_type: null, photo_url: null,
    reporter_name: null, contact: null, reporter_language: 'en',
    trip_end_date: null, age_range: null, clothing: null, language_spoken: null,
    pickup_option: null, pickup_place: null, status: 'open'
  }, f);
}

function offlineSeed() {
  return {
    lost_items: [
      offlineRow('li1', { title: 'Black bag', public_details: 'Black bag with silver zipper', hidden_details: 'torn strap, initials RK on the lining, blue notebook', lat: 40.7529, lng: -73.9770, location_name: 'Grand Central', place_type: 'Subway', reporter_name: 'Rahul K.', contact: 'rahul.k@example.com', trip_end_date: offlineDate(4) }),
      offlineRow('li2', { title: 'Silver phone, green case', public_details: 'Silver phone in a green case', hidden_details: 'golden retriever puppy wallpaper, red kite sticker', lat: 40.7507, lng: -73.9936, location_name: 'Penn Station', place_type: 'Subway', reporter_name: 'Emma Clarke', contact: 'emma.clarke@example.com', trip_end_date: offlineDate(7) }),
      offlineRow('li3', { title: '財布を紛失', public_details: '茶色の革の財布、金色のボタン付き', hidden_details: '中に家族の写真、東京の地下鉄カード', lat: 40.7581, lng: -73.9856, location_name: 'Times Square', place_type: 'Landmark', reporter_name: 'Yuki Tanaka', contact: 'yuki.tanaka@example.com', reporter_language: 'ja', trip_end_date: offlineDate(2) }),
      offlineRow('li4', { title: 'Yellow umbrella', public_details: 'Yellow umbrella, wooden handle', hidden_details: 'bent rib, bus ticket tucked in handle', lat: 40.7829, lng: -73.9654, location_name: 'Central Park', place_type: 'Landmark', reporter_name: 'Tom Whitaker', contact: 'tom.whitaker@example.com', trip_end_date: offlineDate(10) }),
      offlineRow('li5', { title: 'Brass keys', public_details: 'Three brass keys on an Eiffel Tower keychain', hidden_details: 'tag reads apartment 4B, tiny bell attached', lat: 40.7348, lng: -73.9897, location_name: '14th St Subway', place_type: 'Subway', reporter_name: 'Claire Dubois', contact: 'claire.dubois@example.com', reporter_language: 'fr', trip_end_date: offlineDate(3) }),
      offlineRow('li6', { title: 'Compact camera', public_details: 'Compact camera in orange pouch', hidden_details: 'cracked lens cap, tiny lighthouse charm', lat: 40.7061, lng: -73.9969, location_name: 'Brooklyn Bridge', place_type: 'Landmark', reporter_name: 'Arjun Mehta', contact: 'arjun.mehta@example.com', reporter_language: 'hi', trip_end_date: offlineDate(6) })
    ],
    found_items: [
      offlineRow('fi1', { title: 'Black bag', public_details: 'Black bag, silver zipper', hidden_details: 'torn strap, initials RK on the lining, blue notebook', lat: 40.7525, lng: -73.9775, location_name: 'Grand Central', place_type: 'Subway', reporter_name: 'Priya Nair', contact: 'priya.nair@example.com' }),
      offlineRow('fi2', { title: 'Silver phone', public_details: 'Silver phone, green case', hidden_details: 'golden retriever puppy wallpaper, red kite sticker', lat: 40.7505, lng: -73.9933, location_name: 'Penn Station', place_type: 'Subway', reporter_name: 'Marcus Lee', contact: 'marcus.lee@example.com' }),
      offlineRow('fi3', { title: 'Brown leather wallet', public_details: 'brown leather wallet with gold button', hidden_details: 'family photo, Tokyo subway card', lat: 40.7579, lng: -73.9853, location_name: 'Times Square', place_type: 'Landmark', reporter_name: 'Sam Ortiz', contact: 'sam.ortiz@example.com' }),
      offlineRow('fi4', { title: 'Gray wool scarf', public_details: 'Gray wool scarf with tassels', hidden_details: 'letter M stitched on the corner, smells of lavender', lat: 40.7822, lng: -73.9660, location_name: 'Central Park', place_type: 'Landmark', reporter_name: 'Helen Park', contact: 'helen.park@example.com' }),
      offlineRow('fi5', { title: 'Purple water bottle', public_details: 'Purple steel water bottle', hidden_details: 'dented bottom, surfboard decal', lat: 40.7500, lng: -73.9909, location_name: 'Hotel Pennsylvania', place_type: 'Hotel', reporter_name: 'Front Desk Staff', contact: 'frontdesk@example.com' }),
      offlineRow('fi6', { title: 'Round glasses', public_details: 'Round tortoiseshell glasses', hidden_details: 'scratch near the hinge, pharmacy label inside the sleeve', lat: 40.6413, lng: -73.7781, location_name: 'JFK Airport', place_type: 'Airport', reporter_name: 'Diego Ramos', contact: 'diego.ramos@example.com', reporter_language: 'es' })
    ],
    lost_people: [
      offlineRow('lp1', { title: 'Missing boy', public_details: 'Boy, about 6 years old, red jacket, blue jeans', hidden_details: 'nickname Bubba, birthmark left hand, stuffed rabbit', lat: 40.7529, lng: -73.9771, location_name: 'Grand Central', place_type: 'Subway', reporter_name: 'Maria Lopez', contact: 'maria.lopez@example.com', reporter_language: 'es', age_range: '5-8', clothing: 'Red jacket, blue jeans', language_spoken: 'Spanish' }),
      offlineRow('lp2', { title: 'Missing elderly man', public_details: 'Elderly man with white beard and walking stick', hidden_details: 'wears hearing aid, name tag says Walter', lat: 40.7829, lng: -73.9654, location_name: 'Central Park', place_type: 'Landmark', reporter_name: 'Anna Becker', contact: 'anna.becker@example.com', age_range: '65+', clothing: 'Brown cap, grey cardigan', language_spoken: 'German' })
    ],
    found_people: [
      offlineRow('fp1', { title: 'Boy at information booth', public_details: 'Boy, around 6 years old, red jacket, blue jeans', hidden_details: 'nickname Bubba, birthmark left hand, stuffed rabbit', lat: 40.7525, lng: -73.9774, location_name: 'Grand Central', place_type: 'Subway', reporter_name: 'Officer Dana Reyes', contact: 'dana.reyes@example.com', age_range: '5-8', clothing: 'Red jacket, blue jeans', language_spoken: 'Spanish' }),
      offlineRow('fp2', { title: 'Teenage girl', public_details: 'Teenage girl, purple hoodie, carrying a skateboard', hidden_details: 'braces, bracelet engraved Lucia', lat: 40.7579, lng: -73.9854, location_name: 'Times Square', place_type: 'Landmark', reporter_name: 'Kevin Shaw', contact: 'kevin.shaw@example.com', age_range: '13-17', clothing: 'Purple hoodie', language_spoken: 'Portuguese' })
    ],
    match_cache: []
  };
}

function offlineLoad() {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Offline load failed:', e);
  }
  const fresh = offlineSeed();
  offlineSave(fresh);
  return fresh;
}

function offlineSave(store) {
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('Offline save failed:', e);
  }
}

const DB = {
  get isBackendReady() {
    return !OFFLINE;
  },

  async getUser() {
    if (OFFLINE) return null;
    await authReady;
    return currentUser;
  },

  async signIn(email, password) {
    if (OFFLINE) throw new Error('Account sign-in needs Supabase configuration. Add your project anon key in config.js.');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    return data.user;
  },

  async signUp(email, password, fullName, phone) {
    if (OFFLINE) throw new Error('Account registration needs Supabase configuration. Add your project anon key in config.js.');
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone: phone } }
    });
    if (error) throw error;
    currentUser = data.session ? data.user : null;
    if (data.user && data.session) {
      await this.saveProfile({ full_name: fullName, phone: phone, email: email });
    }
    return data;
  },

  async signOut() {
    if (!OFFLINE) {
      const { error } = await sb.auth.signOut();
      if (error) throw error;
    }
    currentUser = null;
    document.dispatchEvent(new CustomEvent('wanderback-auth-change', { detail: null }));
  },

  async getProfile() {
    const user = await this.getUser();
    if (!user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data || { id: user.id, email: user.email, full_name: user.user_metadata.full_name || '' };
  },

  async saveProfile(profile) {
    const user = await this.getUser();
    if (!user) throw new Error('Sign in before saving account details.');
    const { data, error } = await sb
      .from('profiles')
      .upsert({ id: user.id, email: user.email, ...profile, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async fetchMine(table) {
    const user = await this.getUser();
    if (!user) return [];
    if (OFFLINE) {
      return offlineLoad()[table].filter((row) => row.user_id === user.id);
    }
    const { data, error } = await sb.rpc('get_my_reports', { p_report_table: table });
    if (error) throw error;
    return data || [];
  },

  async findBackendMatches(reportTable, reportId) {
    const { data, error } = await sb.rpc('find_report_matches', {
      p_report_table: reportTable,
      p_report_id: reportId
    });
    if (error) throw error;
    return (data || []).map((row) => ({
      candidate: row.lost_report,
      found: row.found_report,
      score: Number(row.score),
      hiddenMatches: row.hidden_matches,
      hiddenTotal: row.hidden_total,
      reportSide: reportTable.startsWith('lost_') ? 'lost' : 'found'
    }));
  },

  async verifyMatchContact(reportTable, reportId, candidateId) {
    const { data, error } = await sb.rpc('verify_report_match', {
      p_report_table: reportTable,
      p_report_id: reportId,
      p_candidate_id: candidateId
    });
    if (error) throw error;
    return data;
  },

  async fetch(table) {
    showLoading(true);
    try {
      if (OFFLINE) {
        const store = offlineLoad();
        const rows = (store[table] || []).slice();
        rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return rows;
      }
      const publicColumns = 'id,created_at,title,public_details,lat,lng,location_name,place_type,photo_url,reporter_language,trip_end_date,age_range,clothing,language_spoken,status,pickup_option,pickup_place';
      const { data, error } = await sb
        .from(table)
        .select(publicColumns)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('DB.fetch failed:', table, e);
      toast('Could not load reports. Check your connection.');
      return [];
    } finally {
      showLoading(false);
    }
  },

  async insert(table, row) {
    showLoading(true);
    try {
      const user = await this.getUser();
      if (!user) throw new Error('Sign in before submitting a report.');
      if (OFFLINE) {
        const store = offlineLoad();
        const saved = Object.assign(
          offlineRow('new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), {}),
          row,
          { user_id: user.id },
          { created_at: new Date().toISOString(), status: row.status || 'open' }
        );
        store[table] = store[table] || [];
        store[table].push(saved);
        offlineSave(store);
        return saved;
      }
      const { data, error } = await sb
        .from(table)
        .insert({ ...row, user_id: user.id })
        .select('id,created_at,title,public_details,lat,lng,location_name,place_type,photo_url,reporter_language,trip_end_date,age_range,clothing,language_spoken,status')
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('DB.insert failed:', table, e);
      toast('Could not save your report. Please try again.');
      return null;
    } finally {
      showLoading(false);
    }
  },

  async uploadPhoto(blob) {
    if (!blob) return null;
    showLoading(true);
    try {
      if (OFFLINE) {
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read photo'));
          reader.readAsDataURL(blob);
        });
      }
      const user = await this.getUser();
      if (!user) throw new Error('Sign in before uploading a report photo.');
      const path = user.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
      const { error } = await sb.storage.from('photos').upload(path, blob, {
        contentType: 'image/jpeg'
      });
      if (error) throw error;
      const { data } = sb.storage.from('photos').getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.error('DB.uploadPhoto failed:', e);
      toast('Photo upload failed. Saving without a photo.');
      return null;
    } finally {
      showLoading(false);
    }
  },

  async updatePickup(foundId, option, place) {
    showLoading(true);
    try {
      if (OFFLINE) {
        const store = offlineLoad();
        const row = (store.found_items || []).find((r) => r.id === foundId);
        if (row) {
          row.pickup_option = option;
          row.pickup_place = place;
          offlineSave(store);
        }
        return true;
      }
      const { error } = await sb
        .from('found_items')
        .update({ pickup_option: option, pickup_place: place })
        .eq('id', foundId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('DB.updatePickup failed:', e);
      toast('Could not save the pickup choice. Please try again.');
      return false;
    } finally {
      showLoading(false);
    }
  },

  async getCache(lostId, foundId) {
    showLoading(true);
    try {
      if (OFFLINE) {
        const store = offlineLoad();
        return (store.match_cache || []).find((r) => r.lost_id === lostId && r.found_id === foundId) || null;
      }
      const { data, error } = await sb
        .from('match_cache')
        .select('*')
        .eq('lost_id', lostId)
        .eq('found_id', foundId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (e) {
      console.error('DB.getCache failed:', e);
      toast('Match cache unavailable.');
      return null;
    } finally {
      showLoading(false);
    }
  },

  async saveCache(lostId, foundId, score, hm, ht) {
    showLoading(true);
    try {
      if (OFFLINE) {
        const store = offlineLoad();
        store.match_cache = (store.match_cache || []).filter((r) => !(r.lost_id === lostId && r.found_id === foundId));
        store.match_cache.push({ lost_id: lostId, found_id: foundId, score: score, hidden_matches: hm, hidden_total: ht });
        offlineSave(store);
        return;
      }
      const { error } = await sb.from('match_cache').upsert(
        {
          lost_id: lostId,
          found_id: foundId,
          score: score,
          hidden_matches: hm,
          hidden_total: ht
        },
        { onConflict: 'lost_id,found_id' }
      );
      if (error) throw error;
    } catch (e) {
      console.error('DB.saveCache failed:', e);
      toast('Could not save match cache.');
    } finally {
      showLoading(false);
    }
  }
};