import { chromium } from 'playwright';

const CONTINENTE_LOGIN_URL = 'https://login.continente.pt/u/login?clientId=NLR6WHyO8Iba4eRS&lang=pt-PT';
const CONTINENTE_MAIN = 'https://www.continente.pt';
const SESSION_DIR = `${process.env.HOME}/.continente`;

export class Authenticator {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.cookies = [];
  }

  async ensureBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        locale: 'pt-PT'
      });
      // Load existing cookies if available
      await this.loadCookies();
    }
    if (!this.page) {
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  getCookiesPath() {
    return `${SESSION_DIR}/session.json`;
  }

  async saveCookies() {
    const fs = await import('fs');
    try {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    } catch (e) {}
    const cookies = await this.context.cookies();
    fs.writeFileSync(this.getCookiesPath(), JSON.stringify(cookies, null, 2));
  }

  async loadCookies() {
    const fs = await import('fs');
    try {
      const data = fs.readFileSync(this.getCookiesPath(), 'utf8');
      const cookies = JSON.parse(data);
      if (cookies.length > 0) {
        await this.context.addCookies(cookies);
        this.cookies = cookies;
      }
    } catch (e) {
      // No cookies yet
    }
  }

  async isLoggedIn() {
    try {
      const page = await this.ensureBrowser();
      await page.goto(CONTINENTE_MAIN, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Look for the account/logged-in state
      const loginLink = await page.$('a[href*="logout"], a[href*="sair"], [class*="user"], [class*="account"]');
      const pageContent = await page.content();
      // If we see a logged-in indicator (e.g., user name in header)
      const isLogged = pageContent.includes('data-testid="user"') || 
                       pageContent.includes('class="logged-in') ||
                       pageContent.includes('bjzIjUWquR'); // some session marker
      return false; // Conservative - always try to re-auth for now
    } catch (e) {
      return false;
    }
  }

  async login(email, password) {
    const fs = await import('fs');
    try { fs.mkdirSync(SESSION_DIR, { recursive: true }); } catch (e) {}
    
    const page = await this.ensureBrowser();
    
    console.error(`[Auth] Starting login flow for ${email}`);
    
    // Go to login page
    await page.goto(CONTINENTE_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Step 1: Enter email
    console.error('[Auth] Step 1: Entering email...');
    const emailInput = await page.waitForSelector('input[type="email"], input[type="text"]', { timeout: 10000 }).catch(() => null);
    if (!emailInput) {
      throw new Error('Could not find email input field');
    }
    
    await emailInput.fill(email);
    await page.waitForTimeout(500);
    
    // Click continue/next
    const continueBtn = await page.waitForSelector('button[type="submit"], button:has-text("Avançar"), button:has-text("Continuar")', { timeout: 5000 }).catch(() => null);
    if (continueBtn) {
      await continueBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    
    await page.waitForTimeout(2000);
    
    // Step 2: Enter password
    console.error('[Auth] Step 2: Entering password...');
    const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(() => null);
    if (!passwordInput) {
      // Maybe already logged in or different flow
      const currentUrl = page.url();
      console.error(`[Auth] No password field found. Current URL: ${currentUrl}`);
      throw new Error('Password field not found - login flow may have changed');
    }
    
    await passwordInput.fill(password);
    await page.waitForTimeout(500);
    
    // Submit
    const submitBtn = await page.waitForSelector('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")', { timeout: 5000 }).catch(() => null);
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    
    // Wait for redirect to main site
    await page.waitForTimeout(3000);
    await page.waitForURL(/continente\.pt/, { timeout: 15000 }).catch(() => {});
    
    const finalUrl = page.url();
    console.error(`[Auth] Final URL after login: ${finalUrl}`);
    
    // Save session cookies
    await this.saveCookies();
    this.cookies = await this.context.cookies();
    
    console.error(`[Auth] Login successful, ${this.cookies.length} cookies saved`);
    
    return { success: true, url: finalUrl, cookies: this.cookies.length };
  }

  async logout() {
    const fs = await import('fs');
    if (this.page) {
      try {
        await this.page.goto(`${CONTINENTE_MAIN}/logout`, { timeout: 5000 }).catch(() => {});
      } catch (e) {}
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    // Remove saved cookies
    try { fs.unlinkSync(this.getCookiesPath()); } catch (e) {}
    console.error('[Auth] Logged out, session cleared');
  }

  async getSessionCookies() {
    if (!this.context && !this.browser) {
      await this.ensureBrowser();
    }
    return this.context ? await this.context.cookies() : [];
  }

  async close() {
    if (this.page) { try { await this.page.close(); } catch (e) {} this.page = null; }
    if (this.context) { try { await this.context.close(); } catch (e) {} this.context = null; }
    if (this.browser) { try { await this.browser.close(); } catch (e) {} this.browser = null; }
  }
}
