// C:\lost_and_found\screens.js
let homeMap = null;

function placeIcon(type) {
  const icons = { Subway: '🚇', Airport: '✈️', Hotel: '🏨', Landmark: '🏛️', Other: '📍' };
  return icons[type] || icons.Other;
}

function emergencyBanner() {
  return el('div', { class: 'emergency' },
    el('strong', null, 'If someone is in danger, call 911 first'),
    el('a', { class: 'btn', href: 'tel:911' }, '📞 Call 911'),
    el('p', null, 'This app supports, but does not replace, emergency services.')
  );
}

function itemCard(row, kind) {
  const isLost = kind === 'lost';
  const card = el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', { class: 'card-icon' }, placeIcon(row.place_type)),
      el('div', null,
        el('p', { class: 'card-title' }, row.title || 'Untitled'),
        el('p', { class: 'card-meta' }, row.location_name || 'Unknown place')
      )
    ),
    el('p', { class: 'card-text' }, row.public_details || '')
  );
  if (row.photo_url) {
    card.appendChild(el('img', { class: 'card-photo', src: row.photo_url, alt: row.title || 'Item photo', loading: 'lazy' }));
  }
  const badges = el('div', { class: 'card-badges' },
    el('span', { class: 'badge ' + (isLost ? 'badge-lost' : 'badge-found') }, isLost ? 'Lost' : 'Found')
  );
  if (isLost) {
    const trip = tripBadge(row);
    if (trip) badges.appendChild(trip);
  }
  card.appendChild(badges);
  return card;
}

function personCard(row, kind) {
  const isLost = kind === 'lost';
  const details = [];
  if (row.age_range) details.push('Age: ' + row.age_range);
  if (row.clothing) details.push('Clothing: ' + row.clothing);
  if (row.language_spoken) details.push('Speaks: ' + row.language_spoken);
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('span', { class: 'card-icon' }, placeIcon(row.place_type)),
      el('div', null,
        el('p', { class: 'card-title' }, row.title || 'Untitled'),
        el('p', { class: 'card-meta' }, row.location_name || 'Unknown place')
      )
    ),
    el('p', { class: 'card-text' }, row.public_details || ''),
    details.length ? el('p', { class: 'card-meta' }, details.join(' · ')) : null,
    el('div', { class: 'card-badges' },
      el('span', { class: 'badge ' + (isLost ? 'badge-lost' : 'badge-found') }, isLost ? 'Looking for someone' : 'Found someone')
    )
  );
}

async function renderHome() {
  const root = document.getElementById('view-home');
  if (homeMap) {
    homeMap.remove();
    homeMap = null;
  }
  root.replaceChildren();

  const listBtn = el('button', { type: 'button', class: 'seg active', 'aria-pressed': 'true' }, 'List');
  const mapBtn = el('button', { type: 'button', class: 'seg', 'aria-pressed': 'false' }, 'Map');
  const refreshBtn = el('button', { type: 'button', class: 'btn btn-small btn-outline', onclick: () => renderHome() }, '↻ Refresh');
  const listBox = el('div', { class: 'card-list' });
  const mapBox = el('div', { id: 'home-map', class: 'map-box', style: { display: 'none' } });

  root.append(
    el('section', { class: 'home-intro' },
      el('p', { class: 'eyebrow' }, 'Wanderback community'),
      el('h2', null, 'Find what you thought was gone'),
      el('p', null, 'Browse recent reports or add one of your own. A few details can help bring the right things back together.')
    ),
    el('div', { class: 'toolbar' }, el('h2', null, 'Recent reports'), refreshBtn),
    el('div', { class: 'seg-group' }, listBtn, mapBtn),
    listBox,
    mapBox
  );

  let lost = [];
  let found = [];
  showLoading(true);
  try {
    const results = await Promise.all([DB.fetch('lost_items'), DB.fetch('found_items')]);
    lost = results[0].filter((r) => r.status === 'open');
    found = results[1].filter((r) => r.status === 'open');
  } catch (e) {
    console.error('renderHome failed:', e);
    toast('Could not load items.');
  } finally {
    showLoading(false);
  }

  lost.sort((a, b) => {
    const da = a.trip_end_date ? new Date(a.trip_end_date).getTime() : Infinity;
    const db = b.trip_end_date ? new Date(b.trip_end_date).getTime() : Infinity;
    return da - db;
  });

  listBox.appendChild(el('h3', null, 'Lost items (leaving soonest first)'));
  if (lost.length === 0) listBox.appendChild(el('p', { class: 'empty' }, 'No lost items reported.'));
  lost.forEach((r) => listBox.appendChild(itemCard(r, 'lost')));

  listBox.appendChild(el('h3', null, 'Found items'));
  if (found.length === 0) listBox.appendChild(el('p', { class: 'empty' }, 'No found items reported.'));
  found.forEach((r) => listBox.appendChild(itemCard(r, 'found')));

  function buildMap() {
    homeMap = L.map(mapBox).setView([40.7527, -73.9772], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(homeMap);

    const addMarkers = (rows, kind, color) => {
      rows.forEach((r) => {
        if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return;
        const popup = el('div', null,
          el('strong', null, (kind === 'lost' ? 'Lost: ' : 'Found: ') + (r.title || 'Untitled')),
          el('br'),
          document.createTextNode(r.location_name || '')
        );
        L.circleMarker([r.lat, r.lng], {
          radius: 10,
          color: '#ffffff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95
        }).addTo(homeMap).bindPopup(popup);
      });
    };
    addMarkers(lost, 'lost', '#f97316');
    addMarkers(found, 'found', '#0f766e');
  }

  function setView(view) {
    const showMap = view === 'map';
    if (showMap && typeof L === 'undefined') {
      toast('The map is unavailable. Check your internet connection and try again.');
      return;
    }
    listBox.style.display = showMap ? 'none' : 'flex';
    mapBox.style.display = showMap ? 'block' : 'none';
    listBtn.classList.toggle('active', !showMap);
    mapBtn.classList.toggle('active', showMap);
    listBtn.setAttribute('aria-pressed', String(!showMap));
    mapBtn.setAttribute('aria-pressed', String(showMap));
    if (showMap) {
      if (!homeMap) buildMap();
      homeMap.invalidateSize();
    }
  }

  listBtn.addEventListener('click', () => setView('list'));
  mapBtn.addEventListener('click', () => setView('map'));
}

async function renderPeopleHome() {
  const root = document.getElementById('view-people');
  root.replaceChildren();

  const openForm = (side) => {
    renderPersonForm(side).catch((e) => {
      console.error('renderPersonForm failed:', e);
      toast('The person form is not available yet.');
    });
  };

  const list = el('div', { class: 'card-list' });
  root.append(
    emergencyBanner(),
    el('section', { class: 'home-intro' },
      el('p', { class: 'eyebrow' }, 'People first'),
      el('h2', null, 'Help someone reconnect'),
      el('p', null, 'If someone may be in immediate danger, contact emergency services before posting here.')
    ),
    el('div', { class: 'toolbar' },
      el('h2', null, 'Community reports'),
      el('button', { type: 'button', class: 'btn btn-small btn-outline', onclick: () => renderPeopleHome() }, '↻ Refresh')
    ),
    el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn btn-orange', onclick: () => openForm('lost') }, "I'm looking for someone"),
      el('button', { type: 'button', class: 'btn', onclick: () => openForm('found') }, 'I found someone')
    ),
    list
  );

  let lost = [];
  let found = [];
  showLoading(true);
  try {
    const results = await Promise.all([DB.fetch('lost_people'), DB.fetch('found_people')]);
    lost = results[0].filter((r) => r.status === 'open');
    found = results[1].filter((r) => r.status === 'open');
  } catch (e) {
    console.error('renderPeopleHome failed:', e);
    toast('Could not load people reports.');
  } finally {
    showLoading(false);
  }

  list.appendChild(el('h3', null, 'Looking for someone'));
  if (lost.length === 0) list.appendChild(el('p', { class: 'empty' }, 'No open reports.'));
  lost.forEach((r) => list.appendChild(personCard(r, 'lost')));

  list.appendChild(el('h3', null, 'Found someone'));
  if (found.length === 0) list.appendChild(el('p', { class: 'empty' }, 'No open reports.'));
  found.forEach((r) => list.appendChild(personCard(r, 'found')));
}

function openOverlay(...children) {
  const overlay = document.getElementById('overlay');
  overlay.replaceChildren(el('div', {
    class: 'overlay-panel',
    role: 'dialog',
    'aria-modal': 'true',
    tabindex: '-1'
  }, ...children));
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.onclick = (event) => {
    if (event.target === overlay) closeOverlay();
  };
  overlay.scrollTop = 0;
  overlay.querySelector('.overlay-panel').focus();
}

function closeOverlay() {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.replaceChildren();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeOverlay();
});

function showMatch(report, match, isPerson, reportSide) {
  const lost = match.candidate;
  const found = match.found;
  const ownReport = reportSide === 'lost' ? lost : found;
  const counterpart = reportSide === 'lost' ? found : lost;
  const percent = Math.ceil(match.score * 100);

  const panel = [
    el('h2', null, 'Possible match found'),
    el('p', { class: 'account-copy' }, 'Check the public details, then contact the other reporter to confirm the match.'),
    el('p', { class: 'confidence' }, percent + '% confidence'),
    el('div', { class: 'card', style: { marginTop: '12px' } },
      el('p', { class: 'eyebrow' }, reportSide === 'lost' ? 'Found report' : 'Lost report'),
      el('p', { class: 'card-title' }, counterpart.title || 'Untitled'),
      el('p', { class: 'card-meta' }, counterpart.location_name || ''),
      el('p', { class: 'card-text' }, counterpart.public_details || ''),
      (!isPerson && counterpart.photo_url)
        ? el('img', { class: 'card-photo', src: counterpart.photo_url, alt: counterpart.title || 'Report photo' })
        : null
    ),
    el('p', { class: 'stat-line' }, 'Hidden details: ' + match.hiddenMatches + ' of ' + match.hiddenTotal + ' match')
  ];

  const trip = tripBadge(ownReport);
  if (trip) panel.push(el('div', { class: 'card-badges' }, trip));

  const contactSlot = el('div');
  const verifyBtn = el('button', {
    type: 'button',
    class: 'btn btn-block',
    onclick: async () => {
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Checking match…';
      try {
        const ownTable = report.reportTable || reportSide + (isPerson ? '_people' : '_items');
        const contact = DB.isBackendReady
          ? await DB.verifyMatchContact(ownTable, report.id, counterpart.id)
          : counterpart.contact;
        contactSlot.replaceChildren(
          el('div', { class: 'contact-box' },
            'Contact: ' + (contact || 'No contact provided')
          )
        );
      } catch (error) {
        console.error('Could not verify match contact:', error);
        toast('Could not verify this match. Please try again.');
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify further and contact reporter';
      }
    }
  }, 'Verify further and contact reporter');
  contactSlot.appendChild(verifyBtn);
  panel.push(contactSlot);

  if (!isPerson && reportSide === 'found') {
    panel.push(el('button', {
      type: 'button',
      class: 'btn btn-orange btn-block',
      onclick: () => showPickup(found.id)
    }, 'Arrange pickup'));
  } else {
    panel.push(el('div', { class: 'notice' }, 'Stay in a public place or take the person to police or staff.'));
  }

  panel.push(el('button', { type: 'button', class: 'btn btn-outline btn-block', onclick: closeOverlay }, 'Close'));
  openOverlay(...panel);
}

function showPickup(foundId) {
  const options = ['Hotel front desk', 'Station lost-property office', 'Public meeting place'];
  let chosen = null;

  const radios = options.map((opt) =>
    el('label', { class: 'radio-option' },
      el('input', {
        type: 'radio',
        name: 'pickup_option',
        value: opt,
        onchange: () => { chosen = opt; }
      }),
      opt
    )
  );

  const placeInput = el('input', { id: 'pickup-place', type: 'text', placeholder: 'e.g. Grand Central, Main Concourse clock' });
  const saveBtn = el('button', { type: 'button', class: 'btn btn-block' }, 'Save pickup choice');

  saveBtn.addEventListener('click', async () => {
    if (!chosen) {
      toast('Please choose a pickup option.');
      return;
    }
    saveBtn.disabled = true;
    showLoading(true);
    try {
      const ok = await DB.updatePickup(foundId, chosen, placeInput.value.trim());
      if (ok) {
        toast('Pickup saved.');
        closeOverlay();
      }
    } catch (e) {
      console.error('showPickup failed:', e);
      toast('Could not save the pickup choice.');
    } finally {
      showLoading(false);
      saveBtn.disabled = false;
    }
  });

  openOverlay(
    el('h2', null, 'Arrange pickup'),
    ...radios,
    el('label', { htmlFor: 'pickup-place' }, 'Pickup place'),
    placeInput,
    saveBtn,
    el('button', { type: 'button', class: 'btn btn-outline btn-block', onclick: closeOverlay }, 'Close')
  );
}