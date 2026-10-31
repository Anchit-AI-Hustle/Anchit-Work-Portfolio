// No em dashes in anything a visitor reads.
//
// The site's own copy carries none (scripts/no-em-dash.js holds that line on
// the built tree), but model replies are written at request time and models
// reach for the em dash constantly. Every route that returns generated text
// passes its body through here, so the rule holds for AI output as well.
// A range between two numbers reads as "to"; anything else becomes a comma.
function noDash(v) {
  if (typeof v === 'string') {
    if (v.indexOf('—') < 0) return v;
    return v
      .replace(/(\d[%kKmMLx×]?)\s*—\s*(?=[₹$£]?\d)/g, '$1 to ')
      .replace(/([.:;!?])\s*—\s*/g, '$1 ')
      .replace(/(^|\n)[ \t]*—[ \t]*/g, '$1')
      .replace(/\s*—\s*/g, ', ');
  }
  if (Array.isArray(v)) return v.map(noDash);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = noDash(v[k]);
    return out;
  }
  return v;
}

// Wrap res.json so every JSON body a handler sends is cleaned on the way out.
function dedashResponse(res) {
  if (res && typeof res.json === 'function' && !res.__noDash) {
    const send = res.json.bind(res);
    res.json = (body) => send(noDash(body));
    res.__noDash = true;
  }
  return res;
}

module.exports = { noDash, dedashResponse };
