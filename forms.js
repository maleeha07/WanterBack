// C:\lost_and_found\forms.js
const FORM_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' }
];
const FORM_TYPES = ['Subway', 'Airport', 'Hotel', 'Landmark', 'Other'];
const FORM_AGES = ['0-4', '5-8', '9-12', '13-17', '18-64', '65+'];
let formFieldSequence = 0;

function formField(labelText, input, helperText) {
  if (!input.id) {
    formFieldSequence += 1;
    input.id = 'report-field-' + formFieldSequence;
  }
  return el('div', null,
    el('label', { htmlFor: input.id }, labelText),
    input,
    helperText ? el('p', { class: 'helper' }, helperText) : null
  );
}

function formSelect(options) {
  const select = el('select');
  options.forEach((o) => {
    const value = typeof o === 'string' ? o : o.code;
    const label = typeof o === 'string' ? o : o.label;
    select.appendChild(el('option', { value: value }, label));
  });
  return select;
}

function formLocation(includeGps, typeSelect) {
  const state = { lat: PLACES[0].lat, lng: PLACES[0].lng, name: PLACES[0].name, type: PLACES[0].type };
  const placeSelect = el('select');
  PLACES.forEach((p, i) => placeSelect.appendChild(el('option', { value: String(i) }, p.name)));
  if (typeSelect) typeSelect.value = state.type;

  placeSelect.addEventListener('change', () => {
    const p = PLACES[Number(placeSelect.value)];
    state.lat = p.lat;
    state.lng = p.lng;
    state.name = p.name;
    state.type = p.type;
    if (typeSelect) typeSelect.value = p.type;
  });

  const nodes = [formField('Location', placeSelect)];

  if (includeGps) {
    const gpsBtn = el('button', { type: 'button', class: 'btn btn-outline btn-small', style: { marginTop: '8px' } }, '📍 Use my GPS');
    gpsBtn.addEventListener('click', async () => {
      gpsBtn.disabled = true;
      showLoading(true);
      try {
        const pos = await getGPS();
        state.lat = pos.lat;
        state.lng = pos.lng;
        state.name = 'My GPS location';
        if (!placeSelect.querySelector('option[value="gps"]')) {
          placeSelect.appendChild(el('option', { value: 'gps' }, 'My GPS location'));
        }
        placeSelect.value = 'gps';
        toast('GPS location set.');
      } catch (e) {
        console.error('GPS failed:', e);
        toast('Could not get your location.');
      } finally {
        showLoading(false);
        gpsBtn.disabled = false;
      }
    });
    nodes.push(gpsBtn);
  }

  return { state: state, nodes: nodes };
}

async function renderReportForm(side) {
  const root = document.getElementById('view-' + side);
  const isLost = side === 'lost';
  const user = await DB.getUser();
  if (!user) {
    root.replaceChildren(
      el('p', { class: 'eyebrow' }, 'Account required'),
      el('h2', null, 'Sign in before submitting a report'),
      el('p', { class: 'account-copy' }, 'Create an account or sign in to post a lost or found report and keep track of its matches.'),
      el('button', { type: 'button', class: 'btn btn-block', onclick: () => showTab('account') }, 'Go to account')
    );
    return;
  }
  const profile = await DB.getProfile();

  const title = el('input', { type: 'text', placeholder: 'e.g. Black bag' });
  const publicDetails = el('textarea', { placeholder: 'What anyone can see: color, brand, size' });
  const hiddenDetails = el('textarea', { placeholder: 'e.g. marks, contents, stickers' });
  const photo = el('input', { type: 'file', accept: 'image/*' });
  const typeSelect = formSelect(FORM_TYPES);
  const langSelect = formSelect(FORM_LANGS);
  const tripEnd = el('input', { type: 'date' });
  const name = el('input', { type: 'text', placeholder: 'Your name', value: profile && profile.full_name || '' });
  const contact = el('input', { type: 'text', placeholder: 'Email or phone', value: profile && (profile.phone || profile.email) || user.email || '' });
  const loc = formLocation(true, typeSelect);
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-block ' + (isLost ? 'btn-orange' : '') }, isLost ? 'Submit lost report' : 'Submit found report');

  const form = el('form', { class: 'form' },
    formField('Title', title),
    formField('Public details', publicDetails),
    formField('Hidden details', hiddenDetails, 'Only you will know this'),
    formField('Photo (optional)', photo),
    formField('Place type', typeSelect),
    formField('Language', langSelect),
    ...loc.nodes,
    isLost ? formField('Trip end date', tripEnd) : null,
    formField('Your name', name),
    formField('Contact', contact),
    submitBtn
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!title.value.trim() || !publicDetails.value.trim() || !contact.value.trim()) {
      toast('Please fill in title, public details and contact.');
      return;
    }
    submitBtn.disabled = true;
    showLoading(true);
    try {
      let photoUrl = null;
      if (photo.files && photo.files[0]) {
        const blob = await compressImage(photo.files[0]);
        photoUrl = await DB.uploadPhoto(blob);
      }
      const row = {
        title: title.value.trim(),
        public_details: publicDetails.value.trim(),
        hidden_details: hiddenDetails.value.trim(),
        lat: loc.state.lat,
        lng: loc.state.lng,
        location_name: loc.state.name,
        place_type: typeSelect.value,
        photo_url: photoUrl,
        reporter_name: name.value.trim(),
        contact: contact.value.trim(),
        reporter_language: langSelect.value,
        trip_end_date: isLost && tripEnd.value ? tripEnd.value : null
      };
      const saved = await DB.insert(isLost ? 'lost_items' : 'found_items', row);
      if (!saved) return;

      const matches = await findMatches(saved, false, side);
      if (isLost) {
        showTab('home');
        if (matches.length) showMatch(saved, matches[0], false, 'lost');
        else toast('Report saved. We will keep looking.');
      } else if (matches.length) {
        renderReportForm('found');
        showMatch(saved, matches[0], false, 'found');
      } else {
        toast("No match yet, we'll keep looking");
        renderReportForm('found');
      }
    } catch (e) {
      console.error('Report submit failed:', e);
      toast('Something went wrong. Please try again.');
    } finally {
      showLoading(false);
      submitBtn.disabled = false;
    }
  });

  root.replaceChildren(
    el('h2', null, isLost ? 'Report a lost item' : 'Report a found item'),
    form
  );
}

async function renderPersonForm(side) {
  const root = document.getElementById('view-people');
  const isLost = side === 'lost';
  const user = await DB.getUser();
  if (!user) {
    root.replaceChildren(
      emergencyBanner(),
      el('p', { class: 'eyebrow' }, 'Account required'),
      el('h2', null, 'Sign in before submitting a people report'),
      el('p', { class: 'account-copy' }, 'An account keeps your reports and potential matches together.'),
      el('button', { type: 'button', class: 'btn btn-block', onclick: () => showTab('account') }, 'Go to account')
    );
    return;
  }
  const profile = await DB.getProfile();

  const age = formSelect(FORM_AGES);
  const clothing = el('input', { type: 'text', placeholder: 'e.g. Red jacket, blue jeans' });
  const spoken = el('input', { type: 'text', placeholder: 'e.g. Spanish' });
  const publicDetails = el('textarea', { placeholder: 'What anyone can see: height, hair, where last seen' });
  const hiddenDetails = el('textarea', { placeholder: 'e.g. nickname, birthmark, favorite toy' });
  const langSelect = formSelect(FORM_LANGS);
  const name = el('input', { type: 'text', placeholder: 'Your name', value: profile && profile.full_name || '' });
  const contact = el('input', { type: 'text', placeholder: 'Email or phone', value: profile && (profile.phone || profile.email) || user.email || '' });
  const loc = formLocation(false, null);
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-block ' + (isLost ? 'btn-orange' : '') }, isLost ? 'Submit missing person report' : 'Submit found person report');
  const backBtn = el('button', { type: 'button', class: 'btn btn-outline btn-block', onclick: () => renderPeopleHome() }, 'Back');

  const form = el('form', { class: 'form' },
    formField('Age range', age),
    formField('Clothing', clothing),
    formField('Language spoken', spoken),
    formField('Public details', publicDetails),
    formField('Hidden details', hiddenDetails, 'Only you will know this'),
    ...loc.nodes,
    formField('Your name', name),
    formField('Contact', contact),
    formField('Your language', langSelect),
    submitBtn,
    backBtn
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!publicDetails.value.trim() || !contact.value.trim()) {
      toast('Please fill in public details and contact.');
      return;
    }
    submitBtn.disabled = true;
    showLoading(true);
    try {
      const row = {
        title: isLost ? 'Looking for someone' : 'Found someone',
        public_details: publicDetails.value.trim(),
        hidden_details: hiddenDetails.value.trim(),
        lat: loc.state.lat,
        lng: loc.state.lng,
        location_name: loc.state.name,
        place_type: loc.state.type,
        photo_url: null,
        reporter_name: name.value.trim(),
        contact: contact.value.trim(),
        reporter_language: langSelect.value,
        age_range: age.value,
        clothing: clothing.value.trim(),
        language_spoken: spoken.value.trim()
      };
      const saved = await DB.insert(isLost ? 'lost_people' : 'found_people', row);
      if (!saved) return;

      const matches = await findMatches(saved, true, side);
      await renderPeopleHome();
      if (matches.length) showMatch(saved, matches[0], true, side);
      else toast(isLost ? 'Report saved. We will keep looking.' : "No match yet, we'll keep looking");
    } catch (e) {
      console.error('Person submit failed:', e);
      toast('Something went wrong. Please try again.');
    } finally {
      showLoading(false);
      submitBtn.disabled = false;
    }
  });

  root.replaceChildren(
    emergencyBanner(),
    el('h2', null, isLost ? "I'm looking for someone" : 'I found someone'),
    form
  );
}