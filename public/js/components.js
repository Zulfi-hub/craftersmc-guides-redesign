/**
 * CraftersMC Guides — Reusable Component Loader
 * Provides unified <cmc-header>, <cmc-sidebar>, and <cmc-footer> custom elements.
 */

(function () {
  'use strict';

  // Cache duration: 5 minutes in sessionStorage
  const CACHE_PREFIX = 'cmc_comp_';
  const CACHE_VERSION = 'v2_';

  async function loadComponentHtml(name) {
    const cacheKey = `${CACHE_PREFIX}${CACHE_VERSION}${name}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const res = await fetch(`/components/${name}.html`);
      if (!res.ok) throw new Error(`Failed to load ${name} component: ${res.status}`);
      const html = await res.text();
      sessionStorage.setItem(cacheKey, html);
      return html;
    } catch (err) {
      console.warn(`[CMC Components] Falling back for ${name}:`, err.message);
      return '';
    }
  }

  // Determine current active page identifier
  function getCurrentPageSlug() {
    const path = window.location.pathname.toLowerCase();
    const filename = path.split('/').pop().replace('.html', '') || 'index';
    return filename;
  }

  // Highlight active links in sidebar & header
  function setActiveLinks(container, activeOverride) {
    const currentSlug = activeOverride || getCurrentPageSlug();
    const links = container.querySelectorAll('a[href], a[data-nav]');

    links.forEach(a => {
      const href = a.getAttribute('href') || '';
      const navTag = a.getAttribute('data-nav') || '';
      const hrefSlug = href.split('/').pop().replace('.html', '').split('#')[0] || 'index';

      if (navTag === currentSlug || hrefSlug === currentSlug || (currentSlug === '' && hrefSlug === 'index')) {
        a.classList.add('active');
        if (a.closest('.sidebar-nav-item')) {
          a.closest('.sidebar-nav-item').classList.add('active');
        }
      }
    });
  }

  // Setup mobile sidebar menu toggle & backdrop
  function initMobileMenu(headerContainer, sidebarContainer) {
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');

    if (!mobileBtn || !sidebar) return;

    // Create backdrop overlay if not already present
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    function toggleMobileSidebar() {
      const isOpen = sidebar.classList.contains('mobile-open');
      sidebar.classList.toggle('mobile-open', !isOpen);
      backdrop.classList.toggle('active', !isOpen);
      document.body.classList.toggle('sidebar-locked', !isOpen);
    }

    function closeMobileSidebar() {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('active');
      document.body.classList.remove('sidebar-locked');
    }

    // Avoid duplicate event bindings
    mobileBtn.onclick = (e) => {
      e.stopPropagation();
      toggleMobileSidebar();
    };

    backdrop.onclick = closeMobileSidebar;

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        closeMobileSidebar();
      }
    });
  }

  // Define Web Components
  class CMCHeader extends HTMLElement {
    async connectedCallback() {
      const html = await loadComponentHtml('header');
      if (html) {
        this.innerHTML = html;
        setActiveLinks(this, this.getAttribute('active'));
        initMobileMenu();
      }
    }
  }

  class CMCSidebar extends HTMLElement {
    async connectedCallback() {
      const html = await loadComponentHtml('sidebar');
      if (html) {
        this.innerHTML = html;
        setActiveLinks(this, this.getAttribute('active'));
        initMobileMenu();
      }
    }
  }

  class CMCFooter extends HTMLElement {
    async connectedCallback() {
      const html = await loadComponentHtml('footer');
      if (html) {
        this.innerHTML = html;
      }
    }
  }

  // Register Custom Elements
  if (!customElements.get('cmc-header')) {
    customElements.define('cmc-header', CMCHeader);
  }
  if (!customElements.get('cmc-sidebar')) {
    customElements.define('cmc-sidebar', CMCSidebar);
  }
  if (!customElements.get('cmc-footer')) {
    customElements.define('cmc-footer', CMCFooter);
  }

  // Fallback for data-include attributes (e.g. <div data-include="sidebar"></div>)
  document.addEventListener('DOMContentLoaded', async () => {
    const includes = document.querySelectorAll('[data-include]');
    for (const el of includes) {
      const name = el.getAttribute('data-include');
      const html = await loadComponentHtml(name);
      if (html) {
        el.innerHTML = html;
        setActiveLinks(el);
      }
    }
    initMobileMenu();
  });

})();
