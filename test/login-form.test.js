import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { acceptCookies, completeLoginForm } from '../continente-auto-login.js';

// Exercise browser visibility, form submission and delayed stage changes without
// contacting Continente or loading account credentials.
for (const challenge of [false, true]) {
  test(`login completes ${challenge ? 'the native verification challenge' : 'the direct password flow'}`, async (t) => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent(`
      <form hidden>
        <input id="userNameCC" type="email">
        <input id="password_input" type="password">
        <button type="submit">Avançar</button>
      </form>
      <form id="login">
        <input name="userNameCC" type="email">
        <div id="verification"></div>
        <button type="submit" name="help">Precisa de ajuda?</button>
        <button type="submit">Avançar</button>
      </form>
      <script>
        window.loginState = { emailSubmissions: 0, passwordSubmissions: 0, helpSubmissions: 0, checks: 0, prematureSubmissions: 0 };
        let verified = false;
        const form = document.querySelector('#login');
        form.addEventListener('submit', event => {
          event.preventDefault();
          if (event.submitter?.name === 'help') {
            window.loginState.helpSubmissions++;
            return;
          }
          window.loginState.emailSubmissions++;
          window.loginState.email = form.querySelector('input[type="email"]').value;
          if (${challenge} && !verified) {
            const verification = document.querySelector('#verification');
            if (verification.childElementCount) {
              window.loginState.prematureSubmissions++;
              return;
            }
            setTimeout(() => {
              verification.innerHTML = '<div class="altcha"><label><input type="checkbox" id="altcha_checkbox_fixture"><span>Não sou um robô</span></label></div>';
              verification.querySelector('input').addEventListener('change', () => {
                window.loginState.checks++;
                verification.querySelector('span').textContent = 'A verificar...';
                setTimeout(() => {
                  verified = true;
                  verification.querySelector('span').textContent = 'Verificado';
                }, 250);
              });
            }, 100);
            return;
          }
          // The site keeps earlier stages in the DOM during the transition.
          form.hidden = true;
          setTimeout(() => {
            const passwordForm = document.createElement('form');
            passwordForm.innerHTML = '<input name="password" type="password"><button type="submit" name="help">Precisa de ajuda?</button><button type="submit">Avançar</button>';
            passwordForm.addEventListener('submit', event => {
              event.preventDefault();
              if (event.submitter?.name === 'help') {
                window.loginState.helpSubmissions++;
                return;
              }
              window.loginState.passwordSubmissions++;
              window.loginState.password = passwordForm.querySelector('input').value;
            });
            document.body.append(passwordForm);
          }, 100);
        });
      </script>
    `);

    await completeLoginForm(page.mainFrame(), {
      email: 'synthetic@example.invalid',
      password: 'synthetic-password',
      log: () => {},
    });

    assert.deepEqual(await page.evaluate(() => window.loginState), {
      emailSubmissions: challenge ? 2 : 1,
      passwordSubmissions: 1,
      helpSubmissions: 0,
      checks: challenge ? 1 : 0,
      prematureSubmissions: 0,
      email: 'synthetic@example.invalid',
      password: 'synthetic-password',
    });
  });
}

test('cookie consent retries a click that did not dismiss the banner', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  await page.setContent(`
    <div id="cookie-banner"><button>Permitir todos</button></div>
    <script>
      window.consentClicks = 0;
      document.querySelector('button').addEventListener('click', () => {
        window.consentClicks++;
        if (window.consentClicks === 2) document.querySelector('#cookie-banner').remove();
      });
    </script>
  `);

  await acceptCookies(page);

  assert.equal(await page.evaluate(() => window.consentClicks), 2);
  assert.equal(await page.locator('#cookie-banner').count(), 0);
});
