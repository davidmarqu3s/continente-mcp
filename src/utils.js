export function normalizeCookies(cookies) {
  return cookies
    .filter(c => c.name && c.name !== 'undefined')
    .map(c => {
      const n = {
        name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
        httpOnly: Boolean(c.httpOnly), secure: Boolean(c.secure),
        sameSite: (!c.sameSite || c.sameSite === 'unspecified') ? 'Lax'
          : c.sameSite === 'no_restriction' ? 'None'
          : c.sameSite.charAt(0).toUpperCase() + c.sameSite.slice(1).toLowerCase()
      };
      if (c.expires != null) n.expires = Number(c.expires);
      return n;
    });
}
