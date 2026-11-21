// Safetly – standard vaktområde og sjekkpunkter.
// Dette er utgangspunktet. Koordinatorer kan endre grensen og sjekkpunktene i appen (Info → Vaktområde → Rediger kart),
// og det de lagrer der brukes i stedet for denne fila.
// Koordinater: [breddegrad, lengdegrad]. Hentet fra OpenStreetMap.
window.SAFETLY_OMRADE = {
  name: 'Byåsen skole – Hallset',
  // Grensen går rundt Byåsen skole, Bøckmans veg, Skjermvegen, Selsbakkvegen og Hallset (Selsbakk og Hallset skole, Rema 1000 og 3T).
  area: [
    [63.39665, 10.35344], [63.39365, 10.35699], [63.39216, 10.35962], [63.39201, 10.36126],
    [63.39168, 10.37694], [63.39206, 10.37783], [63.3933, 10.3789], [63.40198, 10.38314],
    [63.40206, 10.38113], [63.39884, 10.35684], [63.39844, 10.35573], [63.39782, 10.35468]
  ],
  // Oppmøtestedet på kartet (navnet hentes fra oppmøtestedet under Info).
  meet: { lat: 63.39437, lng: 10.3692 },
  // Sjekkpunkter i den rekkefølgen runden går.
  checkpoints: [
    { id: 'cp1', name: 'Hallset skole', note: 'Skolegården og ballbingen', lat: 63.39232, lng: 10.36741 },
    { id: 'cp2', name: 'Selsbakk skole', note: 'Skolegården', lat: 63.39347, lng: 10.36778 },
    { id: 'cp3', name: '3T Byåsen', note: 'Inngangen og parkeringsplassen', lat: 63.39456, lng: 10.36562 },
    { id: 'cp4', name: 'Byåsen skole', note: 'Skolegården og fotballbanen', lat: 63.39899, lng: 10.36042 },
    { id: 'cp5', name: 'Skjermvegen', note: 'Ved Rognheim', lat: 63.39912, lng: 10.375 }
  ]
};
