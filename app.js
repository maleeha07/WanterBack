// C:\lost_and_found\app.js
let currentTab = 'home';

function renderTab(name) {
  const target = document.getElementById('view-' + name);
  try {
    if (name === 'home') {
      renderHome();
    } else if (name === 'people') {
      renderPeopleHome();
    } else if (name === 'account') {
      renderAccount();
    } else if (name === 'lost' || name === 'found') {
      if (typeof renderReportForm === 'function') {
        renderReportForm(name).catch((e) => {
          console.error('renderReportForm failed:', name, e);
          toast('Could not open the report form.');
        });
      } else {
        target.replaceChildren(el('p', { class: 'empty' }, 'This form is not built yet.'));
      }
    }
  } catch (e) {
    console.error('renderTab failed:', name, e);
    toast('Something went wrong. Press F12 and check the Console.');
  }
}

function resizeMap() {
  setTimeout(() => {
    if (typeof homeMap !== 'undefined' && homeMap) homeMap.invalidateSize();
  }, 120);
}

function showTab(name) {
  currentTab = name;
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('active', v.id === 'view-' + name);
  });
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
    if (t.dataset.tab === name) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  closeOverlay();
  renderTab(name);
  if (name === 'home') resizeMap();
  window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => showTab(t.dataset.tab));
  });
  window.addEventListener('resize', resizeMap);
  document.addEventListener('wanderback-auth-change', () => {
    if (currentTab === 'account') renderAccount();
  });
  showTab('home');
});