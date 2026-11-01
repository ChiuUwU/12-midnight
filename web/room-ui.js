/* Presentation-only room summaries. No API, stored game state or rules are accessed. */
(() => {
  'use strict';
  const app = document.querySelector('#app');
  if (!app) return;
  let roomId = '';
  const expanded = new Set();
  app.addEventListener('toggle', event => {
    const details = event.target;
    if (!details.matches?.('details.room-info') || !app.contains(details)) return;
    details.open ? expanded.add(details.dataset.roomInfo) : expanded.delete(details.dataset.roomInfo);
  }, true);
  function refreshRoomLayout() {
    const isRoom = Boolean(app.querySelector('[data-action="choose-seat"]'));
    const pageTitle = app.querySelector('.page-title')?.textContent.trim() || '';
    const isNight = /^第\s*\d+\s*夜$/.test(pageTitle) || pageTitle === '夜间流程';
    app.classList.toggle('room-compact', isRoom || isNight);
    app.classList.toggle('night-compact', isNight);
    if (isNight) {
      const panels = [...app.querySelectorAll(':scope > section.panel')];
      const operations = panels.find(panel => panel.querySelector(':scope > .label')?.textContent.trim() === '本步操作');
      const history = panels.find(panel => panel.querySelector(':scope > .label')?.textContent.trim() === '已记录');
      if (operations && history && operations.nextElementSibling !== history) operations.after(history);
    }
    if (!isRoom) return;
    const nextRoomId = app.querySelector('.page-title')?.textContent || '';
    if (nextRoomId !== roomId) { expanded.clear(); roomId = nextRoomId; }
    for (const panel of app.querySelectorAll(':scope > section.panel')) {
      const label = panel.querySelector(':scope > .label') || panel.querySelector(':scope > .row .label');
      const title = label?.textContent.trim() || '';
      const key = ['当前座位', '当前身份', '上警玩家', '公开死亡', '白天放逐'].find(name => title === name || title.startsWith(name + ' ·'));
      if (!key) continue;
      const details = document.createElement('details');
      details.className = 'panel room-info';
      details.dataset.roomInfo = key;
      const summary = document.createElement('summary');
      const heading = document.createElement('strong');
      const value = document.createElement('span');
      heading.textContent = title;
      value.textContent = ['当前座位', '当前身份'].includes(key)
        ? [...panel.querySelectorAll('.row .value')].map(node => node.textContent.trim()).join(' · ')
        : panel.querySelector(':scope > .body-text')?.textContent.trim() || '';
      summary.append(heading, value);
      const content = document.createElement('div');
      content.className = 'room-info-content';
      // Keep the original nodes and all their attributes/listeners intact.
      const hasAction = Boolean(panel.querySelector('button, input, select'));
      while (panel.firstChild) content.append(panel.firstChild);
      details.append(summary, content);
      details.open = expanded.has(key) || hasAction;
      panel.replaceWith(details);
    }
  }
  new MutationObserver(refreshRoomLayout).observe(app, { childList: true });
  refreshRoomLayout();
})();
