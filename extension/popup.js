document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-open-wa');
  btn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://web.whatsapp.com' });
  });
});
