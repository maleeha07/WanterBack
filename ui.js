const PLACES = [
  { name: 'Grand Central Terminal', type: 'Subway', lat: 40.7527, lng: -73.9772 },
  { name: 'Penn Station', type: 'Subway', lat: 40.7507, lng: -73.9936 },
  { name: 'Times Square', type: 'Landmark', lat: 40.758, lng: -73.9855 },
  { name: 'Central Park', type: 'Landmark', lat: 40.7829, lng: -73.9654 },
  { name: 'John F. Kennedy Airport', type: 'Airport', lat: 40.6413, lng: -73.7781 },
  { name: 'Other location', type: 'Other', lat: 40.7527, lng: -73.9772 }
];

let loadingCount = 0;
let toastTimer = null;

function el(tagName, attributes, ...children) {
  const node = document.createElement(tagName);
  if (attributes) {
    Object.entries(attributes).forEach(([name, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (name === 'style' && typeof value === 'object') {
        Object.entries(value).forEach(([property, styleValue]) => {
          node.style[property] = styleValue;
        });
      } else if (name.startsWith('on') && typeof value === 'function') {
        node.addEventListener(name.slice(2).toLowerCase(), value);
      } else if (name === 'class') {
        node.className = value;
      } else if (name === 'htmlFor') {
        node.htmlFor = value;
      } else if (name in node && name !== 'role' && !name.startsWith('aria-') && !name.startsWith('data-')) {
        node[name] = value;
      } else {
        node.setAttribute(name, value === true ? '' : String(value));
      }
    });
  }

  const append = (child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(append);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  };
  children.forEach(append);
  return node;
}

function toast(message) {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 3200);
}

function showLoading(show) {
  const element = document.getElementById('loading');
  if (!element) return;
  loadingCount = show ? loadingCount + 1 : Math.max(0, loadingCount - 1);
  const visible = loadingCount > 0;
  element.classList.toggle('show', visible);
  element.setAttribute('aria-hidden', String(!visible));
}

function tripBadge(row) {
  if (!row.trip_end_date) return null;
  const parts = row.trip_end_date.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const endDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((endDate.getTime() - today.getTime()) / 86400000);
  if (days < 0) return null;
  const label = days === 0 ? 'Leaving today' : days === 1 ? 'Leaving tomorrow' : 'Leaving in ' + days + ' days';
  return el('span', { class: 'badge ' + (days <= 2 ? 'badge-urgent' : 'badge-trip') }, label);
}

function getGPS() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Location is not supported by this browser.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function compressImage(file) {
  if (!(file instanceof Blob) || !file.type.startsWith('image/')) {
    return Promise.reject(new Error('Select a valid image file.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not process this image.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not compress this image.'));
      }, 'image/jpeg', 0.84);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read this image.'));
    };
    image.src = objectUrl;
  });
}