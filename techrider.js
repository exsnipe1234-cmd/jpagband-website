const storageKey = 'jpag-private-tech-rider-v1';
const form = document.getElementById('rider-form');
const fields = [...form.querySelectorAll('input, textarea')];
const stored = JSON.parse(localStorage.getItem(storageKey)) || {};

fields.forEach(field => {
  field.value = stored[field.id] || '';
  field.addEventListener('input', () => {
    const values = Object.fromEntries(fields.map(entry => [entry.id, entry.value]));
    localStorage.setItem(storageKey, JSON.stringify(values));
    document.getElementById('save-status').textContent = 'Saved locally';
  });
});

document.getElementById('print-rider').addEventListener('click', () => window.print());
