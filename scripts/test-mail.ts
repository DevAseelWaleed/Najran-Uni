// Decode SMTP transport formatting before assertions on generated HTML.
export function decodeTestMail(raw: string) {
  const split = raw.search(/\r?\n\r?\n/);
  const headers = raw.slice(0, split);
  const body = raw.slice(split).trimStart();
  if (/Content-Transfer-Encoding:\s*base64/i.test(headers))
    return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
  return body.replace(/=\r?\n/g, '').replace(/=([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
