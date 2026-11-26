// Fyller inn kontaktinfo på personvern- og støttesidene fra ett sted: www/kontakt.js
(function () {
  var k = window.SAFETLY_KONTAKT || {};
  document.querySelectorAll('[data-felt]').forEach(function (el) {
    var f = el.getAttribute('data-felt');
    if (f === 'epost-lenke' && k.epost) el.setAttribute('href', 'mailto:' + k.epost);
    else if (f === 'epost' && k.epost) el.textContent = k.epost;
    else if (f === 'ansvarlig' && k.ansvarlig) el.textContent = k.ansvarlig;
    else if (f === 'oppdatert' && k.oppdatert) el.textContent = k.oppdatert;
  });
})();
