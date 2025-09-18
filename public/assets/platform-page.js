(function(){
  const platform = document.body?.dataset?.platform;
  if (!platform) return;

  function syncFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const siteId = params.get('site');
    const siteName = params.get('siteName');
    if (siteId) {
      localStorage.setItem(`currentSiteId:${platform}`, siteId);
    }
    if (siteName) {
      localStorage.setItem(`currentSiteName:${platform}`, siteName);
    }
  }

  function updatePageContext() {
    const currentSiteEl = document.getElementById('currentSite');
    const headingEl = document.querySelector('[data-platform-heading]');
    const titleEl = document.getElementById('pageTitle');

    const siteName = localStorage.getItem(`currentSiteName:${platform}`);
    const siteId = localStorage.getItem(`currentSiteId:${platform}`);
    const displayName = siteName || siteId;

    if (currentSiteEl && displayName) {
      currentSiteEl.textContent = displayName;
    }

    if (headingEl) {
      const base = headingEl.dataset.platformHeading || headingEl.textContent.trim();
      headingEl.textContent = displayName ? `${displayName} - ${base}` : base;
    }

    if (titleEl) {
      const label = document.body?.dataset?.platformLabel || platform;
      const prefix = displayName ? `${displayName} - ` : '';
      const titleText = `${prefix}${label} 数据分析 - 跨境电商数据分析平台`;
      document.title = titleText;
      titleEl.textContent = titleText;
    }
  }

  syncFromQuery();
  updatePageContext();

  document.addEventListener('menus-updated', updatePageContext);
  window.addEventListener('storage', event => {
    if (!event.key) return;
    if (event.key === `currentSiteName:${platform}` || event.key === `currentSiteId:${platform}`) {
      updatePageContext();
    }
  });
})();
