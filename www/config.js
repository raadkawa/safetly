// Safetly – innstillinger for ditt nabolag.
// Fyll inn Supabase-adressen og den offentlige "anon"-nøkkelen (Project Settings → API).
// Står de tomme, starter appen i demomodus der alt lagres bare på denne enheten.
window.SAFETLY_CONFIG = {
  supabaseUrl: 'https://ptbyychbijspnchxtkzd.supabase.co',
  supabaseAnonKey: 'sb_publishable_YegwXskzMXgvwvgQANncxg_74y908U8',

  // Adressen der nettappen ligger (brukes i lenker i e-post om bekreftelse og nytt passord).
  // La stå tom for å bruke adressen appen åpnes fra.
  siteUrl: 'https://raadkawa.github.io/safetly/',

  neighborhood: 'Nabolaget',
  meetingPlace: {
    name: 'Nærbutikken ved Torget',
    address: 'Storgata 12',
    note: 'Møt opp 10 minutter før vakt. Vester og lykter ligger i kassen bak disken.'
  }
};
