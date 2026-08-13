import type { Product } from '../types/product'

/**
 * =============================================================================
 * PRODUCTEN — vul hier zelf deuren aan
 * =============================================================================
 *
 * Kopieer een blok hieronder en pas aan:
 * - id            unieke sleutel (geen spaties)
 * - naam          zoals in de catalogus
 * - afbeeldingUrl JPG/PNG-URL van simonmaree.nl (volledige https://… URL)
 *                 of een lokaal pad zoals /products/voorbeeld-deur.png
 * - montagetype   bepaalt in welke filter de deur verschijnt
 * - materiaal     hout | staal | aluminium
 * - collectie     voor de filterchips (Signature, Woods, …)
 * - kleuren       RAL-codes of textuurnamen (indicatief)
 *
 * Tip: plak een directe link naar de productfoto (.jpg/.png), niet de productpagina.
 * =============================================================================
 */

export const producten: Product[] = [
  {
    id: 'voordeur-eiken-vd1',
    naam: 'Eiken voordeur Afrormosia VD1',
    afbeeldingUrl:
      'https://www.simonmaree.nl/app/uploads/Simon-Maree-Deurenspecialist-Different-Doors-Eiken-Voordeur-Afrormosia-Verticale-Delen-VD1-3.jpg',
    montagetype: 'voordeur',
    materiaal: 'hout',
    collectie: 'Voordeuren',
    kleuren: ['Eiken Afrormosia', 'RAL 9010', 'RAL 9005'],
  },
  {
    id: 'jutta-kamerhoog-zwart',
    naam: 'Kamerhoog deurmodel Jutta Zwart',
    afbeeldingUrl:
      'https://www.simonmaree.nl/app/uploads/images/producten/binnendeuren/plafondhoge-deuren/Plafondhoge-deuren-Kamerhoog-Deurmodel-Jutta-Zwart.jpg',
    montagetype: 'deur-bestaand-kozijn',
    materiaal: 'hout',
    collectie: 'Plafondhoog',
    kleuren: ['RAL 9005', 'RAL 7021', 'RAL 9010'],
  },
  {
    id: 'jutta-kamerhoog-eiken',
    naam: 'Kamerhoog deurmodel Jutta Eiken',
    afbeeldingUrl:
      'https://www.simonmaree.nl/app/uploads/images/producten/binnendeuren/plafondhoge-deuren/Plafondhoge-deuren-Kamerhoog-Deurmodel-Jutta-Eiken.jpg',
    montagetype: 'deur-bestaand-kozijn',
    materiaal: 'hout',
    collectie: 'Plafondhoog',
    kleuren: ['Eiken natuurlijk', 'Eiken gerookt', 'RAL 9010'],
  },
]

export function getProductById(id: string): Product | undefined {
  return producten.find((p) => p.id === id)
}

export function collectiesVan(productenLijst: Product[]): string[] {
  return [...new Set(productenLijst.map((p) => p.collectie))].sort()
}
