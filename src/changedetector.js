import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as cheerio from 'cheerio';

const STATE_DIR = `${process.env.HOME}/.continente`;

export class ChangeDetector {
  constructor() {
    this.statePath = join(STATE_DIR, 'fingerprint.json');
  }

  getStatePath() {
    return this.statePath;
  }

  /**
   * Extract structural fingerprint from HTML — ignores prices/text that change
   * but captures the DOM structure (tags, class patterns, attribute presence)
   */
  extractFingerprint(html) {
    const $ = cheerio.load(html);
    
    // Remove dynamic content
    $('script, style, noscript, iframe, svg').remove();
    $('[class*="analytics"], [class*="tracking"], [data-datalayer]').remove();
    
    // Get structural signature: count of key element types + class patterns
    const structure = {
      forms: $('form').length,
      inputs: $('input').length,
      buttons: $('button').length,
      links: $('a[href*="/produto/"]').length,
      productCards: $('[class*="product"], [class*="card"]').filter((i, el) => {
        return $(el).find('a[href*="/produto/"]').length > 0 || $(el).text().includes('€');
      }).length,
      priceElements: $('[class*="price"], .product-price, [data-price]').length,
      searchInput: $('input[type="search"], input[name*="search"], input[placeholder*="Pesquisar"]').length,
      productGrid: $('[class*="grid"], [class*="listing"], [class*="results"]').length,
      // Get CSS class prefixes (ignoring specific names like "product-123")
      classPrefixes: [...new Set(
        $('[class]').map((i, el) => {
          const cls = $(el).attr('class') || '';
          return cls.split(' ').map(c => c.replace(/-\d+/g, '-X').replace(/[a-z]+\d+$/gi, c.match(/[a-z]+/i)?.[0] + 'X')).join(' ');
        }).get()
      )].filter(Boolean).slice(0, 50),
    };
    
    // Hash of structure
    const hash = createHash('sha256')
      .update(JSON.stringify(structure))
      .digest('hex')
      .substring(0, 16);
    
    return {
      structure,
      hash,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if a URL's content has changed structurally
   */
  async checkUrl(url, headers = {}) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
        ...headers
      }
    });
    const html = await response.text();
    return this.extractFingerprint(html);
  }

  /**
   * Save current state as baseline
   */
  async saveBaseline(html, label = 'default') {
    const fingerprint = this.extractFingerprint(html);
    const state = {
      label,
      savedAt: new Date().toISOString(),
      fingerprint
    };
    
    try {
      const { mkdirSync } = await import('fs');
      mkdirSync(STATE_DIR, { recursive: true });
    } catch (e) {}
    
    writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    return fingerprint;
  }

  /**
   * Compare current HTML against saved baseline
   */
  compare(html) {
    if (!existsSync(this.statePath)) {
      return { changed: null, reason: 'No baseline saved yet' };
    }
    
    try {
      const saved = JSON.parse(readFileSync(this.statePath, 'utf8'));
      const current = this.extractFingerprint(html);
      
      const savedHash = saved.fingerprint?.hash;
      const currentHash = current.hash;
      
      if (savedHash === currentHash) {
        return { changed: false, saved: saved.fingerprint, current };
      }
      
      // Report what changed
      const savedStr = saved.fingerprint?.structure || {};
      const currentStr = current.structure || {};
      
      const differences = {};
      for (const key of Object.keys(savedStr)) {
        if (JSON.stringify(savedStr[key]) !== JSON.stringify(currentStr[key])) {
          differences[key] = { before: savedStr[key], after: currentStr[key] };
        }
      }
      
      return {
        changed: true,
        saved: saved.fingerprint,
        current,
        differences,
        savedAt: saved.savedAt
      };
    } catch (e) {
      return { changed: null, reason: e.message };
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    if (!existsSync(this.statePath)) {
      return { hasBaseline: false };
    }
    try {
      const saved = JSON.parse(readFileSync(this.statePath, 'utf8'));
      return {
        hasBaseline: true,
        savedAt: saved.savedAt,
        label: saved.label,
        hash: saved.fingerprint?.hash
      };
    } catch (e) {
      return { hasBaseline: false, error: e.message };
    }
  }
}
