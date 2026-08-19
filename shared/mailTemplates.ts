export type MailTemplateId = 'klant' | 'leads'

export type MailTemplate = {
  id: MailTemplateId
  label: string
  subject: string
  html: string
}

export const MAIL_PLACEHOLDERS = [
  { key: '{{naam}}', beschrijving: 'Naam van de klant' },
  { key: '{{woonplaats}}', beschrijving: 'Woonplaats' },
  { key: '{{email}}', beschrijving: 'E-mailadres van de klant' },
  { key: '{{product}}', beschrijving: 'Gekozen deur / productnaam' },
  { key: '{{kleur}}', beschrijving: 'Gekozen kleur' },
  { key: '{{montagetype}}', beschrijving: 'Gekozen montagetype' },
  { key: '{{prijsindicatie}}', beschrijving: 'ja / nee' },
  { key: '{{bron}}', beschrijving: 'mail of offerte' },
  {
    key: '{{visualiseerUrl}}',
    beschrijving: 'Link terug naar de visualisator',
  },
] as const

export const DEFAULT_MAIL_TEMPLATES: MailTemplate[] = [
  {
    id: 'klant',
    label: 'Mail naar de klant',
    subject: 'Uw deurvisualisatie — {{product}}',
    html: [
      '<p>Beste {{naam}},</p>',
      '<p>Hierbij uw visualisatie van <strong>{{product}}</strong> in <strong>{{kleur}}</strong>.</p>',
      '<p>Montagetype: {{montagetype}}.<br/>Woonplaats: {{woonplaats}}.</p>',
      '{{#prijsindicatie}}<p>U heeft aangegeven interesse te hebben in een prijsindicatie. Wij nemen zo snel mogelijk contact met u op.</p>{{/prijsindicatie}}',
      '<p>Klopt de visualisatie niet helemaal? <a href="{{visualiseerUrl}}">Visualiseer opnieuw</a>.</p>',
      '<p>Met vriendelijke groet,<br/>Simon Maree</p>',
    ].join('\n'),
  },
  {
    id: 'leads',
    label: 'Interne lead-mail',
    subject: 'Visualisatie-aanvraag ({{bron}}) — {{naam}} · {{woonplaats}}',
    html: [
      '<p>Nieuwe aanvraag via de deurvisualisator.</p>',
      '<p><strong>Klant</strong><br/>',
      'Naam: {{naam}}<br/>',
      'Woonplaats: {{woonplaats}}<br/>',
      'E-mail: {{email}}</p>',
      '<p><strong>Keuzes</strong><br/>',
      'Product: {{product}}<br/>',
      'Kleur: {{kleur}}<br/>',
      'Montagetype: {{montagetype}}<br/>',
      'Prijsindicatie: {{prijsindicatie}}<br/>',
      'Bron: {{bron}}</p>',
      '<p>Bijlagen: visualisatie + originele kamerfoto van de klant.</p>',
    ].join('\n'),
  },
]

export type TemplateVars = {
  naam: string
  woonplaats: string
  email: string
  product: string
  kleur: string
  montagetype: string
  prijsindicatie: boolean
  bron: 'mail' | 'offerte'
  visualiseerUrl: string
}

/** Eenvoudige placeholders + optioneel {{#prijsindicatie}}…{{/prijsindicatie}} blok. */
export function applyMailTemplate(
  template: string,
  vars: TemplateVars,
): string {
  let out = template
  out = out.replace(
    /\{\{#prijsindicatie\}\}([\s\S]*?)\{\{\/prijsindicatie\}\}/g,
    (_, block: string) => (vars.prijsindicatie ? block : ''),
  )
  const map: Record<string, string> = {
    '{{naam}}': vars.naam,
    '{{woonplaats}}': vars.woonplaats,
    '{{email}}': vars.email,
    '{{product}}': vars.product,
    '{{kleur}}': vars.kleur,
    '{{montagetype}}': vars.montagetype,
    '{{prijsindicatie}}': vars.prijsindicatie ? 'ja' : 'nee',
    '{{bron}}': vars.bron,
    '{{visualiseerUrl}}': vars.visualiseerUrl,
  }
  for (const [key, value] of Object.entries(map)) {
    out = out.split(key).join(value)
  }
  return out
}
